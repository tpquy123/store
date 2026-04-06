import mongoose from "mongoose";

const permissionTemplateSchema = new mongoose.Schema(
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
    scope: {
      type: String,
      enum: ["SYSTEM", "BRANCH", "TASK"],
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

permissionTemplateSchema.index({ isSystem: 1, isActive: 1 });
permissionTemplateSchema.index({ scope: 1, isActive: 1 });

export default mongoose.models.PermissionTemplate ||
  mongoose.model("PermissionTemplate", permissionTemplateSchema);
