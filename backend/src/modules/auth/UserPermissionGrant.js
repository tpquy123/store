import mongoose from "mongoose";

const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();

const userPermissionGrantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    permissionKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    scopeType: {
      type: String,
      enum: ["GLOBAL", "BRANCH", "TASK", "RESOURCE", "SELF"],
      required: true,
      index: true,
    },
    scopeRef: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    effect: {
      type: String,
      enum: ["ALLOW"],
      default: "ALLOW",
    },
    conditions: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

userPermissionGrantSchema.index(
  { userId: 1, permissionKey: 1, scopeType: 1, scopeRef: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  }
);

userPermissionGrantSchema.pre("validate", function normalizeBeforeValidate(next) {
  this.permissionKey = normalizePermissionKey(this.permissionKey);
  if (String(this.scopeType || "").trim().toUpperCase() === "GLOBAL") {
    this.scopeRef = "";
  }
  next();
});

export default mongoose.models.UserPermissionGrant ||
  mongoose.model("UserPermissionGrant", userPermissionGrantSchema);
