import WarrantyRecord from "./WarrantyRecord.js";
import Device from "../device/Device.js";
import {
  SERVICE_STATES,
  WARRANTY_STATUSES,
} from "../device/afterSalesConfig.js";
import {
  buildError,
  createLifecycleEvent,
  getActorName,
} from "../device/deviceService.js";
import {
  getPublicWarrantyLookup,
  searchWarrantyRecords,
} from "./warrantyService.js";

const parsePagination = (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

export const listWarranties = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) {
      filter.status = String(req.query.status).trim().toUpperCase();
    }
    if (req.query.variantSku) {
      filter.variantSku = String(req.query.variantSku).trim();
    }
    if (req.query.customerPhone) {
      filter.customerPhone = String(req.query.customerPhone).trim();
    }
    if (req.query.warrantyType) {
      filter.warrantyType = String(req.query.warrantyType).trim().toUpperCase();
    }

    const [records, total] = await Promise.all([
      WarrantyRecord.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WarrantyRecord.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        warranties: records,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
        },
      },
    });
  } catch (error) {
    res.status(error.httpStatus || 500).json({
      success: false,
      code: error.code,
      message: error.message || "Failed to load warranties",
    });
  }
};

export const getWarrantyById = async (req, res) => {
  try {
    const record = await WarrantyRecord.findById(req.params.id).lean();
    if (!record) {
      throw buildError("Warranty record not found", 404, "WARRANTY_NOT_FOUND");
    }

    res.json({
      success: true,
      data: { warranty: record },
    });
  } catch (error) {
    res.status(error.httpStatus || 500).json({
      success: false,
      code: error.code,
      message: error.message || "Failed to load warranty record",
    });
  }
};

export const updateWarrantyStatus = async (req, res) => {
  try {
    const record = await WarrantyRecord.findById(req.params.id);
    if (!record) {
      throw buildError("Warranty record not found", 404, "WARRANTY_NOT_FOUND");
    }

    const nextStatus = String(req.body.status || "").trim().toUpperCase();
    if (!Object.values(WARRANTY_STATUSES).includes(nextStatus)) {
      throw buildError("Invalid warranty status", 400, "WARRANTY_STATUS_INVALID");
    }

    record.status = nextStatus;
    if (req.body.notes !== undefined) {
      record.notes = String(req.body.notes || "").trim();
    }
    await record.save();

    const device = await Device.findById(record.deviceId);
    if (device) {
      const previousServiceState = device.serviceState;
      if (nextStatus === WARRANTY_STATUSES.VOID) {
        device.serviceState = SERVICE_STATES.WARRANTY_VOID;
      } else if (nextStatus === WARRANTY_STATUSES.ACTIVE) {
        device.serviceState = SERVICE_STATES.UNDER_WARRANTY;
      }
      await device.save();

      await createLifecycleEvent({
        deviceId: device._id,
        storeId: device.storeId,
        eventType: "WARRANTY_STATUS_UPDATED",
        fromInventoryState: device.inventoryState,
        toInventoryState: device.inventoryState,
        fromServiceState: previousServiceState,
        toServiceState: device.serviceState,
        actorId: req.user?._id || null,
        actorName: getActorName(req.user),
        note: String(req.body.notes || "").trim(),
        referenceType: "WARRANTY",
        referenceId: String(record._id),
      });
    }

    res.json({
      success: true,
      data: { warranty: record },
    });
  } catch (error) {
    res.status(error.httpStatus || 500).json({
      success: false,
      code: error.code,
      message: error.message || "Failed to update warranty status",
    });
  }
};

export const publicWarrantyLookup = async (req, res) => {
  try {
    const identifier = String(req.query.identifier || "").trim();
    const result = await getPublicWarrantyLookup({ identifier });
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(error.httpStatus || 500).json({
      success: false,
      code: error.code,
      message: error.message || "Failed to lookup warranty",
    });
  }
};

export const publicWarrantySearch = async (req, res) => {
  try {
    const phone = String(req.query.phone || "").trim();
    const imeiOrSerial = String(
      req.query.imeiOrSerial || req.query.identifier || ""
    ).trim();
    const result = await searchWarrantyRecords({ phone, imeiOrSerial });
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(error.httpStatus || 500).json({
      success: false,
      code: error.code,
      message: error.message || "Failed to search warranty records",
    });
  }
};

export default {
  getWarrantyById,
  listWarranties,
  publicWarrantyLookup,
  publicWarrantySearch,
  updateWarrantyStatus,
};
