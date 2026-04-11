import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import controller from "./warrantyController.js";

const router = express.Router();

const publicLookupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/lookup", publicLookupRateLimit, controller.publicWarrantyLookup);
router.get("/search", publicLookupRateLimit, controller.publicWarrantySearch);

router.use(protect, resolveAccessContext);

router.get(
  "/",
  authorize(AUTHZ_ACTIONS.WARRANTY_READ, {
    scopeMode: "branch",
    requireActiveBranch: true,
    resourceType: "WARRANTY",
  }),
  controller.listWarranties
);

router.get(
  "/:id",
  authorize(AUTHZ_ACTIONS.WARRANTY_READ, {
    scopeMode: "branch",
    requireActiveBranch: true,
    resourceType: "WARRANTY",
  }),
  controller.getWarrantyById
);

router.patch(
  "/:id/status",
  authorize(AUTHZ_ACTIONS.WARRANTY_WRITE, {
    scopeMode: "branch",
    requireActiveBranch: true,
    resourceType: "WARRANTY",
  }),
  controller.updateWarrantyStatus
);

export default router;
