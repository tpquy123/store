import mongoose from "mongoose";

/**
 * StepUpToken — Lưu trữ thông tin OTP và step-up token cho xác thực 2 bước.
 * TTL index tự động dọn dẹp các record hết hạn.
 */
const stepUpTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Action cụ thể đang cần step-up (e.g. "product.delete")
    action: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // Nhóm action (e.g. "PRODUCT_BULK_SENSITIVE") — dùng cho grace period
    actionGroup: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    // UUID duy nhất để identify session này
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    // OTP đã được hash (bcrypt cost 6 để tối ưu hiệu suất)
    otp: {
      type: String,
      required: true,
      select: false,
    },
    // Phương thức gửi OTP
    otpDelivery: {
      type: String,
      enum: ["EMAIL", "SMS", "TOTP"],
      default: "EMAIL",
    },
    // Trạng thái của step-up session
    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "EXPIRED", "USED"],
      default: "PENDING",
      index: true,
    },
    // Số lần nhập OTP sai
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Số lần nhập sai tối đa trước khi khóa
    maxAttempts: {
      type: Number,
      default: 5,
    },
    // JWT step-up token sau khi verify thành công (encrypted at rest)
    stepUpToken: {
      type: String,
      select: false,
      default: null,
    },
    // Đánh dấu single-use — token đã được dùng chưa
    usedAt: {
      type: Date,
      default: null,
    },
    // Thời gian OTP hết hạn (TTL 10 phút)
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    // Thời gian step-up token hết hạn (TTL 5 phút sau khi verify)
    tokenExpiresAt: {
      type: Date,
      default: null,
    },
    // Thông tin request để audit
    ipAddress: {
      type: String,
      trim: true,
      default: "",
    },
    userAgent: {
      type: String,
      trim: true,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Compound index để tìm nhanh pending sessions theo user
stepUpTokenSchema.index({ userId: 1, status: 1, expiresAt: 1 });

// TTL index — MongoDB tự động xóa document khi expiresAt < now
stepUpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.StepUpToken ||
  mongoose.model("StepUpToken", stepUpTokenSchema);
