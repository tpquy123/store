import "dotenv/config";
import mongoose from "mongoose";
import UniversalProduct, {
  UniversalVariant,
} from "../modules/product/UniversalProduct.js";
import Inventory from "../modules/warehouse/Inventory.js";
import StoreInventory from "../modules/inventory/StoreInventory.js";
import Device from "../modules/device/Device.js";
import StockMovement from "../modules/warehouse/StockMovement.js";
import GoodsReceipt from "../modules/warehouse/GoodsReceipt.js";
import Order from "../modules/order/Order.js";
import {
  PRODUCT_STATUSES,
  isManualProductStatus,
  normalizeProductStatus,
} from "../modules/product/productPricingConfig.js";

const LOG_PREFIX = "[MIGRATE][PRICING_AVAILABILITY]";

const toMoney = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const connectDB = async () => {
  const uri = process.env.MONGODB_CONNECTIONSTRING || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING or MONGO_URI");
  }

  await mongoose.connect(uri);
  console.log(`${LOG_PREFIX} MongoDB connected`);
};

const resolveVariantSnapshot = (variant = {}) => {
  const basePrice = toMoney(
    variant.basePrice,
    toMoney(variant.originalPrice, toMoney(variant.price, 0)),
  );
  const sellingPrice = toMoney(
    variant.sellingPrice,
    toMoney(variant.price, basePrice),
  );
  const costPrice = toMoney(variant.costPrice, 0);

  return {
    basePrice,
    originalPrice: basePrice,
    sellingPrice: sellingPrice > 0 ? sellingPrice : basePrice,
    costPrice,
    price: sellingPrice > 0 ? sellingPrice : basePrice,
  };
};

const syncCollectionSnapshotBySku = async (snapshotBySku, dryRun) => {
  let inventoryWrites = 0;
  let storeInventoryWrites = 0;
  let deviceWrites = 0;

  for (const [sku, snapshot] of snapshotBySku.entries()) {
    const filterInventory = { productId: snapshot.productId, sku };
    const filterStoreInventory = { productId: snapshot.productId, variantSku: sku };
    const filterDevice = { productId: snapshot.productId, variantSku: sku };
    const update = {
      basePrice: snapshot.basePrice,
      originalPrice: snapshot.originalPrice,
      sellingPrice: snapshot.sellingPrice,
      costPrice: snapshot.costPrice,
      price: snapshot.price,
      priceUpdatedAt: new Date(),
    };

    if (dryRun) {
      inventoryWrites += await Inventory.countDocuments(filterInventory);
      storeInventoryWrites += await StoreInventory.countDocuments(filterStoreInventory);
      deviceWrites += await Device.countDocuments(filterDevice);
      continue;
    }

    const [inventoryResult, storeInventoryResult, deviceResult] = await Promise.all([
      Inventory.updateMany(filterInventory, { $set: update }).setOptions({
        skipBranchIsolation: true,
      }),
      StoreInventory.updateMany(filterStoreInventory, { $set: update }).setOptions({
        skipBranchIsolation: true,
      }),
      Device.updateMany(filterDevice, { $set: update }).setOptions({
        skipBranchIsolation: true,
      }),
    ]);

    inventoryWrites += inventoryResult.modifiedCount || 0;
    storeInventoryWrites += storeInventoryResult.modifiedCount || 0;
    deviceWrites += deviceResult.modifiedCount || 0;
  }

  return { inventoryWrites, storeInventoryWrites, deviceWrites };
};

const migrateVariants = async (dryRun) => {
  const variants = await UniversalVariant.find({})
    .select("_id productId sku basePrice originalPrice price sellingPrice costPrice")
    .lean();

  const snapshotBySku = new Map();
  const ops = variants.map((variant) => {
    const snapshot = resolveVariantSnapshot(variant);
    snapshot.productId = variant.productId;
    snapshotBySku.set(String(variant.sku || "").trim(), snapshot);

    return {
      updateOne: {
        filter: { _id: variant._id },
        update: {
          $set: {
            basePrice: snapshot.basePrice,
            originalPrice: snapshot.originalPrice,
            sellingPrice: snapshot.sellingPrice,
            costPrice: snapshot.costPrice,
            price: snapshot.price,
            priceUpdatedAt: new Date(),
          },
        },
      },
    };
  });

  let modifiedVariants = 0;
  if (!dryRun && ops.length) {
    const result = await UniversalVariant.bulkWrite(ops, { ordered: false });
    modifiedVariants = result.modifiedCount || 0;
  } else {
    modifiedVariants = ops.length;
  }

  const downstream = await syncCollectionSnapshotBySku(snapshotBySku, dryRun);
  return {
    variantsScanned: variants.length,
    variantsModified: modifiedVariants,
    snapshotBySku,
    ...downstream,
  };
};

