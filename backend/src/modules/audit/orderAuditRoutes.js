import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import { getOrderAuditLogsAdmin } from "./orderAuditAdminController.js";

const router = express.Router();

const resolveAuditScopeMode = (req) => {
  if (req?.authz?.isGlobalAdmin) {
    return "global";
  }
  return "branch";
};

router.use(protect, resolveAccessContext);

router.get(
  "/orders",
  authorize(AUTHZ_ACTIONS.ORDER_AUDIT_READ, {
    scopeMode: resolveAuditScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "ORDER_AUDIT",
  }),
  getOrderAuditLogsAdmin
);

export default router;
