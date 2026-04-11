/**
 * emailOTPController.js
 * ───────────────────────────────────────────────────────────────────
 * Handles customer email OTP verification flow:
 *   POST /api/auth/send-email-otp    — generate & send OTP
 *   POST /api/auth/verify-email-otp  — verify OTP & mark emailVerified = true
 *   POST /api/auth/resend-email-otp  — resend OTP for existing session
 * ───────────────────────────────────────────────────────────────────
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "./User.js";
import EmailOTPToken from "./EmailOTPToken.js";
import { sendOTPEmail, sendWelcomeEmail } from "../../services/emailService.js";

// ────────────────────────────────────────────────────────────────
//  Constants
// ────────────────────────────────────────────────────────────────
const OTP_TTL_MINUTES = 10;
const OTP_BCRYPT_COST = 6; // Fast enough for OTP; security is in TTL+attempts
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// ────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────
const generateOTPCode = () => {
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % 1_000_000;
  return String(num).padStart(6, "0");
};

const maskEmail = (email = "") => {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 2) return "****@" + (domain || "***");
  return local[0] + "*".repeat(Math.min(local.length - 2, 4)) + local[local.length - 1] + "@" + domain;
};

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/send-email-otp
// ────────────────────────────────────────────────────────────────
/**
 * Requires: authenticated user (via `protect` middleware).
 * Body: { email }  — the email to verify (must not be taken by another user)
 *
 * Flow:
 *  1. Validate email
 *  2. Ensure not taken by another user
 *  3. Invalidate any pending OTP session for this user
 *  4. Generate OTP, hash, store EmailOTPToken
 *  5. Send email via emailService
 *  6. Return { sessionId, maskedEmail, expiresAt }
 */
export const sendEmailOTP = async (req, res) => {
  try {
    const userId = String(req.user._id);
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        code: "EMAIL_OTP_EMAIL_REQUIRED",
        message: "Vui lòng cung cấp địa chỉ email",
      });
    }

    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_OTP_INVALID_EMAIL",
        message: "Địa chỉ email không hợp lệ",
      });
    }

    // Check if email is already taken by another user
    const existingOwner = await User.findOne({
      email: normalized,
      _id: { $ne: userId },
    }).lean();

    if (existingOwner) {
      return res.status(409).json({
        success: false,
        code: "EMAIL_OTP_EMAIL_TAKEN",
        message: "Email này đã được sử dụng bởi tài khoản khác",
      });
    }

    // Check if user already verified this exact email
    const currentUser = await User.findById(userId).lean();
    if (currentUser?.emailVerified && currentUser?.email === normalized) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_OTP_ALREADY_VERIFIED",
        message: "Email này đã được xác thực trước đó",
      });
    }

    // Cooldown check — prevent spam resend
    const recentPending = await EmailOTPToken.findOne({
      userId,
      email: normalized,
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (recentPending) {
      const elapsed = Date.now() - new Date(recentPending.createdAt).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          code: "EMAIL_OTP_RATE_LIMITED",
          message: `Vui lòng chờ ${waitSec} giây trước khi gửi lại mã OTP`,
          retryAfterSeconds: waitSec,
        });
      }
    }

    // Invalidate all previous PENDING tokens for this user
    await EmailOTPToken.updateMany(
      { userId, status: "PENDING" },
      { $set: { status: "EXPIRED" } }
    );

    // Generate OTP
    const otp = generateOTPCode();
    const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_COST);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await EmailOTPToken.create({
      userId,
      email: normalized,
      otpHash,
      sessionId,
      status: "PENDING",
      attempts: 0,
      maxAttempts: MAX_OTP_ATTEMPTS,
      expiresAt,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      userAgent: req.headers["user-agent"] || "",
    });

    // Send OTP email — will THROW if SMTP not configured
    await sendOTPEmail({
      to: normalized,
      otp,
      ttlMinutes: OTP_TTL_MINUTES,
      type: "email_verification",
    });

    return res.status(200).json({
      success: true,
      message: "Mã OTP đã được gửi tới email của bạn",
      data: {
        sessionId,
        maskedEmail: maskEmail(normalized),
        expiresAt,
        ttlMinutes: OTP_TTL_MINUTES,
      },
    });
  } catch (error) {
    console.error("[EmailOTP] sendEmailOTP error:", error);

    // Surface SMTP config errors explicitly
    if (error.code === "SMTP_CONFIG_MISSING") {
      return res.status(503).json({
        success: false,
        code: "EMAIL_SERVICE_UNAVAILABLE",
        message: "Dịch vụ gửi email chưa được cấu hình. Vui lòng liên hệ admin.",
      });
    }

    return res.status(500).json({
      success: false,
      code: "EMAIL_OTP_SEND_FAILED",
      message: error.message || "Không thể gửi mã OTP. Vui lòng thử lại.",
    });
  }
};

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/verify-email-otp
// ────────────────────────────────────────────────────────────────
/**
 * Body: { sessionId, otp }
 *
 * Flow:
 *  1. Find PENDING session
 *  2. Check max attempts
 *  3. bcrypt.compare(otp, hash)
 *  4. Mark VERIFIED, update User.email = session.email, emailVerified = true
 *  5. Send welcome email (non-blocking)
 *  6. Return updated user
 */
