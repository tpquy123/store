import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import * as orderController from "./orderController.js";
import { getOrderAuditLogs } from "./orderAuditController.js";
import { ORDER_AUDIT_ACTIONS } from "./orderAuditActions.js";
import { orderAuditMiddleware } from "./orderAuditMiddleware.js";
import { resolveOrderIdFromCarrierPayload } from "./orderAuditAdapter.js";

const router = express.Router();

const resolveAuditScopeMode = (req) => {
  if (req?.authz?.isGlobalAdmin) {
    return "global";
  }
  return "branch";
};

const resolveOrderWriteScopeMode = (req) => {
  if (req?.authz?.isGlobalAdmin) {
    return "global";
  }
  return "branch";
};

const getPermissionSet = (req) =>
  req?.authz?.permissions instanceof Set ? req.authz.permissions : new Set();

const resolveOrderReadScopeMode = (req) => {
  const permissionSet = getPermissionSet(req);
  if (
    req?.authz?.isGlobalAdmin &&
    (permissionSet.has(AUTHZ_ACTIONS.ORDERS_READ) ||
      permissionSet.has(AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH))
  ) {
    return "global";
  }
  if (
    permissionSet.has(AUTHZ_ACTIONS.ORDERS_READ) ||
    permissionSet.has(AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH)
  ) {
    return "branch";
  }
  if (permissionSet.has(AUTHZ_ACTIONS.ORDER_VIEW_ASSIGNED)) {
    return "task";
  }
  return "self";
};

const resolveOrderCreateScopeMode = (req) => {
  const permissionSet = getPermissionSet(req);
  if (req?.authz?.isGlobalAdmin && permissionSet.has(AUTHZ_ACTIONS.ORDERS_WRITE)) {
    return "global";
  }
  if (permissionSet.has(AUTHZ_ACTIONS.ORDERS_WRITE)) {
    return "branch";
  }
  return "self";
};

const resolveOrderCancelScopeMode = (req) => {
  const permissionSet = getPermissionSet(req);
  if (
    req?.authz?.isGlobalAdmin &&
    (permissionSet.has(AUTHZ_ACTIONS.ORDERS_WRITE) ||
      permissionSet.has(AUTHZ_ACTIONS.ORDER_STATUS_MANAGE))
  ) {
    return "global";
  }
  if (
    permissionSet.has(AUTHZ_ACTIONS.ORDERS_WRITE) ||
    permissionSet.has(AUTHZ_ACTIONS.ORDER_STATUS_MANAGE)
  ) {
    return "branch";
  }
  return "self";
};

const requireOrderManagementRead = authorize(null, {
  anyOf: [AUTHZ_ACTIONS.ORDERS_READ, AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH],
  scopeMode: resolveOrderReadScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const requireOrderRead = authorize(null, {
  anyOf: [
    AUTHZ_ACTIONS.ORDERS_READ,
    AUTHZ_ACTIONS.ORDER_VIEW_SELF,
    AUTHZ_ACTIONS.ORDER_VIEW_ASSIGNED,
    AUTHZ_ACTIONS.POS_ORDER_READ_SELF,
    AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH,
  ],
  scopeMode: resolveOrderReadScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const requireOrderCreate = authorize(null, {
  anyOf: [AUTHZ_ACTIONS.ORDERS_WRITE, AUTHZ_ACTIONS.CART_MANAGE_SELF],
  scopeMode: resolveOrderCreateScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const requireOrderCancel = authorize(null, {
  anyOf: [
    AUTHZ_ACTIONS.ORDERS_WRITE,
    AUTHZ_ACTIONS.ORDER_STATUS_MANAGE,
    AUTHZ_ACTIONS.ORDER_VIEW_SELF,
  ],
  scopeMode: resolveOrderCancelScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const auditCreateOrder = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.CREATE_ORDER,
  source: "ORDERS_API",
});
const auditCancelOrder = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.CANCEL_ORDER,
  source: "ORDERS_API",
});
const auditUpdateStatus = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.UPDATE_STATUS,
  source: "ORDERS_API",
  resolveActionType: ({ req, afterOrder }) => {
    const role = String(req?.user?.role || "").trim().toUpperCase();
    const nextStatus = String(afterOrder?.status || req?.body?.status || "")
      .trim()
      .toUpperCase();

    if (role === "SHIPPER" && nextStatus === "RETURNED") {
      return ORDER_AUDIT_ACTIONS.RETURN_ORDER;
    }

    return ORDER_AUDIT_ACTIONS.UPDATE_STATUS;
  },
});
const auditAssignCarrier = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.ASSIGN_CARRIER,
  source: "ORDERS_API",
});
const auditUpdatePaymentStatus = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.UPDATE_PAYMENT_STATUS,
  source: "ORDERS_API",
});
const auditAssignBranch = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.ASSIGN_BRANCH,
  source: "ORDERS_API",
});
const auditCarrierWebhook = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.PROCESS_CARRIER_WEBHOOK,
  source: "CARRIER_WEBHOOK",
  resolveOrderId: async (req) => resolveOrderIdFromCarrierPayload(req.body || {}),
});

