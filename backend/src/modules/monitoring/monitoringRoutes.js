import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import * as monitoringController from "./monitoringController.js";

const router = express.Router();

router.use(protect);

// Used by checkout to evaluate per-user rollout eligibility.
router.get("/omnichannel/rollout", monitoringController.getOmnichannelRolloutDecision);

router.use(
  resolveAccessContext,
  authorize(AUTHZ_ACTIONS.MONITORING_READ, {
    scopeMode: (req) => (req.authz?.isGlobalAdmin ? "global" : "branch"),
    requireActiveBranchFor: ["branch"],
    resourceType: "MONITORING",
  })
);

router.get("/omnichannel/summary", monitoringController.getOmnichannelSummary);
router.get("/omnichannel/events", monitoringController.listOmnichannelEvents);

export default router;
