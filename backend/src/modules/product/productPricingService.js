import Inventory from "../warehouse/Inventory.js";
import StoreInventory from "../inventory/StoreInventory.js";
import StockMovement from "../warehouse/StockMovement.js";
import UniversalProduct, { UniversalVariant } from "./UniversalProduct.js";
import {
  PRODUCT_STATUSES,
  canPurchaseForProductStatus,
  isManualProductStatus,
  normalizeProductStatus,
} from "./productPricingConfig.js";

export const PUBLIC_PRODUCT_STATUSES = Object.freeze([
  PRODUCT_STATUSES.IN_STOCK,
  PRODUCT_STATUSES.OUT_OF_STOCK,
  PRODUCT_STATUSES.COMING_SOON,
  PRODUCT_STATUSES.PRE_ORDER,
]);

const toMoney = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const pickPositiveMoney = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 0;
};

export const resolveVariantPricingSnapshot = (variant = {}) => {
  // Support legacy data where base/selling may still be zero while price/originalPrice are valid.
  const basePrice = pickPositiveMoney(
    variant?.basePrice,
    variant?.originalPrice,
    variant?.price,
    variant?.sellingPrice
  );
  const originalPrice = pickPositiveMoney(
    variant?.originalPrice,
    variant?.basePrice,
    variant?.price,
    variant?.sellingPrice,
    basePrice
  );
  const sellingPrice = pickPositiveMoney(
    variant?.sellingPrice,
    variant?.price,
    variant?.basePrice,
    variant?.originalPrice,
    basePrice
  );
  const effectiveBasePrice = basePrice || sellingPrice || originalPrice;
  const effectiveOriginalPrice = originalPrice || effectiveBasePrice;
  const effectiveSellingPrice = sellingPrice || effectiveBasePrice;
  const costPrice = toMoney(variant?.costPrice, 0);

  return {
    basePrice: effectiveBasePrice,
    originalPrice: effectiveOriginalPrice,
    sellingPrice: effectiveSellingPrice,
    costPrice,
    price: effectiveSellingPrice,
  };
};

export const applyPricingSnapshotToDocument = (target, snapshot = {}) => {
  if (!target) return target;

  target.basePrice = toMoney(snapshot.basePrice, 0);
  target.originalPrice = toMoney(snapshot.originalPrice, target.basePrice);
  target.sellingPrice = toMoney(snapshot.sellingPrice, target.basePrice);
  target.costPrice = toMoney(snapshot.costPrice, 0);
  target.price = toMoney(snapshot.price, target.sellingPrice);
  target.priceUpdatedAt = snapshot.priceUpdatedAt || new Date();

  return target;
};

export const syncVariantPricingFromInbound = (
  variant,
  { basePrice, sellingPrice, costPrice } = {}
) => {
  if (!variant) return null;

  const current = resolveVariantPricingSnapshot(variant);
  const nextBasePrice =
    basePrice !== undefined && basePrice !== null
      ? toMoney(basePrice, current.basePrice)
      : current.basePrice;
  const nextSellingPrice =
    sellingPrice !== undefined && sellingPrice !== null
      ? toMoney(sellingPrice, current.sellingPrice || nextBasePrice)
      : current.sellingPrice || nextBasePrice;
  const nextCostPrice =
    costPrice !== undefined && costPrice !== null
      ? toMoney(costPrice, current.costPrice)
      : current.costPrice;

  applyPricingSnapshotToDocument(variant, {
    basePrice: nextBasePrice,
    originalPrice: nextBasePrice,
    sellingPrice: nextSellingPrice,
    costPrice: nextCostPrice,
    price: nextSellingPrice || nextBasePrice,
    priceUpdatedAt: new Date(),
  });

  return resolveVariantPricingSnapshot(variant);
};

