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
import { sendEmailOTP, verifyEmailOTP, resendEmailOTP } from "./emailOTPController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { checkPermission } from "../../middleware/authz/checkPermission.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import stepUpRoutes from "./stepUpRoutes.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

const resolveUserScopeMode = (req) => (req.authz?.isGlobalAdmin ? "global" : "branch");
const requireCustomerLookup = checkPermission(null, {
  anyOf: [AUTHZ_ACTIONS.USERS_READ_BRANCH, AUTHZ_ACTIONS.POS_ORDER_CREATE],
  scopeMode: resolveUserScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "USER",
});
const requireCustomerQuickRegister = checkPermission(null, {
  anyOf: [AUTHZ_ACTIONS.USERS_MANAGE_BRANCH, AUTHZ_ACTIONS.POS_ORDER_CREATE],
  scopeMode: resolveUserScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "USER",
});

// Rate limiter cho email OTP — tránh spam gửi email
const emailOTPLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 3,
  keyGenerator: (req) => `email-otp-send:${req.user?._id || req.ip}`,
  message: {
    success: false,
    code: "EMAIL_OTP_RATE_LIMITED",
    message: "Quá nhiều yêu cầu. Vui lòng chờ 1 phút trước khi thử lại.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const emailOTPVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 10,
  keyGenerator: (req) => `email-otp-verify:${req.user?._id || req.ip}`,
  message: {
    success: false,
    code: "EMAIL_OTP_RATE_LIMITED",
    message: "Quá nhiều lần thử. Vui lòng thử lại sau.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

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
  requireCustomerLookup,
  checkCustomerByPhone
);
router.post(
  "/quick-register",
  protect,
  resolveAccessContext,
  requireCustomerQuickRegister,
  quickRegisterCustomer
);

// ─── Customer Email OTP Verification ───────────────────────────
// POST /api/auth/send-email-otp  — gửi OTP xác thực email
router.post("/send-email-otp", protect, emailOTPLimiter, sendEmailOTP);

// POST /api/auth/verify-email-otp — xác thực OTP & set emailVerified = true
router.post("/verify-email-otp", protect, emailOTPVerifyLimiter, verifyEmailOTP);

// POST /api/auth/resend-email-otp — gửi lại OTP (tạo session mới)
router.post("/resend-email-otp", protect, emailOTPLimiter, resendEmailOTP);

// Step-up Authentication routes — yêu cầu đăng nhập
router.use("/step-up", protect, stepUpRoutes);

export default router;

