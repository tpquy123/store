// ============================================
// FILE: backend/src/routes/cartRoutes.js
// ============================================
import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import {
  getCart,
  getCartCount,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  validateCart,
} from "./cartController.js";

const router = express.Router();

router.use(
  protect,
  resolveAccessContext,
  authorize(AUTHZ_ACTIONS.CART_MANAGE_SELF, {
    scopeMode: "self",
    resourceType: "CART",
  })
);

router.get("/count", getCartCount);
router.get("/", getCart);
router.post("/", addToCart);
router.put("/", updateCartItem);
router.delete("/:itemId", removeFromCart);
router.delete("/", clearCart);
router.post("/validate", validateCart);

export default router;
