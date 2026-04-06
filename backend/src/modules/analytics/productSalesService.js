import mongoose from "mongoose";
import UniversalProduct, {
  UniversalVariant,
} from "../product/UniversalProduct.js";
import ProductType from "../productType/ProductType.js";
import { PUBLIC_PRODUCT_STATUSES } from "../product/productPricingService.js";

const LEGACY_CATEGORY_TO_SLUG = {
  iphone: "smartphone",
  ipad: "tablet",
  mac: "laptop",
  airpods: "headphone",
  applewatch: "smartwatch",
  accessory: "accessories",
  accessories: "accessories",
};

const normalizeVietnamese = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

const normalizeCategoryKey = (text) =>
  normalizeVietnamese(text).replace(/[\s_-]+/g, "");

const resolveProductTypeFilter = async (category) => {
  if (!category) return null;

  if (mongoose.Types.ObjectId.isValid(category)) {
    return [category];
  }

  const normalizedKey = normalizeCategoryKey(category);
  const mappedSlug =
    LEGACY_CATEGORY_TO_SLUG[normalizedKey] ||
    normalizeVietnamese(category).replace(/\s+/g, "-");

  const docs = await ProductType.find({
    $or: [
      { slug: mappedSlug },
      { slug: normalizeVietnamese(category).replace(/\s+/g, "-") },
    ],
  })
    .select("_id")
    .lean();

  return docs.map((doc) => doc._id);
};

async function findProductByVariantId(variantId) {
  const variant = await UniversalVariant.findById(variantId).select("productId");
  if (!variant) return null;

  const product = await UniversalProduct.findById(variant.productId);
  if (!product) return null;

  return { product, variant };
}

export async function updateProductSalesCount(
  productId,
  variantId,
  quantity,
  category = null
) {
  try {
    let product = null;

    if (variantId) {
      const found = await findProductByVariantId(variantId);
      product = found?.product || null;
    } else if (productId) {
      product = await UniversalProduct.findById(productId);
    }

    if (!product) {
      console.warn(`Product not found: ${productId || variantId}`);
      return null;
    }

    product.salesCount = (product.salesCount || 0) + Number(quantity || 0);
    await product.save();

    console.log(
      `Updated salesCount for ${category || "universal"} - ${product.name}: +${quantity}`
    );

    return product;
  } catch (error) {
    console.error("Error updating salesCount:", error);
    throw error;
  }
}

export async function processOrderSales(order) {
  if (!order?.items?.length) {
    console.warn("No items in order");
    return [];
  }

  const results = [];

  for (const item of order.items) {
    try {
      const productId = item.productId;
      const variantId = item.variantId || null;
      const quantity = Number(item.quantity || 0);
      const category = item.productType || null;

      const updatedProduct = await updateProductSalesCount(
        productId,
        variantId,
        quantity,
        category
      );

      if (updatedProduct) {
        results.push({
          productId: updatedProduct._id,
          category,
          name: updatedProduct.name,
          quantity,
          totalSales: updatedProduct.salesCount,
        });
      }
    } catch (error) {
      console.error("Failed to update order item salesCount:", error.message);
    }
  }

  return results;
}

export async function getTopSellingProducts(category, limit = 10) {
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
  const query = { status: { $in: PUBLIC_PRODUCT_STATUSES } };

  if (category) {
    const productTypeIds = await resolveProductTypeFilter(category);
    if (!productTypeIds?.length) {
      return [];
    }
    query.productType = { $in: productTypeIds };
  }

  return UniversalProduct.find(query)
    .sort({ salesCount: -1 })
    .limit(parsedLimit)
    .select("name model salesCount averageRating variants productType")
    .populate("variants", "price sellingPrice basePrice originalPrice costPrice images")
    .populate("productType", "name slug")
    .lean();
}

export async function getAllTopSellingProducts(limit = 10) {
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);

  return UniversalProduct.find({ status: { $in: PUBLIC_PRODUCT_STATUSES } })
    .sort({ salesCount: -1 })
    .limit(parsedLimit)
    .select("name model salesCount averageRating variants productType")
    .populate("variants", "price sellingPrice basePrice originalPrice costPrice images")
    .populate("productType", "name slug")
    .lean();
}

export async function resetSalesCount(category = null) {
  if (category) {
    const productTypeIds = await resolveProductTypeFilter(category);
    if (!productTypeIds?.length) return;
    await UniversalProduct.updateMany(
      { productType: { $in: productTypeIds } },
      { $set: { salesCount: 0 } }
    );
    return;
  }

  await UniversalProduct.updateMany({}, { $set: { salesCount: 0 } });
}

export async function syncSalesCountFromAnalytics() {
  const SalesAnalytics = (await import("./SalesAnalytics.js")).default;
  const analytics = await SalesAnalytics.find().lean();

  for (const row of analytics) {
    try {
      await updateProductSalesCount(
        row.productId,
        row.variantId,
        row.sales?.total || 0,
        row.category || null
      );
    } catch (error) {
      console.error(`Failed to sync ${row.productId}:`, error.message);
    }
  }
}

export default {
  updateProductSalesCount,
  processOrderSales,
  getTopSellingProducts,
  getAllTopSellingProducts,
  resetSalesCount,
  syncSalesCountFromAnalytics,
};
