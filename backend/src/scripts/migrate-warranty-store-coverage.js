import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";

import Order from "../modules/order/Order.js";
import UniversalProduct from "../modules/product/UniversalProduct.js";
import "../modules/productType/ProductType.js";
import { activateWarrantyForOrder } from "../modules/warranty/warrantyService.js";
import {
  isSerializedConfig,
  isStoreWarrantyConfig,
  mergeAfterSalesConfig,
} from "../modules/device/afterSalesConfig.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const COMPLETED_STATUSES = ["DELIVERED", "PICKED_UP", "COMPLETED"];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRoot = path.resolve(
  __dirname,
  "../../backups/warranty-migration",
  new Date().toISOString().replace(/[:.]/g, "-")
);

const normalizePatch = (product = {}, resolved = {}) => {
  const current = product.afterSalesConfig || {};
  const next = {
    warrantyProvider: resolved.warrantyProvider,
    trackingMode: resolved.trackingMode,
    identifierPolicy: resolved.identifierPolicy,
    warrantyMonths: resolved.warrantyMonths,
    warrantyTerms: current.warrantyTerms || resolved.warrantyTerms || "",
  };

  const changedFields = Object.entries(next).filter(([key, value]) => current[key] !== value);
  if (!changedFields.length) {
    return null;
  }

  return {
    productId: String(product._id),
    productName: product.name,
    condition: product.condition,
    before: current,
    after: next,
  };
};

const hasOrderItemIdentifiers = (item = {}) =>
  Boolean(
    item?.imei ||
      item?.serialNumber ||
      (Array.isArray(item?.deviceAssignments) && item.deviceAssignments.length > 0)
  );

const buildOrderIssue = (order, item, product, config) => ({
  orderId: String(order._id),
  orderNumber: order.orderNumber,
  orderSource: order.orderSource,
  status: order.status,
  customerPhone: order.shippingAddress?.phoneNumber || "",
  productId: String(product?._id || item?.productId || ""),
  productName: product?.name || item?.productName || item?.name || "",
  condition: product?.condition || "",
  variantSku: item?.variantSku || "",
  quantity: Number(item?.quantity) || 0,
  config,
});

const main = async () => {
  if (!process.env.MONGODB_CONNECTIONSTRING) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING");
  }

  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);

  const products = await UniversalProduct.find({}, null, { skipBranchIsolation: true })
    .select("name condition productType afterSalesConfig")
    .populate("productType", "name afterSalesDefaults")
    .lean();

  const productConfigMap = new Map();
  const productPatches = [];

  for (const product of products) {
    const resolved = mergeAfterSalesConfig({
      product,
      productType: product.productType || {},
    });
    productConfigMap.set(String(product._id), {
      product,
      resolved,
    });

    const patch = normalizePatch(product, resolved);
    if (patch) {
      productPatches.push(patch);
    }
  }

  if (APPLY && productPatches.length) {
    for (const patch of productPatches) {
      await UniversalProduct.updateOne(
        { _id: patch.productId },
        {
          $set: {
            afterSalesConfig: patch.after,
          },
        },
        { skipBranchIsolation: true }
      );
    }
  }

  const completedOrders = await Order.find({
    status: { $in: COMPLETED_STATUSES },
    "assignedStore.storeId": { $exists: true },
  }, null, { skipBranchIsolation: true }).lean();

  const invalidOrders = [];
  const candidateOrders = [];
  const appliedOrders = [];
  const skippedOrders = [];

  for (const order of completedOrders) {
    let hasStoreWarrantyItem = false;
    let hasBlockingIssue = false;

    for (const item of order.items || []) {
      const productContext = productConfigMap.get(String(item.productId));
      if (!productContext) {
        continue;
      }

      const { product, resolved } = productContext;
      if (!isStoreWarrantyConfig(resolved)) {
        continue;
      }

      hasStoreWarrantyItem = true;
      if (isSerializedConfig(resolved) && !hasOrderItemIdentifiers(item)) {
        invalidOrders.push({
          ...buildOrderIssue(order, item, product, resolved),
          reason: "Missing IMEI/Serial for store-managed serialized item",
        });
        hasBlockingIssue = true;
      }
    }

    if (!hasStoreWarrantyItem) {
      continue;
    }

    if (hasBlockingIssue) {
      skippedOrders.push({
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        reason: "Missing identifiers",
      });
      continue;
    }

    candidateOrders.push({
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      orderSource: order.orderSource,
      customerPhone: order.shippingAddress?.phoneNumber || "",
    });

    if (!APPLY) {
      continue;
    }

    const created = await activateWarrantyForOrder({
      order,
      soldAt: order.deliveredAt || order.updatedAt || order.createdAt,
      actor: {
        _id: order.createdByInfo?.userId || order.customerId || order.userId || null,
        fullName: order.createdByInfo?.userName || "Warranty migration",
      },
    });

    appliedOrders.push({
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      createdWarrantyRecords: created.length,
    });
  }

  await fs.mkdir(reportRoot, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    applyMode: APPLY,
    summary: {
      totalProducts: products.length,
      productsToPatch: productPatches.length,
      completedOrdersScanned: completedOrders.length,
      candidateOrders: candidateOrders.length,
      invalidOrderItems: invalidOrders.length,
      appliedOrders: appliedOrders.length,
    },
    productPatches,
    candidateOrders,
    invalidOrders,
    skippedOrders,
    appliedOrders,
  };

  await fs.writeFile(
    path.join(reportRoot, "warranty-migration-report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report saved to ${path.join(reportRoot, "warranty-migration-report.json")}`);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
