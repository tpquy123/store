/**
 * EmailOTPToken.js
 * ───────────────────────────────────────────────────────────────────
 * Mongoose model for customer email OTP verification tokens.
 * Separate from StepUpToken (employee step-up auth).
 *
 * Purpose: verify customer email address at registration / profile update.
 * ───────────────────────────────────────────────────────────────────
 */
import mongoose from "mongoose";

const emailOTPTokenSchema = new mongoose.Schema(
  {
    /** Reference to the User document */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** Email address being verified */
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    /** Bcrypt hash of the 6-digit OTP (never store plaintext) */
    otpHash: {
      type: String,
      required: true,
      select: false, // never returned in regular queries
    },

    /** Session identifier returned to client to pair with verify call */
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },

    /** Number of failed verify attempts */
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** Max allowed attempts before session is locked */
    maxAttempts: {
      type: Number,
      default: 5,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // MongoDB TTL auto-delete
    },

    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

emailOTPTokenSchema.index({ userId: 1, status: 1, expiresAt: 1 });

export default mongoose.models.EmailOTPToken ||
  mongoose.model("EmailOTPToken", emailOTPTokenSchema);
