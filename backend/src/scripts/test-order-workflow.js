import dotenv from "dotenv";
import mongoose from "mongoose";

import { runWithBranchContext } from "../authz/branchContext.js";
import User from "../modules/auth/User.js";
import Store from "../modules/store/Store.js";
import StoreInventory from "../modules/inventory/StoreInventory.js";
import Inventory from "../modules/warehouse/Inventory.js";
import Notification from "../modules/notification/Notification.js";
import UniversalProduct, { UniversalVariant } from "../modules/product/UniversalProduct.js";
import { resolveVariantPricingSnapshot } from "../modules/product/productPricingService.js";
import Order from "../modules/order/Order.js";
import {
  assignStore,
  createOrder,
  updateOrderStatus,
} from "../modules/order/orderController.js";

dotenv.config();

const rawMongoUri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGODB_CONNECTIONSTRING ||
  process.env.MONGO_URL;
const MONGO_URI = rawMongoUri?.trim().replace(/^"|"$/g, "");

const SCRIPT_TAG = "[TEST-ORDER-WORKFLOW]";
const TEST_QTY = 1;

if (!MONGO_URI) {
  console.error(`${SCRIPT_TAG} Missing MONGO_URI/MONGODB_URI/MONGODB_CONNECTIONSTRING`);
  process.exit(1);
}

const log = (...args) => console.log(SCRIPT_TAG, ...args);

const makeRes = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.payload = data;
    return this;
  },
});

const toUserReq = (user) => ({
  _id: user._id,
  role: user.role,
  fullName: user.fullName || user.name || user.email || "User",
  name: user.name || user.fullName || "",
  email: user.email || "",
  storeLocation: user.storeLocation || null,
});

const buildAuthz = ({ user, activeBranchId = "" }) => {
  const role = String(user.role || "").toUpperCase();
  const isGlobalAdmin = role === "GLOBAL_ADMIN";
  const isCustomer = role === "CUSTOMER";
  const isShipper = role === "SHIPPER";
  const normalizedBranch = activeBranchId ? String(activeBranchId) : "";

  return {
    userId: String(user._id),
    role,
    isGlobalAdmin,
    isCustomer,
    isShipper,
    activeBranchId: normalizedBranch,
    allowedBranchIds: normalizedBranch ? [normalizedBranch] : [],
    requiresBranchAssignment: false,
    scopeMode: isGlobalAdmin ? "global" : "branch",
  };
};

const invokeController = async (controller, req) => {
  const authz = req.authz || buildAuthz({ user: req.user });
  const ormContext = {
    activeBranchId: authz.activeBranchId || "",
    isGlobalAdmin: Boolean(authz.isGlobalAdmin),
    scopeMode: authz.scopeMode || (authz.isGlobalAdmin ? "global" : "branch"),
    userId: authz.userId || String(req.user?._id || ""),
  };

  const res = makeRes();
  await runWithBranchContext(ormContext, async () => {
    await controller(
      {
        params: req.params || {},
        body: req.body || {},
        query: req.query || {},
        headers: req.headers || {},
        user: req.user,
        authz,
      },
      res
    );
  });
  return res;
};

const getOrderFromPayload = (payload) => payload?.order || payload?.data?.order || null;

class Report {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.rows = [];
  }

  check(condition, name, details = "") {
    if (condition) {
      this.passed += 1;
      this.rows.push({ status: "PASS", name, details });
      log(`PASS: ${name}${details ? ` | ${details}` : ""}`);
      return;
    }
    this.failed += 1;
    this.rows.push({ status: "FAIL", name, details });
    log(`FAIL: ${name}${details ? ` | ${details}` : ""}`);
  }

  summary() {
    const total = this.passed + this.failed;
    log("==================================================");
    log(`Total checks: ${total}`);
    log(`Passed: ${this.passed}`);
    log(`Failed: ${this.failed}`);
    log("==================================================");
  }
}

