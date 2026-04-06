import mongoose from "mongoose";
import { branchIsolationPlugin } from "../../authz/branchIsolationPlugin.js";

const storeInventorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UniversalProduct",
      required: true,
    },

    variantSku: {
      type: String,
      required: true,
      trim: true,
    },

    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    reserved: {
      type: Number,
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

    available: {
      type: Number,
      default: 0,
      min: 0,
    },

    minStock: {
      type: Number,
      default: 5,
      min: 0,
    },

    maxStock: {
      type: Number,
      default: 1000,
      min: 0,
    },

    location: {
      aisle: String,
      shelf: String,
      bin: String,
    },

    status: {
      type: String,
      enum: ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "DISCONTINUED"],
      default: "IN_STOCK",
    },

    lastRestockDate: Date,
    lastRestockQuantity: Number,
  },
  { timestamps: true }
);

storeInventorySchema.index(
  { productId: 1, variantSku: 1, storeId: 1 },
  { unique: true }
);
storeInventorySchema.index({ storeId: 1 });
storeInventorySchema.index({ status: 1 });
storeInventorySchema.index({ available: 1 });

storeInventorySchema.pre("save", function updateSnapshot(next) {
  const available = Number(this.quantity) - Number(this.reserved);
  this.available = available > 0 ? available : 0;

  if (this.available <= 0) {
    this.status = "OUT_OF_STOCK";
  } else if (this.available <= this.minStock) {
    this.status = "LOW_STOCK";
  } else {
    this.status = "IN_STOCK";
  }

  next();
});

// ── KILL-SWITCH: Auto-inject branch scoping into every query ──
storeInventorySchema.plugin(branchIsolationPlugin, { branchField: "storeId" });

export default
  mongoose.models.StoreInventory ||
  mongoose.model("StoreInventory", storeInventorySchema);
