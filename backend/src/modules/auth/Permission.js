import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    scopeType: {
      type: String,
      enum: ["GLOBAL", "BRANCH", "SELF", "TASK", "RESOURCE"],
      required: true,
      index: true,
    },
    defaultScope: {
      type: String,
      enum: ["GLOBAL", "BRANCH", "SELF", "TASK", "RESOURCE"],
      default: "BRANCH",
      index: true,
    },
    resourceType: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isSensitive: {
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

permissionSchema.index({ module: 1, action: 1 }, { unique: true });

permissionSchema.pre("validate", function syncDerivedFields(next) {
  if (!this.defaultScope) {
    this.defaultScope = this.scopeType || "BRANCH";
  }
  if (!this.resourceType) {
    this.resourceType = this.module || "";
  }
  next();
});

export default mongoose.models.Permission || mongoose.model("Permission", permissionSchema);
