import mongoose from "mongoose";
import { branchIsolationPlugin } from "../../authz/branchIsolationPlugin.js";

const inventorySchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },

    sku: {
      type: String,
      required: true,
      trim: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UniversalProduct",
      required: true,
    },

    productName: {
      type: String,
      required: true,
    },

    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WarehouseLocation",
      required: true,
    },

    locationCode: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    basePrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    originalPrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    sellingPrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    costPrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    price: {
      type: Number,
      min: 0,
      default: 0,
    },

    priceUpdatedAt: {
      type: Date,
    },

    lastReceived: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["GOOD", "DAMAGED", "EXPIRED", "RESERVED"],
      default: "GOOD",
    },

    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

inventorySchema.index({ storeId: 1, sku: 1 });
inventorySchema.index({ storeId: 1, locationId: 1 });
inventorySchema.index({ storeId: 1, sku: 1, locationId: 1 }, { unique: true });
inventorySchema.index({ storeId: 1, productId: 1 });
inventorySchema.index({ storeId: 1, status: 1 });

inventorySchema.plugin(branchIsolationPlugin, { branchField: "storeId" });

export default mongoose.models.Inventory || mongoose.model("Inventory", inventorySchema);
