import {
  generateStepUpRequest,
  resendOTP,
  verifyOTP,
  getStepUpStatus,
} from "../../authz/stepUpService.js";
import { STEP_UP_REQUIRED_ACTIONS, getActionGroup } from "../../authz/actions.js";

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/step-up/request
//  Tạo session step-up mới và gửi OTP
// ────────────────────────────────────────────────────────────────
export const requestStepUp = async (req, res) => {
  try {
    const { action, actionGroup: bodyActionGroup } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        code: "STEP_UP_ACTION_REQUIRED",
        message: "action is required",
      });
    }

    const normalizedAction = String(action).toLowerCase().trim();

    // Chỉ cho phép request step-up cho các action đã được cấu hình
    if (!STEP_UP_REQUIRED_ACTIONS[normalizedAction]) {
      return res.status(400).json({
        success: false,
        code: "STEP_UP_NOT_REQUIRED",
        message: "This action does not require step-up authentication",
      });
    }

    const userId = String(req.user._id);
    const result = await generateStepUpRequest({ userId, action: normalizedAction, req });

    return res.status(200).json({
      success: true,
      data: {
        sessionToken: result.sessionId,
        expiresAt: result.expiresAt,
        delivery: result.delivery,
        maskedContact: result.maskedContact,
        actionGroup: result.actionGroup,
      },
    });
  } catch (error) {
    console.error("[StepUp] requestStepUp error:", error);
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || "STEP_UP_REQUEST_FAILED",
      message: error.message || "Failed to initiate step-up",
    });
  }
};

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/step-up/verify
//  Xác minh OTP và trả về step-up JWT token
// ────────────────────────────────────────────────────────────────
export const verifyStepUpOTP = async (req, res) => {
  try {
    const { sessionToken, otp } = req.body;

    if (!sessionToken || !otp) {
      return res.status(400).json({
        success: false,
        code: "STEP_UP_MISSING_PARAMS",
        message: "sessionToken and otp are required",
      });
    }

    const userId = String(req.user._id);
    const result = await verifyOTP({ userId, sessionId: sessionToken, otp });

    return res.status(200).json({
      success: true,
      data: {
        stepUpToken: result.stepUpToken,
        expiresAt: result.expiresAt,
        actionGroup: result.actionGroup,
        gracePeriodExpiresAt: result.gracePeriodExpiresAt,
      },
    });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({
      success: false,
      code: error.code || "STEP_UP_VERIFY_FAILED",
      message: error.message || "OTP verification failed",
      data: error.attemptsLeft !== undefined ? { attemptsLeft: error.attemptsLeft } : undefined,
    });
  }
};

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/step-up/resend
//  Gửi lại OTP cho session đang pending (rate limit: 1 lần / 60s enforce ở route level)
// ────────────────────────────────────────────────────────────────
export const resendStepUpOTP = async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        code: "STEP_UP_SESSION_REQUIRED",
        message: "sessionToken is required",
      });
    }

    const userId = String(req.user._id);
    const result = await resendOTP({ userId, sessionId: sessionToken, req });

    return res.status(200).json({
      success: true,
      data: { expiresAt: result.expiresAt },
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      code: error.code || "STEP_UP_RESEND_FAILED",
      message: error.message || "Failed to resend OTP",
    });
  }
};

// ────────────────────────────────────────────────────────────────
//  GET /api/auth/step-up/status?action=product.delete
//  Kiểm tra xem action có cần step-up không và grace period còn không
// ────────────────────────────────────────────────────────────────
export const getStepUpStatusHandler = async (req, res) => {
  try {
    const { action } = req.query;

    if (!action) {
      return res.status(400).json({
        success: false,
        code: "STEP_UP_ACTION_REQUIRED",
        message: "action query parameter is required",
      });
    }

    const normalizedAction = String(action).toLowerCase().trim();
    const requiresStepUp = Boolean(STEP_UP_REQUIRED_ACTIONS[normalizedAction]);

    if (!requiresStepUp) {
      return res.status(200).json({
        success: true,
        data: {
          requiresStepUp: false,
          inGracePeriod: false,
          gracePeriodExpiresAt: null,
          actionGroup: null,
        },
      });
    }

    const userId = String(req.user._id);
    const status = await getStepUpStatus({ userId, action: normalizedAction });

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: "STEP_UP_STATUS_ERROR",
      message: error.message || "Failed to get step-up status",
    });
  }
};

export default {
  requestStepUp,
  verifyStepUpOTP,
  resendStepUpOTP,
  getStepUpStatusHandler,
};
