import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import StepUpToken from "../modules/auth/StepUpToken.js";
import StepUpGracePeriod from "../modules/auth/StepUpGracePeriod.js";
import User from "../modules/auth/User.js";
import { getActionGroup, STEP_UP_ACTION_GROUPS } from "./actions.js";

const STEP_UP_JWT_SECRET = process.env.STEP_UP_JWT_SECRET || process.env.JWT_SECRET + "_stepup";
const STEP_UP_TOKEN_TTL_MINUTES = 5;
const OTP_TTL_MINUTES = 10;
const GRACE_PERIOD_MINUTES = 15;
const OTP_BCRYPT_COST = 6; // Nhanh hơn cost 10, đủ an toàn cho OTP ngắn hạn
const MAX_OTP_ATTEMPTS = 5;

// ────────────────────────────────────────────────────────────────
//  Helper: tạo OTP 6 chữ số
// ────────────────────────────────────────────────────────────────
const generateOTPCode = () => {
  // Dùng crypto để tạo số ngẫu nhiên cryptographically secure
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % 1000000;
  return String(num).padStart(6, "0");
};

// ────────────────────────────────────────────────────────────────
//  Helper: mask contact (che bớt email/số điện thoại)
// ────────────────────────────────────────────────────────────────
const maskEmail = (email = "") => {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 2) return "****@" + (domain || "***");
  return local[0] + "*".repeat(Math.min(local.length - 2, 4)) + local[local.length - 1] + "@" + domain;
};

const maskPhone = (phone = "") => {
  if (phone.length < 6) return "****";
  return phone.slice(0, 3) + "*".repeat(phone.length - 6) + phone.slice(-3);
};

// ────────────────────────────────────────────────────────────────
//  Helper: gửi OTP qua email
// ────────────────────────────────────────────────────────────────
const sendOTPEmail = async (email, otp, action) => {
  if (!email) throw new Error("Email address is required for OTP delivery");

  // Nếu không có SMTP config, log ra console (development mode)
  if (!process.env.SMTP_HOST && !process.env.SENDGRID_API_KEY) {
    console.warn(`[StepUp DEV] OTP for ${email} (action: ${action}): ${otp}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "noreply@smartmobilestore.vn",
    to: email,
    subject: `[SmartMobile] Mã OTP xác nhận thao tác nhạy cảm`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; margin-bottom: 8px;">Xác nhận thao tác bảo mật</h2>
        <p style="color: #555; margin-bottom: 20px;">
          Bạn vừa yêu cầu thực hiện một thao tác cần xác minh danh tính bổ sung.
        </p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
          <p style="font-size: 14px; color: #888; margin: 0 0 8px;">Mã OTP của bạn:</p>
          <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e; margin: 0;">${otp}</p>
        </div>
        <p style="color: #888; font-size: 13px;">
          Mã có hiệu lực trong <strong>${OTP_TTL_MINUTES} phút</strong>. 
          Không chia sẻ mã này với bất kỳ ai.
        </p>
        <p style="color: #bbb; font-size: 12px; margin-top: 16px;">
          Nếu bạn không thực hiện yêu cầu này, vui lòng liên hệ bộ phận hỗ trợ ngay lập tức.
        </p>
      </div>
    `,
  });
};

// ────────────────────────────────────────────────────────────────
//  generateStepUpRequest — Tạo OTP session mới
// ────────────────────────────────────────────────────────────────
/**
 * Tạo một step-up session mới, hash OTP và gửi qua delivery method.
 *
 * @param {{ userId: string, action: string, req: object }} options
 * @returns {{ sessionId, expiresAt, delivery, maskedContact }}
 */
export const generateStepUpRequest = async ({ userId, action, req } = {}) => {
  const user = await User.findById(userId).select("email phoneNumber stepUpConfig").lean();
  if (!user) throw Object.assign(new Error("User not found"), { status: 404, code: "USER_NOT_FOUND" });

  const actionGroup = getActionGroup(action) || "";
  const delivery = user.stepUpConfig?.preferredMethod || "EMAIL";
  const sessionId = crypto.randomUUID();
  const otp = generateOTPCode();
  const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_COST);

  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const ipAddress = req?.ip || req?.headers?.["x-forwarded-for"] || "";
  const userAgent = req?.headers?.["user-agent"] || "";

  await StepUpToken.create({
    userId,
    action: String(action).toLowerCase().trim(),
    actionGroup: actionGroup || "",
    sessionId,
    otp: otpHash,
    otpDelivery: delivery,
    status: "PENDING",
    attempts: 0,
    maxAttempts: MAX_OTP_ATTEMPTS,
    expiresAt,
    ipAddress,
    userAgent,
  });

  let maskedContact = "";
  if (delivery === "EMAIL") {
    maskedContact = maskEmail(user.email || "");
    await sendOTPEmail(user.email, otp, action);
  } else if (delivery === "SMS") {
    maskedContact = maskPhone(user.phoneNumber || "");
    // TODO: integrate ESMS.vn / Twilio
    console.warn(`[StepUp DEV] SMS OTP for ${user.phoneNumber} (action: ${action}): ${otp}`);
  } else if (delivery === "TOTP") {
    maskedContact = "Google Authenticator";
    // TOTP dùng secret riêng — không cần gửi
  }

  return { sessionId, expiresAt, delivery, maskedContact, actionGroup };
};

