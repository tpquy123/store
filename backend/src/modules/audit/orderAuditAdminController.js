import mongoose from "mongoose";
import AuditLog from "./AuditLog.js";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseDateFilter = (value, fieldName) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${fieldName} must be a valid ISO datetime`);
    error.httpStatus = 400;
    throw error;
  }

  return parsed;
};

const isGlobalAdminRequest = (req) => {
  return Boolean(req?.authz?.isGlobalAdmin);
};

const toValidObjectIdString = (value) => {
  const raw = String(value || "").trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) {
    return "";
  }
  return raw;
};

const resolveBranchFilter = (req, requestedBranchId) => {
  const isGlobalAdmin = isGlobalAdminRequest(req);
  if (isGlobalAdmin) {
    if (!requestedBranchId) {
      return { apply: false, value: null };
    }

    if (String(requestedBranchId).trim().toLowerCase() === "null") {
      return { apply: true, value: null };
    }

    const branchId = toValidObjectIdString(requestedBranchId);
    if (!branchId) {
      const error = new Error("Invalid branchId filter");
      error.httpStatus = 400;
      throw error;
    }
    return { apply: true, value: branchId };
  }

  const activeBranchId = toValidObjectIdString(req?.authz?.activeBranchId);
  if (!activeBranchId) {
    const error = new Error("Active branch context is required");
    error.httpStatus = 403;
    throw error;
  }

  return { apply: true, value: activeBranchId };
};

export const getOrderAuditLogsAdmin = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const skip = (page - 1) * limit;

    const orderId = String(req.query.orderId || "").trim();
    const actorUserId = toValidObjectIdString(req.query.actorUserId);
    const actionType = String(req.query.actionType || "")
      .trim()
      .toUpperCase();
    const outcome = String(req.query.outcome || "")
      .trim()
      .toUpperCase();
    const from = parseDateFilter(req.query.from, "from");
    const to = parseDateFilter(req.query.to, "to");

    if (orderId && !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId filter",
      });
    }

    if (req.query.actorUserId && !actorUserId) {
      return res.status(400).json({
        success: false,
        message: "Invalid actorUserId filter",
      });
    }

    if (outcome && !["SUCCESS", "FAILED"].includes(outcome)) {
      return res.status(400).json({
        success: false,
        message: "Invalid outcome filter",
      });
    }

    const branchFilter = resolveBranchFilter(req, req.query.branchId);

    const filter = {
      entityType: "ORDER",
    };

    if (orderId) {
      filter.entityId = orderId;
    }
    if (actorUserId) {
      filter["actor.userId"] = actorUserId;
    }
    if (actionType) {
      filter.actionType = actionType;
    }
    if (outcome) {
      filter.outcome = outcome;
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }
    if (branchFilter.apply) {
      filter.branchId = branchFilter.value;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return res.status(error.httpStatus || 500).json({
      success: false,
      message: error.message || "Failed to fetch order audit logs",
    });
  }
};

export default {
  getOrderAuditLogsAdmin,
};