const ensure = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const normalizeBranchId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (value?._id) return String(value._id).trim();
  return value?.toString ? value.toString().trim() : String(value).trim();
};

const collectActiveBranchIds = (user) => {
  const ids = new Set();
  const assignments = Array.isArray(user?.branchAssignments) ? user.branchAssignments : [];

  for (const assignment of assignments) {
    const status = String(assignment?.status || "ACTIVE").trim().toUpperCase();
    if (status !== "ACTIVE") continue;

    const storeId = normalizeBranchId(assignment?.storeId);
    if (storeId) {
      ids.add(storeId);
    }
  }

  const legacyStoreId = normalizeBranchId(user?.storeLocation);
  if (legacyStoreId) {
    ids.add(legacyStoreId);
  }

  return Array.from(ids);
};

const readStoreInventory = async ({ storeId, productId, variantSku }) =>
  StoreInventory.findOne({ storeId, productId, variantSku })
    .setOptions({ skipBranchIsolation: true })
    .lean();

const readWarehouseQuantity = async ({ storeId, sku }) => {
  const rows = await Inventory.find({ storeId, sku })
    .setOptions({ skipBranchIsolation: true })
    .select("quantity")
    .lean();

  return rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
};

const run = async () => {
  const report = new Report();

  const createdOrderIds = [];
  const inventorySnapshots = new Map();
  const storeSnapshots = new Map();
  let variantSnapshot = null;
  let productSnapshot = null;

  try {
    await mongoose.connect(MONGO_URI);
    log("Connected to MongoDB");

    const customer =
      (await User.findOne({ role: "CUSTOMER" }).select("_id role fullName name email storeLocation").lean()) ||
      null;
    const globalAdmin =
      (await User.findOne({ role: "GLOBAL_ADMIN" }).select("_id role fullName name email storeLocation").lean()) ||
      (await User.findOne({ role: "ADMIN" }).select("_id role fullName name email storeLocation").lean()) ||
      null;
    const dispatchAdmin =
      (await User.findOne({ role: "ADMIN" }).select("_id role fullName name email storeLocation").lean()) ||
      (await User.findOne({ role: "ORDER_MANAGER" }).select("_id role fullName name email storeLocation").lean()) ||
      null;
    const shippers = await User.find({ role: "SHIPPER" })
      .select("_id role fullName name email storeLocation branchAssignments")
      .lean();

    ensure(customer, "No CUSTOMER user found");
    ensure(globalAdmin, "No GLOBAL_ADMIN/ADMIN user found");
    ensure(dispatchAdmin, "No ORDER_MANAGER/ADMIN user found");
    ensure(shippers.length >= 1, "No SHIPPER user found");
    const shipperEligibleBranchIds = new Set(
      shippers.flatMap((shipper) => collectActiveBranchIds(shipper))
    );
    ensure(
      shipperEligibleBranchIds.size > 0,
      "No SHIPPER assigned to any active branch"
    );

    const activeStores = await Store.find({ status: "ACTIVE" })
      .select("_id name code capacity stats")
      .lean();
    ensure(activeStores.length >= 2, "Need at least 2 ACTIVE stores");

    const activeStoreMap = new Map(
      activeStores.map((store) => [String(store._id), store])
    );

    const inventoryRows = await StoreInventory.find({ available: { $gte: 3 } })
      .setOptions({ skipBranchIsolation: true })
      .select("_id storeId productId variantSku quantity reserved available")
      .lean();

    const grouped = new Map();
    for (const row of inventoryRows) {
      const storeId = String(row.storeId);
      if (!activeStoreMap.has(storeId)) {
        continue;
      }
      const key = `${String(row.productId)}::${row.variantSku}`;
      const bucket = grouped.get(key) || [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    let selected = null;
    for (const [key, rows] of grouped.entries()) {
      const uniqueStoreIds = [...new Set(rows.map((row) => String(row.storeId)))];
      if (uniqueStoreIds.length < 2) {
        continue;
      }

      const [productIdStr, variantSku] = key.split("::");
      const variant = await UniversalVariant.findOne({
        sku: variantSku,
        productId: productIdStr,
        stock: { $gte: 2 },
      })
        .select("_id sku price basePrice originalPrice sellingPrice stock salesCount productId")
        .lean();

      if (!variant) {
        continue;
      }

      const pricingSnapshot = resolveVariantPricingSnapshot(variant);
      if (Number(pricingSnapshot.price) <= 0) {
        continue;
      }

      const product = await UniversalProduct.findById(productIdStr)
        .select("_id name salesCount")
        .lean();
      if (!product) {
        continue;
      }

      const sorted = rows.sort((a, b) => Number(b.available) - Number(a.available));
      const storeAInv = sorted[0];
      const storeBInv = sorted.find(
        (item) =>
          String(item.storeId) !== String(storeAInv.storeId) &&
          shipperEligibleBranchIds.has(String(item.storeId))
      );
      if (!storeBInv) {
        continue;
      }

      selected = {
        variant,
        product,
        storeA: activeStoreMap.get(String(storeAInv.storeId)),
        storeB: activeStoreMap.get(String(storeBInv.storeId)),
        invA: storeAInv,
        invB: storeBInv,
      };
      break;
    }

    ensure(
      selected,
      "No suitable SKU found in at least 2 ACTIVE stores with available >= 3 and variant.stock >= 2"
    );

    const { variant, product, storeA, storeB } = selected;
    const effectiveVariantPrice = Number(resolveVariantPricingSnapshot(variant).price) || 0;
    const storeBId = String(storeB._id);

    const assignedShipper = shippers.find((shipper) =>
      collectActiveBranchIds(shipper).includes(storeBId)
    );
    ensure(assignedShipper, `No SHIPPER found assigned to Store B (${storeBId})`);

    const nonAssignedShipper =
      shippers.find(
        (shipper) =>
          String(shipper._id) !== String(assignedShipper._id) &&
          !collectActiveBranchIds(shipper).includes(storeBId)
      ) || null;

    variantSnapshot = {
      id: String(variant._id),
      stock: Number(variant.stock) || 0,
      salesCount: Number(variant.salesCount) || 0,
    };

    productSnapshot = {
      id: String(product._id),
      salesCount: Number(product.salesCount) || 0,
    };

    for (const store of [storeA, storeB]) {
      storeSnapshots.set(String(store._id), {
        currentOrders: Number(store.capacity?.currentOrders) || 0,
        totalOrders: Number(store.stats?.totalOrders) || 0,
      });
    }

    const baseInvA = await readStoreInventory({
      storeId: storeA._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    const baseInvB = await readStoreInventory({
      storeId: storeB._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    ensure(baseInvA, `Missing StoreInventory at storeA (${storeA._id})`);
    ensure(baseInvB, `Missing StoreInventory at storeB (${storeB._id})`);

    inventorySnapshots.set(String(baseInvA._id), {
      id: String(baseInvA._id),
      quantity: Number(baseInvA.quantity) || 0,
      reserved: Number(baseInvA.reserved) || 0,
    });
    inventorySnapshots.set(String(baseInvB._id), {
      id: String(baseInvB._id),
      quantity: Number(baseInvB.quantity) || 0,
      reserved: Number(baseInvB.reserved) || 0,
    });

    const baseWarehouseQtyStoreB = await readWarehouseQuantity({
      storeId: storeB._id,
      sku: variant.sku,
    });

    log("Selected test data:");
    log(`- Product: ${product.name} (${product._id})`);
    log(`- SKU: ${variant.sku}`);
    log(`- Store A: ${storeA.name} (${storeA._id})`);
    log(`- Store B: ${storeB.name} (${storeB._id})`);
    log(
      `- Base Store A inventory: qty=${baseInvA.quantity}, reserved=${baseInvA.reserved}, available=${baseInvA.available}`
    );
    log(
      `- Base Store B inventory: qty=${baseInvB.quantity}, reserved=${baseInvB.reserved}, available=${baseInvB.available}`
    );

    const makeOrderBody = (label) => ({
      items: [
        {
          variantId: String(variant._id),
          variantSku: variant.sku,
          quantity: TEST_QTY,
          price: effectiveVariantPrice,
        },
      ],
      shippingAddress: {
        fullName: "Workflow Test Customer",
        phoneNumber: "0900000000",
        detailAddress: "123 Test Street",
        province: "TP.HCM",
        district: "Quan 1",
      },
      paymentMethod: "BANK_TRANSFER",
      fulfillmentType: "HOME_DELIVERY",
      orderSource: "ONLINE",
      note: `${SCRIPT_TAG} ${label}`,
    });

    log("Scenario 1: Full flow (customer -> admin assign/reassign -> shipper delivered)");

    const createMainRes = await invokeController(createOrder, {
      body: makeOrderBody("SCENARIO_1"),
      user: toUserReq(customer),
      authz: buildAuthz({ user: customer }),
    });
    ensure(
      createMainRes.statusCode === 201,
      `Scenario 1 createOrder failed: status=${createMainRes.statusCode} msg=${createMainRes.payload?.message}`
    );

    const createdMain = getOrderFromPayload(createMainRes.payload);
    ensure(createdMain?._id, "Scenario 1 createOrder returned no order id");
    const mainOrderId = String(createdMain._id);
    createdOrderIds.push(mainOrderId);

    report.check(
      ["PENDING", "PENDING_PAYMENT"].includes(createdMain.status),
      "Customer creates order with initial status",
      `status=${createdMain.status}`
    );

    const assignARes = await invokeController(assignStore, {
      params: { id: mainOrderId },
      body: { storeId: String(storeA._id) },
      user: toUserReq(globalAdmin),
      authz: buildAuthz({ user: globalAdmin }),
    });
    ensure(
      assignARes.statusCode === 200,
      `Scenario 1 assignStore A failed: status=${assignARes.statusCode} msg=${assignARes.payload?.message}`
    );

    const invAAfterAssign = await readStoreInventory({
      storeId: storeA._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    report.check(
      Number(invAAfterAssign.quantity) === Number(baseInvA.quantity),
      "Assign store reserves inventory without deducting quantity (Store A)",
      `beforeQty=${baseInvA.quantity} afterQty=${invAAfterAssign.quantity}`
    );
    report.check(
      Number(invAAfterAssign.reserved) === Number(baseInvA.reserved) + TEST_QTY,
      "Assign store increases reserved at Store A",
      `beforeReserved=${baseInvA.reserved} afterReserved=${invAAfterAssign.reserved}`
    );

    const assignBRes = await invokeController(assignStore, {
      params: { id: mainOrderId },
      body: { storeId: String(storeB._id) },
      user: toUserReq(globalAdmin),
      authz: buildAuthz({ user: globalAdmin }),
    });
    ensure(
      assignBRes.statusCode === 200,
      `Scenario 1 assignStore B failed: status=${assignBRes.statusCode} msg=${assignBRes.payload?.message}`
    );

    const invAAfterReassign = await readStoreInventory({
      storeId: storeA._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    const invBAfterReassign = await readStoreInventory({
      storeId: storeB._id,
      productId: product._id,
      variantSku: variant.sku,
    });

    report.check(
      Number(invAAfterReassign.reserved) === Number(baseInvA.reserved),
      "Reassign releases reserved from old branch (Store A)",
      `expected=${baseInvA.reserved} actual=${invAAfterReassign.reserved}`
    );
    report.check(
      Number(invBAfterReassign.quantity) === Number(baseInvB.quantity),
      "Reassign does not deduct quantity at new branch (Store B)",
      `beforeQty=${baseInvB.quantity} afterQty=${invBAfterReassign.quantity}`
    );
    report.check(
      Number(invBAfterReassign.reserved) === Number(baseInvB.reserved) + TEST_QTY,
      "Reassign reserves inventory at new branch (Store B)",
      `beforeReserved=${baseInvB.reserved} afterReserved=${invBAfterReassign.reserved}`
    );

    const confirmMainRes = await invokeController(updateOrderStatus, {
      params: { id: mainOrderId },
      body: { status: "CONFIRMED", note: `${SCRIPT_TAG} confirm scenario 1` },
      user: toUserReq(globalAdmin),
      authz: buildAuthz({ user: globalAdmin }),
    });
    ensure(
      confirmMainRes.statusCode === 200,
      `Scenario 1 CONFIRMED failed: status=${confirmMainRes.statusCode} msg=${confirmMainRes.payload?.message}`
    );

    const shippingMainRes = await invokeController(updateOrderStatus, {
      params: { id: mainOrderId },
      body: {
        status: "SHIPPING",
        shipperId: String(assignedShipper._id),
        note: `${SCRIPT_TAG} shipping scenario 1`,
      },
      user: toUserReq(dispatchAdmin),
      authz: buildAuthz({ user: dispatchAdmin }),
    });
    ensure(
      shippingMainRes.statusCode === 200,
      `Scenario 1 SHIPPING failed: status=${shippingMainRes.statusCode} msg=${shippingMainRes.payload?.message}`
    );

    if (nonAssignedShipper) {
      const nonAssignedDeliveredRes = await invokeController(updateOrderStatus, {
        params: { id: mainOrderId },
        body: {
          status: "DELIVERED",
          note: `${SCRIPT_TAG} non-assigned shipper attempt`,
        },
        user: toUserReq(nonAssignedShipper),
        authz: buildAuthz({ user: nonAssignedShipper, activeBranchId: String(storeB._id) }),
      });

      report.check(
        nonAssignedDeliveredRes.statusCode === 403,
        "Non-assigned shipper cannot mark DELIVERED",
        `status=${nonAssignedDeliveredRes.statusCode} msg=${nonAssignedDeliveredRes.payload?.message}`
      );
    } else {
      log("WARN: Skip non-assigned shipper check (only one SHIPPER user available)");
    }

    const invBBeforeShipperDelivered = await readStoreInventory({
      storeId: storeB._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    report.check(
      Number(invBBeforeShipperDelivered.quantity) === Number(baseInvB.quantity),
      "Before shipper DELIVERED, quantity is still not deducted",
      `qty=${invBBeforeShipperDelivered.quantity}`
    );
    report.check(
      Number(invBBeforeShipperDelivered.reserved) === Number(baseInvB.reserved) + TEST_QTY,
      "Before shipper DELIVERED, reserved is still held",
      `reserved=${invBBeforeShipperDelivered.reserved}`
    );

    const shipperDeliveredRes = await invokeController(updateOrderStatus, {
      params: { id: mainOrderId },
      body: {
        status: "DELIVERED",
        note: `${SCRIPT_TAG} assigned shipper delivered`,
      },
      user: toUserReq(assignedShipper),
      authz: buildAuthz({ user: assignedShipper, activeBranchId: String(storeB._id) }),
    });
    ensure(
      shipperDeliveredRes.statusCode === 200,
      `Scenario 1 assigned shipper DELIVERED failed: status=${shipperDeliveredRes.statusCode} msg=${shipperDeliveredRes.payload?.message}`
    );

    const deliveredMain = await Order.findById(mainOrderId).lean();
    const invAFinalMain = await readStoreInventory({
      storeId: storeA._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    const invBFinalMain = await readStoreInventory({
      storeId: storeB._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    const warehouseAfterMain = await readWarehouseQuantity({
      storeId: storeB._id,
      sku: variant.sku,
    });

    report.check(
      deliveredMain?.status === "DELIVERED",
      "Assigned shipper can mark DELIVERED",
      `status=${deliveredMain?.status}`
    );
    report.check(
      Boolean(deliveredMain?.inventoryDeductedAt),
      "inventoryDeductedAt is set when DELIVERED",
      `inventoryDeductedAt=${deliveredMain?.inventoryDeductedAt || "null"}`
    );
    report.check(
      Number(invBFinalMain.quantity) === Number(baseInvB.quantity) - TEST_QTY,
      "StoreInventory.quantity is deducted after shipper DELIVERED (Store B)",
      `before=${baseInvB.quantity} after=${invBFinalMain.quantity}`
    );
    report.check(
      Number(invBFinalMain.reserved) === Number(baseInvB.reserved),
      "StoreInventory.reserved is released after shipper DELIVERED (Store B)",
      `before=${baseInvB.reserved} after=${invBFinalMain.reserved}`
    );
    report.check(
      Number(invAFinalMain.quantity) === Number(baseInvA.quantity) &&
        Number(invAFinalMain.reserved) === Number(baseInvA.reserved),
      "Old branch inventory stays unchanged after delivery (Store A)",
      `qty=${invAFinalMain.quantity}, reserved=${invAFinalMain.reserved}`
    );
    report.check(
      Number(warehouseAfterMain) === Number(baseWarehouseQtyStoreB),
      "Warehouse Inventory is not deducted by delivery flow (deduction is on StoreInventory)",
      `warehouseBefore=${baseWarehouseQtyStoreB} warehouseAfter=${warehouseAfterMain}`
    );

    log("Scenario 2: Permission check - admin tries to set DELIVERED");

    const createPermissionRes = await invokeController(createOrder, {
      body: makeOrderBody("SCENARIO_2_ADMIN_DELIVERED"),
      user: toUserReq(customer),
      authz: buildAuthz({ user: customer }),
    });
    ensure(
      createPermissionRes.statusCode === 201,
      `Scenario 2 createOrder failed: status=${createPermissionRes.statusCode} msg=${createPermissionRes.payload?.message}`
    );

    const createdPermission = getOrderFromPayload(createPermissionRes.payload);
    ensure(createdPermission?._id, "Scenario 2 createOrder returned no order id");
    const permissionOrderId = String(createdPermission._id);
    createdOrderIds.push(permissionOrderId);

    const assignPermissionRes = await invokeController(assignStore, {
      params: { id: permissionOrderId },
      body: { storeId: String(storeB._id) },
      user: toUserReq(globalAdmin),
      authz: buildAuthz({ user: globalAdmin }),
    });
    ensure(
      assignPermissionRes.statusCode === 200,
      `Scenario 2 assignStore failed: status=${assignPermissionRes.statusCode} msg=${assignPermissionRes.payload?.message}`
    );

    const shippingPermissionRes = await invokeController(updateOrderStatus, {
      params: { id: permissionOrderId },
      body: {
        status: "SHIPPING",
        shipperId: String(assignedShipper._id),
        note: `${SCRIPT_TAG} shipping scenario 2`,
      },
      user: toUserReq(dispatchAdmin),
      authz: buildAuthz({ user: dispatchAdmin }),
    });
    ensure(
      shippingPermissionRes.statusCode === 200,
      `Scenario 2 SHIPPING failed: status=${shippingPermissionRes.statusCode} msg=${shippingPermissionRes.payload?.message}`
    );

    const invBBeforeAdminDelivered = await readStoreInventory({
      storeId: storeB._id,
      productId: product._id,
      variantSku: variant.sku,
    });
    const quantityBeforeAdminAttempt = Number(invBBeforeAdminDelivered.quantity);
    const reservedBeforeAdminAttempt = Number(invBBeforeAdminDelivered.reserved);

    const adminDeliveredRes = await invokeController(updateOrderStatus, {
      params: { id: permissionOrderId },
      body: {
        status: "DELIVERED",
        note: `${SCRIPT_TAG} admin delivered attempt`,
      },
      user: toUserReq(globalAdmin),
      authz: buildAuthz({ user: globalAdmin }),
    });

    report.check(
      adminDeliveredRes.statusCode === 403,
      "Only assigned shipper should be able to mark DELIVERED (admin must be blocked)",
      `actualStatus=${adminDeliveredRes.statusCode} msg=${adminDeliveredRes.payload?.message}`
    );

    const orderAfterAdminAttempt = await Order.findById(permissionOrderId).lean();
    const invBAfterAdminDelivered = await readStoreInventory({
      storeId: storeB._id,
      productId: product._id,
      variantSku: variant.sku,
    });

    if (adminDeliveredRes.statusCode === 403) {
      report.check(
        orderAfterAdminAttempt?.status === "SHIPPING",
        "Order remains SHIPPING when admin DELIVERED is blocked",
        `status=${orderAfterAdminAttempt?.status}`
      );
      report.check(
        Number(invBAfterAdminDelivered.quantity) === quantityBeforeAdminAttempt,
        "No quantity deduction when admin DELIVERED is blocked",
        `before=${quantityBeforeAdminAttempt} after=${invBAfterAdminDelivered.quantity}`
      );
      report.check(
        Number(invBAfterAdminDelivered.reserved) === reservedBeforeAdminAttempt,
        "No reserved release when admin DELIVERED is blocked",
        `before=${reservedBeforeAdminAttempt} after=${invBAfterAdminDelivered.reserved}`
      );
    } else {
      log(
        "FINDING: Admin can set DELIVERED in current implementation. Inventory may be deducted before shipper confirmation."
      );
      report.check(
        false,
        "SECURITY FINDING: admin was able to set DELIVERED",
        `orderStatus=${orderAfterAdminAttempt?.status} inventoryDeductedAt=${orderAfterAdminAttempt?.inventoryDeductedAt || "null"}`
      );
    }
  } finally {
    log("Cleanup started");

    if (inventorySnapshots.size > 0) {
      for (const snapshot of inventorySnapshots.values()) {
        await StoreInventory.updateOne(
          { _id: snapshot.id },
          {
            $set: {
              quantity: snapshot.quantity,
              reserved: snapshot.reserved,
            },
          }
        ).setOptions({ skipBranchIsolation: true });
      }
      log(`Cleanup restored ${inventorySnapshots.size} StoreInventory rows`);
    }

    if (storeSnapshots.size > 0) {
      for (const [storeId, snapshot] of storeSnapshots.entries()) {
        await Store.updateOne(
          { _id: storeId },
          {
            $set: {
              "capacity.currentOrders": snapshot.currentOrders,
              "stats.totalOrders": snapshot.totalOrders,
            },
          }
        );
      }
      log(`Cleanup restored ${storeSnapshots.size} Store capacity snapshots`);
    }

    if (variantSnapshot) {
      await UniversalVariant.updateOne(
        { _id: variantSnapshot.id },
        {
          $set: {
            stock: variantSnapshot.stock,
            salesCount: variantSnapshot.salesCount,
          },
        }
      );
      log("Cleanup restored UniversalVariant stock/salesCount");
    }

    if (productSnapshot) {
      await UniversalProduct.updateOne(
        { _id: productSnapshot.id },
        {
          $set: {
            salesCount: productSnapshot.salesCount,
          },
        }
      );
      log("Cleanup restored UniversalProduct salesCount");
    }

    if (createdOrderIds.length > 0) {
      await Notification.deleteMany({ orderId: { $in: createdOrderIds } });
      await Order.deleteMany({ _id: { $in: createdOrderIds } });
      log(`Cleanup removed ${createdOrderIds.length} test orders`);
    }

    await mongoose.disconnect();
    log("Disconnected from MongoDB");
  }

  report.summary();

  if (report.failed > 0) {
    process.exit(1);
  }
  process.exit(0);
};

run().catch((error) => {
  console.error(SCRIPT_TAG, "FAILED", error.message);
  console.error(error);
  process.exit(1);
});
