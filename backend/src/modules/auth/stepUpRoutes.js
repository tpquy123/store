import express from "express";
import rateLimit from "express-rate-limit";
import {
  requestStepUp,
  verifyStepUpOTP,
  resendStepUpOTP,
  getStepUpStatusHandler,
} from "./stepUpController.js";

const router = express.Router();

// Rate limiter cho resend OTP — tối đa 1 request / 60 giây mỗi user
const resendLimiter = rateLimit({
  windowMs: 60 * 1000, // 60 giây
  max: 1,
  keyGenerator: (req) => `stepup-resend:${req.user?._id || req.ip}`,
  message: {
    success: false,
    code: "STEP_UP_RATE_LIMITED",
    message: "Please wait 60 seconds before requesting another OTP",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter chung cho verify — ngăn brute force
const verifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 10,
  keyGenerator: (req) => `stepup-verify:${req.user?._id || req.ip}`,
  message: {
    success: false,
    code: "STEP_UP_RATE_LIMITED",
    message: "Too many verification attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/step-up/request
router.post("/request", requestStepUp);

// POST /api/auth/step-up/verify
router.post("/verify", verifyLimiter, verifyStepUpOTP);

// POST /api/auth/step-up/resend
router.post("/resend", resendLimiter, resendStepUpOTP);

// GET /api/auth/step-up/status?action=product.delete
router.get("/status", getStepUpStatusHandler);

export default router;
