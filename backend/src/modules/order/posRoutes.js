import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import { orderAuditMiddleware } from "./orderAuditMiddleware.js";
import { ORDER_AUDIT_ACTIONS } from "./orderAuditActions.js";
import {
  createPOSOrder,
  getPendingOrders,
  processPayment,
  cancelPendingOrder,
  issueVATInvoice,
  getPOSOrderHistory,
  finalizePOSOrder,
  getPOSOrderById,
} from "./posController.js";

const router = express.Router();

const resolvePosScopeMode = (req) => {
  if (req?.authz?.isGlobalAdmin) {
    return "global";
  }
  return "branch";
};

const requirePosReadSelf = authorize(AUTHZ_ACTIONS.POS_ORDER_READ_SELF, {
  scopeMode: "self",
  resourceType: "ORDER",
});

const requirePosReadBranch = authorize(AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH, {
  scopeMode: resolvePosScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const requirePosCreate = authorize(AUTHZ_ACTIONS.POS_ORDER_CREATE, {
  scopeMode: "branch",
  requireActiveBranch: true,
  resourceType: "ORDER",
});

const requirePosPayment = authorize(AUTHZ_ACTIONS.POS_PAYMENT_PROCESS, {
  scopeMode: resolvePosScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const requirePosCancel = authorize(AUTHZ_ACTIONS.POS_ORDER_CANCEL, {
  scopeMode: resolvePosScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const requirePosFinalize = authorize(AUTHZ_ACTIONS.POS_ORDER_FINALIZE, {
  scopeMode: resolvePosScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const requirePosVat = authorize(AUTHZ_ACTIONS.POS_VAT_ISSUE, {
  scopeMode: resolvePosScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
});

const auditCreatePOSOrder = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.CREATE_POS_ORDER,
  source: "POS_API",
});
const auditPOSPayment = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.PROCESS_POS_PAYMENT,
  source: "POS_API",
});
const auditPOSCancel = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.CANCEL_ORDER,
  source: "POS_API",
});
const auditPOSVat = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.ISSUE_POS_VAT_INVOICE,
  source: "POS_API",
});
const auditPOSFinalize = orderAuditMiddleware({
  actionType: ORDER_AUDIT_ACTIONS.FINALIZE_POS_ORDER,
  source: "POS_API",
});

router.use(protect, resolveAccessContext);

router.post(
  "/create-order",
  requirePosCreate,
  auditCreatePOSOrder,
  createPOSOrder
);
router.get("/my-orders", requirePosReadSelf, getPOSOrderHistory);
router.get("/orders/:id", authorize(null, {
  anyOf: [AUTHZ_ACTIONS.POS_ORDER_READ_SELF, AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH],
  scopeMode: (req) =>
    req.authz?.permissions?.has(AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH) ? resolvePosScopeMode(req) : "self",
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
}), getPOSOrderById);

router.get("/pending-orders", requirePosReadBranch, getPendingOrders);
router.post(
  "/orders/:orderId/payment",
  requirePosPayment,
  auditPOSPayment,
  processPayment
);
router.post(
  "/orders/:orderId/cancel",
  requirePosCancel,
  auditPOSCancel,
  cancelPendingOrder
);
router.post(
  "/orders/:orderId/vat",
  requirePosVat,
  auditPOSVat,
  issueVATInvoice
);
router.put(
  "/orders/:orderId/finalize",
  requirePosFinalize,
  auditPOSFinalize,
  finalizePOSOrder
);

router.get("/history", authorize(null, {
  anyOf: [AUTHZ_ACTIONS.POS_ORDER_READ_SELF, AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH],
  scopeMode: (req) =>
    req.authz?.permissions?.has(AUTHZ_ACTIONS.POS_ORDER_READ_BRANCH) ? resolvePosScopeMode(req) : "self",
  requireActiveBranchFor: ["branch"],
  resourceType: "ORDER",
}), getPOSOrderHistory);
router.get("/history/all", requirePosReadBranch, getPOSOrderHistory);

export default router;
