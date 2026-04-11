import mongoose from "mongoose";

/**
 * PermissionGroup — Nhóm các permissions liên quan thành bundle để quản lý dễ hơn.
 * Dùng trong UI admin panel để cấp nhóm quyền thay vì từng quyền đơn lẻ.
 */
const permissionGroupSchema = new mongoose.Schema(
  {
    // Key duy nhất, uppercase (e.g. "ORDER_READONLY", "INVENTORY_VIEW")
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    // Tên hiển thị (tiếng Việt)
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Mô tả chi tiết
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // Danh sách permission keys trong group này
    permissions: {
      type: [String],
      default: [],
    },
    // Group định nghĩa bởi hệ thống — không cho phép xóa
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
    // Thứ tự hiển thị trong UI
    sortOrder: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

permissionGroupSchema.pre("validate", function normalizeKey(next) {
  if (this.key) {
    this.key = String(this.key).trim().toUpperCase();
  }
  if (Array.isArray(this.permissions)) {
    this.permissions = this.permissions
      .map((p) => String(p || "").trim().toLowerCase())
      .filter(Boolean);
  }
  next();
});

export default mongoose.models.PermissionGroup ||
  mongoose.model("PermissionGroup", permissionGroupSchema);