export const verifyEmailOTP = async (req, res) => {
  try {
    const userId = String(req.user._id);
    const { sessionId, otp } = req.body;

    if (!sessionId || !otp) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_OTP_MISSING_PARAMS",
        message: "sessionId và otp là bắt buộc",
      });
    }

    const record = await EmailOTPToken.findOne({
      userId,
      sessionId,
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    }).select("+otpHash");

    if (!record) {
      return res.status(404).json({
        success: false,
        code: "EMAIL_OTP_SESSION_NOT_FOUND",
        message: "Phiên OTP không tồn tại hoặc đã hết hạn. Vui lòng yêu cầu mã mới.",
      });
    }

    // Max attempts check
    if (record.attempts >= record.maxAttempts) {
      record.status = "EXPIRED";
      await record.save();
      return res.status(429).json({
        success: false,
        code: "EMAIL_OTP_TOO_MANY_ATTEMPTS",
        message: "Quá nhiều lần thử sai. Phiên OTP đã bị vô hiệu hóa. Vui lòng yêu cầu mã mới.",
      });
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp, record.otpHash);
    if (!isValid) {
      record.attempts += 1;
      await record.save();
      const attemptsLeft = record.maxAttempts - record.attempts;
      return res.status(400).json({
        success: false,
        code: "EMAIL_OTP_INVALID",
        message: `Mã OTP không đúng. Còn ${attemptsLeft} lần thử.`,
        data: { attemptsLeft },
      });
    }

    // Mark token as VERIFIED
    record.status = "VERIFIED";
    await record.save();

    // Update user: set email + emailVerified
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          email: record.email,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      },
      { new: true }
    );

    // Send welcome email in background (don't await — should not block response)
    sendWelcomeEmail({ to: record.email, fullName: updatedUser?.fullName || "" }).catch((err) => {
      console.warn("[EmailOTP] Welcome email failed (non-critical):", err.message);
    });

    return res.status(200).json({
      success: true,
      message: "Email đã được xác thực thành công! 🎉",
      data: {
        emailVerified: true,
        email: record.email,
        emailVerifiedAt: updatedUser.emailVerifiedAt,
        user: {
          _id: updatedUser._id,
          fullName: updatedUser.fullName,
          email: updatedUser.email,
          emailVerified: updatedUser.emailVerified,
          phoneNumber: updatedUser.phoneNumber,
        },
      },
    });
  } catch (error) {
    console.error("[EmailOTP] verifyEmailOTP error:", error);
    return res.status(500).json({
      success: false,
      code: "EMAIL_OTP_VERIFY_FAILED",
      message: error.message || "Xác thực OTP thất bại. Vui lòng thử lại.",
    });
  }
};

// ────────────────────────────────────────────────────────────────
//  POST /api/auth/resend-email-otp
// ────────────────────────────────────────────────────────────────
/**
 * Body: { sessionId }
 * Generates a new OTP for the same email, invalidates old session.
 */
export const resendEmailOTP = async (req, res) => {
  try {
    const userId = String(req.user._id);
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_OTP_SESSION_REQUIRED",
        message: "sessionId là bắt buộc",
      });
    }

    const oldRecord = await EmailOTPToken.findOne({
      userId,
      sessionId,
      status: "PENDING",
    });

    if (!oldRecord) {
      return res.status(404).json({
        success: false,
        code: "EMAIL_OTP_SESSION_NOT_FOUND",
        message: "Phiên OTP không tồn tại. Vui lòng yêu cầu mã mới.",
      });
    }

    const emailToVerify = oldRecord.email;

    // Invalidate old session
    oldRecord.status = "EXPIRED";
    await oldRecord.save();

    // Create new OTP session
    const otp = generateOTPCode();
    const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_COST);
    const newSessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await EmailOTPToken.create({
      userId,
      email: emailToVerify,
      otpHash,
      sessionId: newSessionId,
      status: "PENDING",
      attempts: 0,
      maxAttempts: MAX_OTP_ATTEMPTS,
      expiresAt,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      userAgent: req.headers["user-agent"] || "",
    });

    await sendOTPEmail({
      to: emailToVerify,
      otp,
      ttlMinutes: OTP_TTL_MINUTES,
      type: "email_verification",
    });

    return res.status(200).json({
      success: true,
      message: "Mã OTP mới đã được gửi",
      data: {
        sessionId: newSessionId,
        maskedEmail: maskEmail(emailToVerify),
        expiresAt,
        ttlMinutes: OTP_TTL_MINUTES,
      },
    });
  } catch (error) {
    console.error("[EmailOTP] resendEmailOTP error:", error);

    if (error.code === "SMTP_CONFIG_MISSING") {
      return res.status(503).json({
        success: false,
        code: "EMAIL_SERVICE_UNAVAILABLE",
        message: "Dịch vụ gửi email chưa được cấu hình.",
      });
    }

    return res.status(500).json({
      success: false,
      code: "EMAIL_OTP_RESEND_FAILED",
      message: error.message || "Không thể gửi lại mã OTP.",
    });
  }
};

export default { sendEmailOTP, verifyEmailOTP, resendEmailOTP };
