import mongoose from "mongoose";

const userRoleAssignmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },
    roleKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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

userRoleAssignmentSchema.index(
  { userId: 1, roleId: 1, scopeType: 1, scopeRef: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  }
);

export default mongoose.models.UserRoleAssignment ||
  mongoose.model("UserRoleAssignment", userRoleAssignmentSchema);