export const updateCurrentPricingForSku = async ({
  productId,
  variantSku,
  variantId = null,
  basePrice,
  sellingPrice,
  costPrice,
  session = null,
} = {}) => {
  if (!productId || !variantSku) {
    throw new Error("productId and variantSku are required to update pricing");
  }

  const variant = variantId
    ? await UniversalVariant.findById(variantId).session(session)
    : await UniversalVariant.findOne({ productId, sku: variantSku }).session(session);

  if (!variant) {
    throw new Error(`Variant ${variantSku} not found for pricing update`);
  }

  const snapshot = syncVariantPricingFromInbound(variant, {
    basePrice,
    sellingPrice,
    costPrice,
  });

  await variant.save({ session });

  const updatePayload = {
    basePrice: snapshot.basePrice,
    originalPrice: snapshot.originalPrice,
    sellingPrice: snapshot.sellingPrice,
    costPrice: snapshot.costPrice,
    price: snapshot.price,
    priceUpdatedAt: new Date(),
  };

  await Inventory.updateMany(
    { productId, sku: variantSku },
    { $set: updatePayload },
    { session }
  );

  await StoreInventory.updateMany(
    { productId, variantSku },
    { $set: updatePayload },
    { session }
  );

  return {
    variant,
    snapshot,
  };
};

export const getCurrentVariantPricing = async ({
  variantId = null,
  variantSku = "",
  session = null,
} = {}) => {
  let variant = null;

  if (variantId) {
    variant = await UniversalVariant.findById(variantId).session(session);
  } else if (variantSku) {
    variant = await UniversalVariant.findOne({ sku: String(variantSku).trim() }).session(session);
  }

  if (!variant) {
    return {
      variant: null,
      snapshot: {
        basePrice: 0,
        originalPrice: 0,
        sellingPrice: 0,
        costPrice: 0,
        price: 0,
      },
    };
  }

  return {
    variant,
    snapshot: resolveVariantPricingSnapshot(variant),
  };
};

export const recalculateProductAvailability = async ({
  productId,
  session = null,
} = {}) => {
  if (!productId) return null;

  const product = await UniversalProduct.findById(productId).session(session);
  if (!product) return null;

  product.status = normalizeProductStatus(
    product.status,
    PRODUCT_STATUSES.COMING_SOON
  );
  product.lifecycleStage = "ACTIVE";

  if (isManualProductStatus(product.status)) {
    await product.save({ session });
    return product;
  }

  const variants = await UniversalVariant.find({ productId })
    .select("stock")
    .session(session);
  const totalStock = variants.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.stock) || 0),
    0
  );

  let nextStatus = PRODUCT_STATUSES.COMING_SOON;
  if (totalStock > 0) {
    nextStatus = PRODUCT_STATUSES.IN_STOCK;
  } else {
    const inboundHistory = await StockMovement.exists({
      productId,
      type: "INBOUND",
      quantity: { $gt: 0 },
    }).session(session);

    nextStatus = inboundHistory
      ? PRODUCT_STATUSES.OUT_OF_STOCK
      : PRODUCT_STATUSES.COMING_SOON;
  }

  if (product.status !== nextStatus || product.lifecycleStage !== "ACTIVE") {
    product.status = nextStatus;
    product.lifecycleStage = "ACTIVE";
    await product.save({ session });
  }

  return product;
};

export const recalculateProductAvailabilityForSku = async ({
  variantSku,
  session = null,
} = {}) => {
  const variant = await UniversalVariant.findOne({ sku: String(variantSku || "").trim() })
    .select("productId")
    .session(session);
  if (!variant?.productId) return null;
  return recalculateProductAvailability({ productId: variant.productId, session });
};

export const decorateProductForCommerce = (product = {}) => {
  const rawProduct = product?.toObject ? product.toObject() : { ...product };
  const normalizedStatus = normalizeProductStatus(
    rawProduct.status,
    PRODUCT_STATUSES.COMING_SOON
  );
  const variants = Array.isArray(rawProduct.variants) ? rawProduct.variants : [];

  return {
    ...rawProduct,
    status: normalizedStatus,
    lifecycleStage: rawProduct.lifecycleStage || "ACTIVE",
    canPurchase: canPurchaseForProductStatus(normalizedStatus),
    availabilityState: normalizedStatus,
    variants: variants.map((variant) => ({
      ...variant,
      ...resolveVariantPricingSnapshot(variant),
    })),
  };
};
