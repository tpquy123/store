// routes/promotionRoutes.js
import express from "express";
import {
  getActivePromotions,
  getAllPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  applyPromotion,
} from "./promotionController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";

const router = express.Router();

// ==================== PUBLIC / CUSTOMER ====================
router.get("/active", getActivePromotions);           // GET /promotions/active
router.post(
  "/apply",
  protect,
  resolveAccessContext,
  authorize(null, {
    anyOf: [AUTHZ_ACTIONS.PROMOTION_APPLY_SELF, AUTHZ_ACTIONS.PROMOTION_MANAGE],
    scopeMode: (req) =>
      req.authz?.permissions?.has(AUTHZ_ACTIONS.PROMOTION_MANAGE)
        ? req.authz?.isGlobalAdmin
          ? "global"
          : "branch"
        : "self",
    requireActiveBranchFor: ["branch"],
    resourceType: "PROMOTION",
  }),
  applyPromotion
);        // POST /promotions/apply

// ==================== ADMIN ONLY ====================
router.use(
  protect,
  resolveAccessContext,
  authorize(AUTHZ_ACTIONS.PROMOTION_MANAGE, {
    scopeMode: (req) => (req.authz?.isGlobalAdmin ? "global" : "branch"),
    requireActiveBranchFor: ["branch"],
    resourceType: "PROMOTION",
  })
);

// Đổi từ "/" → "/admin" để rõ ràng hơn
router.get("/admin", getAllPromotions);        // GET /promotions/admin
router.post("/", createPromotion);             // POST /promotions
router.put("/:id", updatePromotion);           // PUT /promotions/:id
router.delete("/:id", deletePromotion);        // DELETE /promotions/:id

export default router;
