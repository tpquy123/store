// ============================================
// FILE: backend/src/modules/productType/productTypeRoutes.js
// ============================================

import express from "express";
import controller from "./productTypeController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";

const router = express.Router();

router.get("/public", controller.findAllPublic);

router.use(protect, resolveAccessContext);
router.use(
  authorize(AUTHZ_ACTIONS.PRODUCT_TYPE_MANAGE, {
    scopeMode: (req) => (req.authz?.isGlobalAdmin ? "global" : "branch"),
    requireActiveBranchFor: ["branch"],
    resourceType: "PRODUCT_TYPE",
  })
);

router.post("/", controller.create);
router.get("/", controller.findAll);
router.get("/:id", controller.findOne);
router.put("/:id", controller.update);
router.delete("/:id", controller.deleteProductType);

export default router;
