import mongoose from "mongoose";
import {
  IDENTIFIER_POLICIES,
  TRACKING_MODES,
} from "../device/afterSalesConfig.js";
import {
  PRODUCT_STATUSES,
  PRODUCT_STATUS_VALUES,
  normalizeProductStatus,
} from "./productPricingConfig.js";

const universalVariantSchema = new mongoose.Schema(
  {
    color: { type: String, required: true, trim: true },
    variantName: { type: String, required: true, trim: true },
    basePrice: { type: Number, min: 0, default: 0 },
    originalPrice: { type: Number, min: 0, default: 0 },
    price: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, default: 0 },
    costPrice: { type: Number, min: 0, default: 0 },
    priceUpdatedAt: { type: Date },
    stock: { type: Number, required: true, min: 0, default: 0 },
    images: [{ type: String, trim: true }],
    sku: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, sparse: true, trim: true },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UniversalProduct",
      required: true,
      index: true,
    },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    salesCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

const toPositiveMoney = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
};

const toNonNegativeMoney = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const normalizeVariantPricingDocument = function normalizeVariantPricing(next) {
  // Keep legacy compatibility: treat zeroed base/selling fields as missing and
  // recover from historical fields (originalPrice / price) when available.
  const fallbackBasePrice =
    toPositiveMoney(this.originalPrice) ||
    toPositiveMoney(this.price) ||
    toPositiveMoney(this.sellingPrice);
  const normalizedBasePrice = toPositiveMoney(this.basePrice) || fallbackBasePrice;

  const fallbackSellingPrice =
    toPositiveMoney(this.price) ||
    toPositiveMoney(this.originalPrice) ||
    normalizedBasePrice;
  const normalizedSellingPrice = toPositiveMoney(this.sellingPrice) || fallbackSellingPrice;

  const effectiveBasePrice = normalizedBasePrice || normalizedSellingPrice || 0;
  const effectiveSellingPrice = normalizedSellingPrice || effectiveBasePrice;

  this.basePrice = effectiveBasePrice;
  this.originalPrice = effectiveBasePrice;
  this.sellingPrice = effectiveSellingPrice;
  this.price = effectiveSellingPrice;
  this.costPrice = toNonNegativeMoney(this.costPrice, 0);
  if (!this.priceUpdatedAt) {
    this.priceUpdatedAt = new Date();
  }

  next();
};

universalVariantSchema.pre("validate", normalizeVariantPricingDocument);
universalVariantSchema.pre("save", normalizeVariantPricingDocument);

universalVariantSchema.methods.incrementSales = async function incrementSales(
  quantity = 1
) {
  this.salesCount += quantity;
  await this.save();
  return this.salesCount;
};

export const UniversalVariant = mongoose.model(
  "UniversalVariant",
  universalVariantSchema
);

const universalProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    baseSlug: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      trim: true,
    },
    slug: { type: String, sparse: true, trim: true },
    description: { type: String, trim: true, default: "" },
    featuredImages: [{ type: String, trim: true }],
    videoUrl: { type: String, trim: true, default: "" },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    productType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductType",
      required: true,
    },
    specifications: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    afterSalesConfig: {
      trackingMode: {
        type: String,
        enum: Object.values(TRACKING_MODES),
      },
      identifierPolicy: {
        type: String,
        enum: Object.values(IDENTIFIER_POLICIES),
      },
      warrantyMonths: {
        type: Number,
        min: 0,
      },
      warrantyTerms: {
        type: String,
        trim: true,
        default: "",
      },
    },
    variants: [{ type: mongoose.Schema.Types.ObjectId, ref: "UniversalVariant" }],
    condition: {
      type: String,
      enum: ["NEW", "LIKE_NEW", "USED"],
      default: "NEW",
      required: true,
    },
    lifecycleStage: {
      type: String,
      enum: ["SKELETON", "ACTIVE"],
      default: "ACTIVE",
    },
    status: {
      type: String,
      enum: PRODUCT_STATUS_VALUES,
      default: PRODUCT_STATUSES.COMING_SOON,
      set: (value) =>
        normalizeProductStatus(value, PRODUCT_STATUSES.COMING_SOON),
    },
    installmentBadge: {
      type: String,
      enum: ["NONE", "Trả góp 0%", "Trả góp 0%, trả trước 0đ"],
      default: "NONE",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
    salesCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

universalProductSchema.pre("save", function normalizeProduct(next) {
  if (this.baseSlug && !this.slug) {
    this.slug = this.baseSlug;
  }
  this.lifecycleStage = this.lifecycleStage || "ACTIVE";
  this.status = normalizeProductStatus(
    this.status,
    PRODUCT_STATUSES.COMING_SOON
  );
  next();
});

universalProductSchema.methods.incrementSales = async function incrementSales(
  quantity = 1
) {
  this.salesCount += quantity;
  await this.save();
  return this.salesCount;
};

universalProductSchema.index({ name: "text", model: "text", description: "text" });
universalProductSchema.index({ status: 1 });
universalProductSchema.index({ lifecycleStage: 1 });
universalProductSchema.index({ createdAt: -1 });
universalProductSchema.index({ salesCount: -1 });

export default mongoose.model("UniversalProduct", universalProductSchema);