// ────────────────────────────────────────────────────────────────
//  resendOTP — Gửi lại OTP cho session đang pending
// ────────────────────────────────────────────────────────────────
export const resendOTP = async ({ userId, sessionId, req } = {}) => {
  const record = await StepUpToken.findOne({
    userId,
    sessionId,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  }).select("+otp");

  if (!record) {
    throw Object.assign(new Error("Session not found or expired"), {
      status: 404,
      code: "STEP_UP_SESSION_NOT_FOUND",
    });
  }

  const user = await User.findById(userId).select("email phoneNumber stepUpConfig").lean();
  if (!user) throw Object.assign(new Error("User not found"), { status: 404, code: "USER_NOT_FOUND" });

  const otp = generateOTPCode();
  const otpHash = await bcrypt.hash(otp, OTP_BCRYPT_COST);

  // Reset attempts và cập nhật OTP mới
  record.otp = otpHash;
  record.attempts = 0;
  record.expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await record.save();

  if (record.otpDelivery === "EMAIL") {
    await sendOTPEmail(user.email, otp, record.action);
  } else if (record.otpDelivery === "SMS") {
    console.warn(`[StepUp DEV] Resend SMS OTP for ${user.phoneNumber}: ${otp}`);
  }

  return { expiresAt: record.expiresAt };
};

// ────────────────────────────────────────────────────────────────
//  verifyOTP — Xác minh OTP, tạo step-up JWT
// ────────────────────────────────────────────────────────────────
/**
 * Xác minh OTP, tạo step-up JWT token (single-use, 5 phút).
 * Sau khi verify thành công, upsert grace period record.
 *
 * @param {{ userId: string, sessionId: string, otp: string }} options
 * @returns {{ stepUpToken, expiresAt, actionGroup, gracePeriodExpiresAt }}
 */
export const verifyOTP = async ({ userId, sessionId, otp } = {}) => {
  const record = await StepUpToken.findOne({
    userId,
    sessionId,
    status: "PENDING",
    expiresAt: { $gt: new Date() },
  }).select("+otp");

  if (!record) {
    throw Object.assign(new Error("Session not found, expired, or already used"), {
      status: 404,
      code: "STEP_UP_SESSION_NOT_FOUND",
    });
  }

  // Kiểm tra số lần thử
  if (record.attempts >= record.maxAttempts) {
    record.status = "EXPIRED";
    await record.save();
    throw Object.assign(new Error("Too many incorrect attempts. Session has been invalidated."), {
      status: 429,
      code: "STEP_UP_TOO_MANY_ATTEMPTS",
    });
  }

  const isValid = await bcrypt.compare(otp, record.otp);
  if (!isValid) {
    record.attempts += 1;
    await record.save();
    throw Object.assign(
      new Error(`Incorrect OTP. ${record.maxAttempts - record.attempts} attempts remaining.`),
      { status: 400, code: "STEP_UP_INVALID_OTP", attemptsLeft: record.maxAttempts - record.attempts }
    );
  }

  // OTP đúng — tạo step-up JWT
  const tokenExpiresAt = new Date(Date.now() + STEP_UP_TOKEN_TTL_MINUTES * 60 * 1000);
  const payload = {
    userId: String(userId),
    action: record.action,
    actionGroup: record.actionGroup,
    sessionId,
    typ: "STEP_UP",
  };

  const stepUpToken = jwt.sign(payload, STEP_UP_JWT_SECRET, {
    expiresIn: `${STEP_UP_TOKEN_TTL_MINUTES}m`,
  });

  // Đánh dấu session đã verified (single-use enforcement)
  record.status = "VERIFIED";
  record.stepUpToken = stepUpToken; // store for audit (không dùng để validate)
  record.tokenExpiresAt = tokenExpiresAt;
  await record.save();

  // Upsert grace period
  const gracePeriodExpiresAt = new Date(Date.now() + GRACE_PERIOD_MINUTES * 60 * 1000);
  if (record.actionGroup) {
    await StepUpGracePeriod.findOneAndUpdate(
      { userId, actionGroup: record.actionGroup },
      { $set: { grantedAt: new Date(), expiresAt: gracePeriodExpiresAt } },
      { upsert: true, new: true }
    );
  }

  return { stepUpToken, expiresAt: tokenExpiresAt, actionGroup: record.actionGroup, gracePeriodExpiresAt };
};

