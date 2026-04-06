import mongoose from "mongoose";
import AuditLog from "../audit/AuditLog.js";

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

const getEffectiveBranchFilter = (req) => {
  if (isGlobalAdminRequest(req)) {
    return null;
  }

  const branchId = String(req?.authz?.activeBranchId || "").trim();
  if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
    const error = new Error("Active branch context is required");
    error.httpStatus = 403;
    throw error;
  }

  return branchId;
};

export const getOrderAuditLogs = async (req, res) => {
  try {
    const orderId = String(req.params.id || "").trim();
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order id",
      });
    }

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const skip = (page - 1) * limit;

    const actionType = String(req.query.actionType || "")
      .trim()
      .toUpperCase();
    const outcome = String(req.query.outcome || "")
      .trim()
      .toUpperCase();
    const from = parseDateFilter(req.query.from, "from");
    const to = parseDateFilter(req.query.to, "to");
    const branchFilter = getEffectiveBranchFilter(req);

    if (outcome && !["SUCCESS", "FAILED"].includes(outcome)) {
      return res.status(400).json({
        success: false,
        message: "Invalid outcome filter",
      });
    }

    const filter = {
      entityType: "ORDER",
      entityId: orderId,
    };

    if (actionType) {
      filter.actionType = actionType;
    }
    if (outcome) {
      filter.outcome = outcome;
    }
    if (branchFilter) {
      filter.branchId = branchFilter;
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
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
  getOrderAuditLogs,
};
