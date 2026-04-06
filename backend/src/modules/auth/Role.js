import mongoose from "mongoose";

const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();

const roleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    permissions: [
      {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
    ],
    scopeType: {
      type: String,
      enum: ["GLOBAL", "BRANCH", "TASK", "RESOURCE", "SELF"],
      default: "BRANCH",
      required: true,
      index: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

roleSchema.index({ scopeType: 1, isActive: 1 });

roleSchema.pre("validate", function normalizePermissions(next) {
  const permissions = Array.isArray(this.permissions) ? this.permissions : [];
  this.permissions = Array.from(
    new Set(permissions.map(normalizePermissionKey).filter(Boolean))
  );
  next();
});

export default mongoose.models.Role || mongoose.model("Role", roleSchema);
