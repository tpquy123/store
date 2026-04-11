import mongoose from "mongoose";
import { branchIsolationPlugin } from "../../authz/branchIsolationPlugin.js";
import {
  WARRANTY_PROVIDERS,
  WARRANTY_STATUSES,
} from "../device/afterSalesConfig.js";

const warrantyRecordSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    orderItemId: mongoose.Schema.Types.ObjectId,
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
    },
    customerPhone: {
      type: String,
      trim: true,
      required: true,
    },
    customerPhoneNormalized: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UniversalProduct",
      required: true,
    },
    productName: {
      type: String,
      trim: true,
      required: true,
    },
    variantSku: {
      type: String,
      trim: true,
      required: true,
    },
    imei: {
      type: String,
      trim: true,
      default: "",
    },
    imeiNormalized: {
      type: String,
      trim: true,
    },
    serialNumber: {
      type: String,
      trim: true,
      default: "",
    },
    serialNumberNormalized: {
      type: String,
      trim: true,
    },
    lookupKeys: [{ type: String, trim: true }],
    soldAt: {
      type: Date,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    warrantyMonths: {
      type: Number,
      min: 0,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    warrantyType: {
      type: String,
      enum: Object.values(WARRANTY_PROVIDERS),
      default: WARRANTY_PROVIDERS.STORE,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(WARRANTY_STATUSES),
      default: WARRANTY_STATUSES.ACTIVE,
      required: true,
    },
    quantity: {
      type: Number,
      min: 1,
      default: 1,
    },
    warrantyTerms: {
      type: String,
      trim: true,
      default: "",
    },
    replacedFromId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WarrantyRecord",
    },
    replacedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WarrantyRecord",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

warrantyRecordSchema.index({ storeId: 1, customerId: 1, createdAt: -1 });
warrantyRecordSchema.index({ customerPhoneNormalized: 1, createdAt: -1 });
warrantyRecordSchema.index({ orderId: 1, orderItemId: 1 });
warrantyRecordSchema.index({ warrantyType: 1, status: 1, expiresAt: 1 });
warrantyRecordSchema.index({ lookupKeys: 1 });
warrantyRecordSchema.index({ imeiNormalized: 1 }, { unique: true, sparse: true });
warrantyRecordSchema.index({ serialNumberNormalized: 1 }, { unique: true, sparse: true });
warrantyRecordSchema.plugin(branchIsolationPlugin, { branchField: "storeId" });

export default
  mongoose.models.WarrantyRecord ||
  mongoose.model("WarrantyRecord", warrantyRecordSchema);
