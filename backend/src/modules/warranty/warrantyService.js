import Device from "../device/Device.js";
import {
  buildError,
  createLifecycleEvent,
  getActorName,
} from "../device/deviceService.js";
import {
  INVENTORY_STATES,
  SERVICE_STATES,
  WARRANTY_PROVIDERS,
  WARRANTY_STATUSES,
  addMonthsToDate,
  ensureIdentifierPolicySatisfied,
  getNormalizedLookupKeys,
  isSerializedConfig,
  isStoreWarrantyConfig,
  normalizeImei,
  normalizeSerialNumber,
  resolveAfterSalesConfigByProductId,
  validateIdentifierFormat,
} from "../device/afterSalesConfig.js";
import WarrantyRecord from "./WarrantyRecord.js";

const system = (query) => query.setOptions({ skipBranchIsolation: true });

export const normalizePhoneNumber = (value) => String(value || "").replace(/\D+/g, "");

const getCustomerPhoneFromOrder = (order = {}) =>
  String(order?.shippingAddress?.phoneNumber || order?.customerPhone || "").trim();

const getCustomerNameFromOrder = (order = {}) =>
  String(order?.shippingAddress?.fullName || order?.customerName || "").trim();

export const resolveWarrantyStatus = (record = {}, now = new Date()) => {
  const expiresAt = new Date(record?.expiresAt);
  const baseStatus = String(record?.status || WARRANTY_STATUSES.ACTIVE).toUpperCase();
  if (
    baseStatus === WARRANTY_STATUSES.ACTIVE &&
    Number.isFinite(expiresAt.getTime()) &&
    expiresAt < now
  ) {
    return WARRANTY_STATUSES.EXPIRED;
  }
  return baseStatus;
};

const buildPublicWarrantyItem = (record = {}, now = new Date()) => {
  const expiresAt = new Date(record.expiresAt);
  const remainingMs = Number.isFinite(expiresAt.getTime())
    ? Math.max(0, expiresAt.getTime() - now.getTime())
    : 0;
  const remainingWarrantyDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

  return {
    id: String(record._id),
    productId: String(record.productId || ""),
    productName: record.productName,
    variantSku: record.variantSku,
    identifier: record.imei || record.serialNumber || "",
    imei: record.imei || "",
    serialNumber: record.serialNumber || "",
    customerPhone: record.customerPhone || "",
    quantity: Number(record.quantity) || 1,
    purchaseDate: record.startDate,
    warrantyStartDate: record.startDate,
    warrantyExpirationDate: record.expiresAt,
    remainingWarrantyDays,
    warrantyStatus: resolveWarrantyStatus(record, now),
    warrantyType: record.warrantyType,
    warrantyPolicy: record.warrantyTerms || "",
    warrantyMonths: Number(record.warrantyMonths) || 0,
  };
};

const normalizeWarrantyUnit = (unit = {}, quantity = 1) => {
  const imei = String(unit?.imei || "").trim();
  const serialNumber = String(unit?.serialNumber || "").trim();
  const imeiNormalized = normalizeImei(imei);
  const serialNumberNormalized = normalizeSerialNumber(serialNumber);

  return {
    deviceId: unit?.deviceId || null,
    imei,
    serialNumber,
    imeiNormalized,
    serialNumberNormalized,
    lookupKeys: getNormalizedLookupKeys({ imei, serialNumber }),
    quantity: Math.max(1, Number(unit?.quantity || quantity) || 1),
  };
};

const getWarrantyUnitsForOrderItem = (item = {}, config = {}) => {
  if (!isSerializedConfig(config)) {
    return [
      normalizeWarrantyUnit(
        {
          imei: item.imei,
          serialNumber: item.serialNumber,
          quantity: Number(item.quantity) || 1,
        },
        Number(item.quantity) || 1
      ),
    ];
  }

  const assignments = Array.isArray(item.deviceAssignments) ? item.deviceAssignments : [];
  if (assignments.length > 0) {
    return assignments.map((assignment) => normalizeWarrantyUnit(assignment, 1));
  }

  if (Number(item.quantity || 0) === 1) {
    return [normalizeWarrantyUnit(item, 1)];
  }

  throw buildError(
    `Missing device identifiers for ${item.productName || item.variantSku}`,
    400,
    "WARRANTY_IDENTIFIER_REQUIRED"
  );
};

