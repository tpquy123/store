import mongoose from "mongoose";

const stockMovementSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: false,
    },

    type: {
      type: String,
      enum: ["INBOUND", "OUTBOUND", "TRANSFER", "ADJUSTMENT"],
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

    fromLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WarehouseLocation",
    },

    fromLocationCode: {
      type: String,
      trim: true,
    },

    toLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WarehouseLocation",
    },

    toLocationCode: {
      type: String,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
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

    referenceType: {
      type: String,
      enum: ["PO", "ORDER", "TRANSFER", "CYCLE_COUNT", "MANUAL"],
    },

    referenceId: {
      type: String,
      trim: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    performedByName: {
      type: String,
      required: true,
    },

    qualityStatus: {
      type: String,
      enum: ["GOOD", "DAMAGED", "EXPIRED"],
      default: "GOOD",
    },

    notes: {
      type: String,
      trim: true,
    },

    signature: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

stockMovementSchema.index({ storeId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1 });
stockMovementSchema.index({ sku: 1 });
stockMovementSchema.index({ referenceId: 1 });
stockMovementSchema.index({ performedBy: 1 });
stockMovementSchema.index({ createdAt: -1 });

export default
  mongoose.models.StockMovement ||
  mongoose.model("StockMovement", stockMovementSchema);