// ────────────────────────────────────────────────────────────────
//  validateStepUpToken — Validate JWT + single-use check
// ────────────────────────────────────────────────────────────────
/**
 * Xác minh step-up JWT token.
 * Sau khi validate, đánh dấu là USED để enforce single-use.
 *
 * @param {string} stepUpToken - JWT từ header X-Step-Up-Token
 * @param {string} requiredAction - Action cần verify (optional, để strict check)
 * @returns {{ valid: boolean, userId: string, action: string, reason: string }}
 */
export const validateStepUpToken = async (stepUpToken, requiredAction = null) => {
  if (!stepUpToken) {
    return { valid: false, reason: "No step-up token provided" };
  }

  let payload;
  try {
    payload = jwt.verify(stepUpToken, STEP_UP_JWT_SECRET);
  } catch (err) {
    return { valid: false, reason: err.name === "TokenExpiredError" ? "Step-up token expired" : "Invalid step-up token" };
  }

  if (payload.typ !== "STEP_UP") {
    return { valid: false, reason: "Invalid token type" };
  }

  // Kiểm tra trên DB để enforce single-use (atomic update)
  const record = await StepUpToken.findOneAndUpdate(
    {
      sessionId: payload.sessionId,
      userId: payload.userId,
      status: "VERIFIED",
      usedAt: null,
      tokenExpiresAt: { $gt: new Date() },
    },
    {
      $set: { status: "USED", usedAt: new Date() },
    },
    { new: false }
  );

  if (!record) {
    return { valid: false, reason: "Step-up token has already been used or is invalid" };
  }

  // Nếu cần strict action check
  if (requiredAction) {
    const normalizedRequired = String(requiredAction).toLowerCase().trim();
    const normalizedTokenAction = String(payload.action).toLowerCase().trim();
    const tokenActionGroup = payload.actionGroup || "";
    const groupActions = STEP_UP_ACTION_GROUPS[tokenActionGroup] || [];

    const actionMatches =
      normalizedTokenAction === normalizedRequired ||
      groupActions.includes(normalizedRequired);

    if (!actionMatches) {
      return { valid: false, reason: `Step-up token is for action '${payload.action}', not '${requiredAction}'` };
    }
  }

  return { valid: true, userId: payload.userId, action: payload.action, actionGroup: payload.actionGroup };
};

// ────────────────────────────────────────────────────────────────
//  isInGracePeriod — Kiểm tra grace period
// ────────────────────────────────────────────────────────────────
/**
 * Kiểm tra xem user còn trong grace period cho actionGroup không.
 *
 * @param {{ userId: string, actionGroup: string }} options
 * @returns {Promise<{ inGracePeriod: boolean, expiresAt: Date|null }>}
 */
export const isInGracePeriod = async ({ userId, actionGroup } = {}) => {
  if (!actionGroup) return { inGracePeriod: false, expiresAt: null };

  const grace = await StepUpGracePeriod.findOne({
    userId,
    actionGroup: String(actionGroup).toUpperCase(),
    expiresAt: { $gt: new Date() },
  }).lean();

  return {
    inGracePeriod: Boolean(grace),
    expiresAt: grace?.expiresAt || null,
  };
};

/**
 * revokeGracePeriod — Thu hồi grace period cho một actionGroup.
 */
export const revokeGracePeriod = async ({ userId, actionGroup } = {}) => {
  await StepUpGracePeriod.deleteOne({
    userId,
    actionGroup: String(actionGroup).toUpperCase(),
  });
};

/**
 * getStepUpStatus — Kiểm tra trạng thái step-up cho action cụ thể.
 */
export const getStepUpStatus = async ({ userId, action } = {}) => {
  const actionGroup = getActionGroup(action);

  let inGracePeriod = false;
  let gracePeriodExpiresAt = null;
  if (actionGroup) {
    const graceResult = await isInGracePeriod({ userId, actionGroup });
    inGracePeriod = graceResult.inGracePeriod;
    gracePeriodExpiresAt = graceResult.expiresAt;
  }

  return {
    requiresStepUp: true, // caller đã kiểm tra trước khi gọi hàm này
    inGracePeriod,
    gracePeriodExpiresAt,
    actionGroup,
  };
};

export default {
  generateStepUpRequest,
  resendOTP,
  verifyOTP,
  validateStepUpToken,
  isInGracePeriod,
  revokeGracePeriod,
  getStepUpStatus,
};