const ensureWarrantyUnitUnique = async ({
  orderId,
  orderItemId,
  imeiNormalized,
  serialNumberNormalized,
  session,
} = {}) => {
  const existingFilter = {
    orderId,
    orderItemId,
  };

  if (imeiNormalized || serialNumberNormalized) {
    existingFilter.$or = [
      ...(imeiNormalized ? [{ imeiNormalized }] : []),
      ...(serialNumberNormalized ? [{ serialNumberNormalized }] : []),
    ];
  }

  const existingForSameOrder = await system(WarrantyRecord.findOne(existingFilter)).session(session);
  if (existingForSameOrder) {
    return existingForSameOrder;
  }

  if (imeiNormalized) {
    const imeiConflict = await system(
      WarrantyRecord.findOne({ imeiNormalized, orderId: { $ne: orderId } })
    ).session(session);
    if (imeiConflict) {
      throw buildError(
        `IMEI ${imeiNormalized} already exists in another warranty record`,
        409,
        "WARRANTY_IMEI_DUPLICATE"
      );
    }
  }

  if (serialNumberNormalized) {
    const serialConflict = await system(
      WarrantyRecord.findOne({ serialNumberNormalized, orderId: { $ne: orderId } })
    ).session(session);
    if (serialConflict) {
      throw buildError(
        `Serial number ${serialNumberNormalized} already exists in another warranty record`,
        409,
        "WARRANTY_SERIAL_DUPLICATE"
      );
    }
  }

  return null;
};

const syncDeviceWarrantyState = async ({
  assignment = {},
  order,
  orderItem,
  record,
  actor = {},
  session = null,
} = {}) => {
  if (!assignment?.deviceId) {
    return;
  }

  const device = await system(Device.findById(assignment.deviceId)).session(session);
  if (!device) {
    return;
  }

  const previousInventoryState = device.inventoryState;
  const previousServiceState = device.serviceState;
  device.inventoryState = INVENTORY_STATES.SOLD;
  device.serviceState =
    record.status === WARRANTY_STATUSES.ACTIVE
      ? SERVICE_STATES.UNDER_WARRANTY
      : device.serviceState;
  device.currentWarrantyId = record._id;
  device.reservedFor = undefined;
  device.saleSnapshot = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderItemId: orderItem._id,
    customerId: order.customerId || order.userId || null,
    customerName: getCustomerNameFromOrder(order),
    customerPhone: getCustomerPhoneFromOrder(order),
    soldAt: record.startDate,
  };
  await device.save({ session });

  await createLifecycleEvent({
    deviceId: device._id,
    storeId: device.storeId,
    orderId: order._id,
    orderItemId: orderItem._id,
    eventType: "WARRANTY_ACTIVATED",
    fromInventoryState: previousInventoryState,
    toInventoryState: device.inventoryState,
    fromServiceState: previousServiceState,
    toServiceState: device.serviceState,
    actorId: actor?._id || null,
    actorName: getActorName(actor),
    note: `Warranty activated for order ${order.orderNumber || order._id}`,
    referenceType: "ORDER",
    referenceId: String(order._id),
    metadata: {
      warrantyRecordId: String(record._id),
      expiresAt: record.expiresAt,
    },
    session,
  });
};

export const activateWarrantyForOrder = async ({
  order,
  soldAt,
  actor = {},
  session = null,
} = {}) => {
  if (!order?.assignedStore?.storeId) {
    return [];
  }

  const customerPhone = getCustomerPhoneFromOrder(order);
  const customerPhoneNormalized = normalizePhoneNumber(customerPhone);
  if (!customerPhoneNormalized) {
    throw buildError(
      "Customer phone number is required to create warranty records",
      400,
      "WARRANTY_CUSTOMER_PHONE_REQUIRED"
    );
  }

  const activatedRecords = [];
  const startDate = soldAt instanceof Date ? soldAt : new Date(soldAt || Date.now());

  for (const item of Array.isArray(order.items) ? order.items : []) {
    const configContext = await resolveAfterSalesConfigByProductId({
      productId: item.productId,
      session,
    });

    if (!configContext || !isStoreWarrantyConfig(configContext.config)) {
      continue;
    }

    const expiresAt = addMonthsToDate(startDate, configContext.config.warrantyMonths || 0);
    if (!expiresAt) {
      throw buildError("Warranty expiration date is invalid", 400, "WARRANTY_DATE_INVALID");
    }

    const warrantyUnits = getWarrantyUnitsForOrderItem(item, configContext.config);

    for (const rawUnit of warrantyUnits) {
      const unit = normalizeWarrantyUnit(rawUnit, rawUnit.quantity);
      const identifierPolicyError = ensureIdentifierPolicySatisfied(configContext.config, unit);
      if (identifierPolicyError) {
        throw buildError(identifierPolicyError, 400, "WARRANTY_IDENTIFIER_REQUIRED");
      }

      const identifierFormatError = validateIdentifierFormat(unit);
      if (identifierFormatError) {
        throw buildError(identifierFormatError, 400, "WARRANTY_IDENTIFIER_INVALID");
      }

      const existingRecord = await ensureWarrantyUnitUnique({
        orderId: order._id,
        orderItemId: item._id,
        imeiNormalized: unit.imeiNormalized,
        serialNumberNormalized: unit.serialNumberNormalized,
        session,
      });
      if (existingRecord) {
        activatedRecords.push(existingRecord);
        continue;
      }

      const [record] = await WarrantyRecord.create(
        [
          {
            storeId: order.assignedStore.storeId,
            deviceId: unit.deviceId || undefined,
            orderId: order._id,
            orderItemId: item._id,
            customerId: order.customerId || order.userId || null,
            customerName: getCustomerNameFromOrder(order),
            customerPhone,
            customerPhoneNormalized,
            productId: item.productId,
            productName: item.productName || item.name || configContext.product?.name || "",
            variantSku: item.variantSku || "",
            imei: unit.imei || "",
            imeiNormalized: unit.imeiNormalized || undefined,
            serialNumber: unit.serialNumber || "",
            serialNumberNormalized: unit.serialNumberNormalized || undefined,
            lookupKeys: unit.lookupKeys,
            soldAt: startDate,
            startDate,
            warrantyMonths: configContext.config.warrantyMonths || 0,
            expiresAt,
            warrantyType: WARRANTY_PROVIDERS.STORE,
            status: resolveWarrantyStatus({ status: WARRANTY_STATUSES.ACTIVE, expiresAt }, new Date()),
            quantity: isSerializedConfig(configContext.config) ? 1 : unit.quantity,
            warrantyTerms: configContext.config.warrantyTerms || "",
          },
        ],
        { session }
      );

      await syncDeviceWarrantyState({
        assignment: unit,
        order,
        orderItem: item,
        record,
        actor,
        session,
      });

      activatedRecords.push(record);
    }
  }

  return activatedRecords;
};