const migrateStockMovements = async (dryRun) => {
  const movements = await StockMovement.find({})
    .select("_id basePrice originalPrice sellingPrice costPrice price priceUpdatedAt createdAt")
    .lean();

  const ops = movements.map((movement) => {
    const basePrice = toMoney(
      movement.basePrice,
      toMoney(movement.originalPrice, toMoney(movement.price, 0)),
    );
    const sellingPrice = toMoney(
      movement.sellingPrice,
      toMoney(movement.price, basePrice),
    );

    return {
      updateOne: {
        filter: { _id: movement._id },
        update: {
          $set: {
            basePrice,
            originalPrice: basePrice,
            sellingPrice,
            costPrice: toMoney(movement.costPrice, 0),
            price: sellingPrice,
            priceUpdatedAt: movement.priceUpdatedAt || movement.createdAt || new Date(),
          },
        },
      },
    };
  });

  if (dryRun || ops.length === 0) {
    return { stockMovementsModified: ops.length };
  }

  const result = await StockMovement.bulkWrite(ops, { ordered: false });
  return { stockMovementsModified: result.modifiedCount || 0 };
};

const migrateGoodsReceipts = async (dryRun) => {
  let modifiedCount = 0;

  for await (const receipt of GoodsReceipt.find({}).cursor()) {
    let changed = false;
    receipt.items = (Array.isArray(receipt.items) ? receipt.items : []).map((item) => {
      const basePrice = toMoney(
        item.basePrice,
        toMoney(item.originalPrice, toMoney(item.sellingPrice, 0)),
      );
      const sellingPrice = toMoney(item.sellingPrice, 0);
      const next = {
        ...item.toObject(),
        costPrice: toMoney(item.costPrice, toMoney(item.unitPrice, 0)),
        basePrice,
        originalPrice: basePrice,
        sellingPrice,
      };

      if (
        next.costPrice !== item.costPrice ||
        next.basePrice !== item.basePrice ||
        next.originalPrice !== item.originalPrice ||
        next.sellingPrice !== item.sellingPrice
      ) {
        changed = true;
      }

      return next;
    });

    if (!changed) continue;
    modifiedCount += 1;
    if (!dryRun) {
      await receipt.save();
    }
  }

  return { goodsReceiptsModified: modifiedCount };
};

const migrateOrders = async (dryRun) => {
  let modifiedCount = 0;

  for await (const order of Order.find({}).cursor()) {
    let changed = false;
    order.items = (Array.isArray(order.items) ? order.items : []).map((item) => {
      const basePrice = toMoney(
        item.basePrice,
        toMoney(item.originalPrice, toMoney(item.price, 0)),
      );
      const costPrice = toMoney(item.costPrice, 0);
      const next = {
        ...item.toObject(),
        originalPrice: basePrice,
        basePrice,
        costPrice,
      };

      if (
        next.originalPrice !== item.originalPrice ||
        next.basePrice !== item.basePrice ||
        next.costPrice !== item.costPrice
      ) {
        changed = true;
      }

      return next;
    });

    if (!changed) continue;
    modifiedCount += 1;
    if (!dryRun) {
      await order.save();
    }
  }

  return { ordersModified: modifiedCount };
};

const migrateProducts = async (dryRun) => {
  const stockRows = await UniversalVariant.aggregate([
    {
      $group: {
        _id: "$productId",
        totalStock: { $sum: { $max: [{ $ifNull: ["$stock", 0] }, 0] } },
      },
    },
  ]);
  const stockByProductId = new Map(
    stockRows.map((row) => [String(row._id), Number(row.totalStock) || 0]),
  );
  const inboundProductIds = new Set(
    (
      await StockMovement.distinct("productId", {
        type: "INBOUND",
        quantity: { $gt: 0 },
      })
    ).map((value) => String(value)),
  );

  const products = await UniversalProduct.find({})
    .select("_id status lifecycleStage")
    .lean();

  const ops = products.map((product) => {
    const productId = String(product._id);
    const normalizedStatus = normalizeProductStatus(
      product.status,
      PRODUCT_STATUSES.COMING_SOON,
    );

    let nextStatus = normalizedStatus;
    if (!isManualProductStatus(normalizedStatus)) {
      const totalStock = stockByProductId.get(productId) || 0;
      if (totalStock > 0) {
        nextStatus = PRODUCT_STATUSES.IN_STOCK;
      } else if (inboundProductIds.has(productId)) {
        nextStatus = PRODUCT_STATUSES.OUT_OF_STOCK;
      } else {
        nextStatus = PRODUCT_STATUSES.COMING_SOON;
      }
    }

    return {
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            lifecycleStage: "ACTIVE",
            status: nextStatus,
          },
        },
      },
    };
  });

  if (dryRun || ops.length === 0) {
    return { productsModified: ops.length };
  }

  const result = await UniversalProduct.bulkWrite(ops, { ordered: false });
  return { productsModified: result.modifiedCount || 0 };
};

const main = async () => {
  const dryRun = process.argv.includes("--dry-run");
  await connectDB();

  console.log(`${LOG_PREFIX} starting${dryRun ? " (dry run)" : ""}`);

  const variantSummary = await migrateVariants(dryRun);
  const movementSummary = await migrateStockMovements(dryRun);
  const goodsReceiptSummary = await migrateGoodsReceipts(dryRun);
  const orderSummary = await migrateOrders(dryRun);
  const productSummary = await migrateProducts(dryRun);

  console.log(`${LOG_PREFIX} completed`, {
    dryRun,
    ...variantSummary,
    ...movementSummary,
    ...goodsReceiptSummary,
    ...orderSummary,
    ...productSummary,
  });
};

main()
  .catch((error) => {
    console.error(`${LOG_PREFIX} failed`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
