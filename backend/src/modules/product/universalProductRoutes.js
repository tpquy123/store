// ============================================
// FILE: backend/src/modules/product/universalProductRoutes.js
// KILL-SWITCH: restrictTo → authorize
// ============================================

import express from "express";
import controller from "./universalProductController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { requireStepUp } from "../../middleware/authz/requireStepUp.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";

const router = express.Router();
const resolveProductWriteScope = (req) =>
  req?.authz?.isGlobalAdmin ? "global" : "branch";

// Public routes (no auth required)
router.get("/", controller.findAll);
router.get("/:id", (req, res, next) => {
  const { id } = req.params;
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    return controller.findOne(req, res, next);
  }
  return controller.getProductDetail(req, res, next);
});

// Protected routes — V2 Authz
router.use(protect, resolveAccessContext);

router.post(
  "/",
  authorize(AUTHZ_ACTIONS.PRODUCT_CREATE, {
    scopeMode: resolveProductWriteScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "PRODUCT",
  }),
  controller.create
);

router.get(
  "/:id/variants",
  authorize(AUTHZ_ACTIONS.PRODUCT_READ, {
    scopeMode: "branch",
    resourceType: "PRODUCT",
  }),
  controller.getVariants
);

router.put(
  "/:id",
  authorize(AUTHZ_ACTIONS.PRODUCT_UPDATE, {
    scopeMode: resolveProductWriteScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "PRODUCT",
  }),
  controller.update
);

router.delete(
  "/:id",
  authorize(AUTHZ_ACTIONS.PRODUCT_DELETE, {
    scopeMode: resolveProductWriteScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "PRODUCT",
  }),
  requireStepUp(AUTHZ_ACTIONS.PRODUCT_DELETE, { actionGroup: 'PRODUCT_BULK_SENSITIVE' }),
  controller.deleteProduct
);

export default router;
