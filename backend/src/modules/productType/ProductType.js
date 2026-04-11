// ============================================
// FILE: backend/src/modules/productType/ProductType.js
// ✅ Schema cho quản lý loại sản phẩm với specs động
// ============================================

import mongoose from "mongoose";
import {
  IDENTIFIER_POLICIES,
  TRACKING_MODES,
  WARRANTY_PROVIDERS,
} from "../device/afterSalesConfig.js";

const specFieldSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true,
  },
  label: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ["text", "number", "select", "textarea"],
    default: "text",
  },
  required: {
    type: Boolean,
    default: false,
  },
  options: [{ type: String, trim: true }], // For select type
  placeholder: {
    type: String,
    trim: true,
    default: "",
  },
});

const productTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên loại sản phẩm là bắt buộc"],
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    icon: {
      type: String,
      trim: true,
      default: "",
    },
    afterSalesDefaults: {
      warrantyProvider: {
        type: String,
        enum: Object.values(WARRANTY_PROVIDERS),
      },
      trackingMode: {
        type: String,
        enum: Object.values(TRACKING_MODES),
        default: TRACKING_MODES.NONE,
      },
      identifierPolicy: {
        type: String,
        enum: Object.values(IDENTIFIER_POLICIES),
        default: IDENTIFIER_POLICIES.SERIAL,
      },
      warrantyMonths: {
        type: Number,
        min: 0,
        default: 0,
      },
      warrantyTerms: {
        type: String,
        trim: true,
        default: "",
      },
    },
    specFields: [specFieldSchema],
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Auto-generate slug
productTypeSchema.pre("save", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, "")
      .replace(/\-\-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  next();
});

productTypeSchema.index({ name: "text", slug: 1 });

export default mongoose.model("ProductType", productTypeSchema);
