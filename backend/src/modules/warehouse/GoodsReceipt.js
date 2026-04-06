import mongoose from "mongoose";
import { branchIsolationPlugin } from "../../authz/branchIsolationPlugin.js";

const goodsReceiptSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },

    grnNumber: {
      type: String,
      required: true,
      trim: true,
    },

    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      required: true,
    },

    poNumber: {
      type: String,
      required: true,
      trim: true,
    },

    supplier: {
      name: {
        type: String,
        required: true,
      },
      contact: {
        type: String,
      },
    },

    items: [
      {
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
        orderedQuantity: {
          type: Number,
          required: true,
        },
        receivedQuantity: {
          type: Number,
          required: true,
        },
        damagedQuantity: {
          type: Number,
          default: 0,
        },
        locationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "WarehouseLocation",
          required: true,
        },
        locationCode: {
          type: String,
          required: true,
        },
        qualityStatus: {
          type: String,
          enum: ["GOOD", "DAMAGED", "EXPIRED"],
          default: "GOOD",
        },
        unitPrice: {
          type: Number,
          required: true,
        },
        costPrice: {
          type: Number,
          min: 0,
          default: 0,
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
        totalPrice: {
          type: Number,
          required: true,
        },
      },
    ],

    totalQuantity: {
      type: Number,
      required: true,
    },

    totalDamaged: {
      type: Number,
      default: 0,
    },

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receivedByName: {
      type: String,
      required: true,
    },

    receivedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    deliverySignature: {
      type: String,
    },

    status: {
      type: String,
      enum: ["COMPLETED", "CANCELLED"],
      default: "COMPLETED",
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

goodsReceiptSchema.index({ storeId: 1, grnNumber: 1 }, { unique: true });
goodsReceiptSchema.index({ storeId: 1, purchaseOrderId: 1 });
goodsReceiptSchema.index({ storeId: 1, receivedBy: 1 });
goodsReceiptSchema.index({ storeId: 1, receivedDate: -1 });
goodsReceiptSchema.index({ storeId: 1, createdAt: -1 });

goodsReceiptSchema.plugin(branchIsolationPlugin, { branchField: "storeId" });

export default
  mongoose.models.GoodsReceipt ||
  mongoose.model("GoodsReceipt", goodsReceiptSchema);