const resolveOrderStatusWriteAction = (req) => {
  const permissionSet = req?.authz?.permissions instanceof Set ? req.authz.permissions : new Set();
  if (permissionSet.has(AUTHZ_ACTIONS.ORDER_STATUS_MANAGE_TASK)) {
    return AUTHZ_ACTIONS.ORDER_STATUS_MANAGE_TASK;
  }
  if (permissionSet.has(AUTHZ_ACTIONS.ORDER_STATUS_MANAGE_WAREHOUSE)) {
    return AUTHZ_ACTIONS.ORDER_STATUS_MANAGE_WAREHOUSE;
  }
  if (permissionSet.has(AUTHZ_ACTIONS.ORDER_STATUS_MANAGE_POS)) {
    return AUTHZ_ACTIONS.ORDER_STATUS_MANAGE_POS;
  }
  return AUTHZ_ACTIONS.ORDER_STATUS_MANAGE;
};

const resolveOrderStatusScopeMode = (req) => {
  if (req?.authz?.isGlobalAdmin) {
    return "global";
  }
  if (resolveOrderStatusWriteAction(req) === AUTHZ_ACTIONS.ORDER_STATUS_MANAGE_TASK) {
    return "task";
  }
  return resolveOrderWriteScopeMode(req);
};

// Carrier webhooks are unauthenticated
router.post("/carrier/webhook", auditCarrierWebhook, orderController.handleCarrierWebhook);
router.put("/carrier/webhook", auditCarrierWebhook, orderController.handleCarrierWebhook);

// // All other routes require auth + branch context
router.use(protect, resolveAccessContext);

router.get(
  "/stats/summary",
  authorize(AUTHZ_ACTIONS.ORDERS_READ, { scopeMode: "branch", requireActiveBranch: true, resourceType: "ORDER" }),
  orderController.getOrderStats
);

router.get("/all", requireOrderManagementRead, orderController.getAllOrders);
router.get("/", requireOrderManagementRead, orderController.getAllOrders);
router.get("/my-orders", requireOrderRead, orderController.getAllOrders);
router.get(
  "/:id/audit-logs",
  authorize(AUTHZ_ACTIONS.ORDER_AUDIT_READ, {
    scopeMode: resolveAuditScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER_AUDIT",
  }),
  getOrderAuditLogs
);
router.get("/:id", requireOrderRead, orderController.getOrderById);

router.post("/", requireOrderCreate, auditCreateOrder, orderController.createOrder);

router.patch("/:id/cancel", requireOrderCancel, auditCancelOrder, orderController.cancelOrder);
router.post("/:id/cancel", requireOrderCancel, auditCancelOrder, orderController.cancelOrder);

router.patch(
  "/:id/status",
  authorize(resolveOrderStatusWriteAction, {
    scopeMode: resolveOrderStatusScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  auditUpdateStatus,
  orderController.updateOrderStatus
);
router.put(
  "/:id/status",
  authorize(resolveOrderStatusWriteAction, {
    scopeMode: resolveOrderStatusScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  auditUpdateStatus,
  orderController.updateOrderStatus
);

router.patch(
  "/:id/assign-carrier",
  authorize(AUTHZ_ACTIONS.ORDER_ASSIGN_CARRIER, {
    scopeMode: resolveOrderWriteScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  auditAssignCarrier,
  orderController.assignCarrier
);
router.put(
  "/:id/assign-carrier",
  authorize(AUTHZ_ACTIONS.ORDER_ASSIGN_CARRIER, {
    scopeMode: resolveOrderWriteScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  auditAssignCarrier,
  orderController.assignCarrier
);

router.patch(
  "/:id/payment",
  authorize(AUTHZ_ACTIONS.ORDERS_WRITE, {
    scopeMode: resolveOrderWriteScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  auditUpdatePaymentStatus,
  orderController.updatePaymentStatus
);
router.put(
  "/:id/payment",
  authorize(AUTHZ_ACTIONS.ORDERS_WRITE, {
    scopeMode: resolveOrderWriteScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  auditUpdatePaymentStatus,
  orderController.updatePaymentStatus
);

router.patch(
  "/:id/assign-store",
  authorize(AUTHZ_ACTIONS.ORDER_ASSIGN_STORE, {
    scopeMode: resolveOrderWriteScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  auditAssignBranch,
  orderController.assignStore
);

// ✅ SAFE-CANCEL ROLLBACK: Cho phép admin khôi phục trạng thái trong vòng 2 giờ
router.post(
  "/:id/revert",
  authorize(AUTHZ_ACTIONS.ORDER_STATUS_MANAGE, {
    scopeMode: resolveOrderWriteScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER",
  }),
  orderController.revertOrderStatus
);

export default router;