export const voidWarrantyForOrder = async ({
  order,
  note = "",
  actor = {},
  session = null,
} = {}) => {
  if (!order?._id) {
    return [];
  }

  const records = await system(
    WarrantyRecord.find({
      orderId: order._id,
      warrantyType: WARRANTY_PROVIDERS.STORE,
      status: { $nin: [WARRANTY_STATUSES.VOID, WARRANTY_STATUSES.REPLACED] },
    })
  ).session(session);

  for (const record of records) {
    record.status = WARRANTY_STATUSES.VOID;
    record.notes = note || record.notes || "Warranty voided because the sale was reversed";
    await record.save({ session });

    if (!record.deviceId) {
      continue;
    }

    const device = await system(Device.findById(record.deviceId)).session(session);
    if (!device) {
      continue;
    }

    const previousServiceState = device.serviceState;
    device.serviceState = SERVICE_STATES.WARRANTY_VOID;
    await device.save({ session });

    await createLifecycleEvent({
      deviceId: device._id,
      storeId: device.storeId,
      orderId: order._id,
      orderItemId: record.orderItemId,
      eventType: "WARRANTY_VOIDED",
      fromInventoryState: device.inventoryState,
      toInventoryState: device.inventoryState,
      fromServiceState: previousServiceState,
      toServiceState: device.serviceState,
      actorId: actor?._id || null,
      actorName: getActorName(actor),
      note: record.notes,
      referenceType: "WARRANTY",
      referenceId: String(record._id),
      session,
    });
  }

  return records;
};

export const searchWarrantyRecords = async ({ phone = "", imeiOrSerial = "" } = {}) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  const lookupKey = normalizeImei(imeiOrSerial) || normalizeSerialNumber(imeiOrSerial);

  if (!normalizedPhone && !lookupKey) {
    throw buildError(
      "phone or imeiOrSerial is required",
      400,
      "WARRANTY_SEARCH_INPUT_REQUIRED"
    );
  }

  const query = {
    warrantyType: WARRANTY_PROVIDERS.STORE,
  };

  if (lookupKey) {
    query.lookupKeys = lookupKey;
  } else {
    query.customerPhoneNormalized = normalizedPhone;
  }

  const records = await system(
    WarrantyRecord.find(query).sort({ startDate: -1, createdAt: -1 }).lean()
  );

  if (!records.length) {
    throw buildError("Warranty record not found", 404, "WARRANTY_NOT_FOUND");
  }

  const now = new Date();
  return {
    searchBy: lookupKey ? "IDENTIFIER" : "PHONE",
    query: lookupKey || normalizedPhone,
    total: records.length,
    warranties: records.map((record) => buildPublicWarrantyItem(record, now)),
  };
};

export const getPublicWarrantyLookup = async ({ identifier } = {}) => {
  const result = await searchWarrantyRecords({ imeiOrSerial: identifier });
  return result.warranties[0];
};

export default {
  activateWarrantyForOrder,
  getPublicWarrantyLookup,
  normalizePhoneNumber,
  resolveWarrantyStatus,
  searchWarrantyRecords,
  voidWarrantyForOrder,
};
