import express from "express";
import {
  register,
  login,
  logout,
  changePassword,
  getCurrentUser,
  updateAvatar,
  checkCustomerByPhone,
  quickRegisterCustomer,
  getEffectivePermissions,
  setActiveBranchContext,
  setSimulatedBranchContext,
  clearSimulatedBranchContext,
} from "./authController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { checkPermission } from "../../middleware/authz/checkPermission.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";

const router = express.Router();

const resolveUserScopeMode = (req) => (req.authz?.isGlobalAdmin ? "global" : "branch");

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protect, resolveAccessContext, getCurrentUser);
router.get("/context/permissions", protect, resolveAccessContext, getEffectivePermissions);
router.put("/context/active-branch", protect, resolveAccessContext, setActiveBranchContext);
router.put("/context/simulate-branch", protect, resolveAccessContext, setSimulatedBranchContext);
router.delete("/context/simulate-branch", protect, resolveAccessContext, clearSimulatedBranchContext);
router.put("/change-password", protect, changePassword);
router.put("/avatar", protect, updateAvatar);
router.get(
  "/check-customer",
  protect,
  resolveAccessContext,
  checkPermission(AUTHZ_ACTIONS.USERS_READ_BRANCH, {
    scopeMode: resolveUserScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "USER",
  }),
  checkCustomerByPhone
);
router.post(
  "/quick-register",
  protect,
  resolveAccessContext,
  checkPermission(AUTHZ_ACTIONS.USERS_MANAGE_BRANCH, {
    scopeMode: resolveUserScopeMode,
    requireActiveBranchFor: ["branch"],
    resourceType: "USER",
  }),
  quickRegisterCustomer
);

export default router;
