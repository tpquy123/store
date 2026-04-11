import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { runWithBranchContext } from "../authz/branchContext.js";
import Device from "../modules/device/Device.js";
import {
  IDENTIFIER_POLICIES,
  TRACKING_MODES,
  WARRANTY_PROVIDERS,
  mergeAfterSalesConfig,
} from "../modules/device/afterSalesConfig.js";
import { registerSerializedUnits } from "../modules/device/deviceService.js";
import UniversalProduct, {
  UniversalVariant,
} from "../modules/product/UniversalProduct.js";
import ProductType from "../modules/productType/ProductType.js";
import WarrantyRecord from "../modules/warranty/WarrantyRecord.js";
import {
  activateWarrantyForOrder,
  getPublicWarrantyLookup,
  searchWarrantyRecords,
} from "../modules/warranty/warrantyService.js";

let mongoServer;

const clearAllCollections = async () => {
  const collections = Object.values(mongoose.connection.collections);
  for (const collection of collections) {
    await collection.deleteMany({});
  }
};

const seedCatalog = async ({
  productTypeName = "Smartphone",
  condition = "LIKE_NEW",
  trackingMode = TRACKING_MODES.SERIALIZED,
  identifierPolicy = IDENTIFIER_POLICIES.IMEI,
  warrantyMonths = 12,
  productAfterSalesConfig = {},
} = {}) => {
  const createdBy = new mongoose.Types.ObjectId();
  const productType = await ProductType.create({
    name: productTypeName,
    createdBy,
    afterSalesDefaults: {
      trackingMode,
      identifierPolicy,
      warrantyMonths,
    },
  });

  const product = await UniversalProduct.create({
    name: `${productTypeName} Test Device`,
    model: `${productTypeName.toUpperCase()}-MODEL-1`,
    baseSlug: `${productTypeName.toLowerCase()}-test-device-${String(
      new mongoose.Types.ObjectId()
    ).slice(-6)}`,
    slug: `${productTypeName.toLowerCase()}-test-device-${String(
      new mongoose.Types.ObjectId()
    ).slice(-6)}`,
    brand: new mongoose.Types.ObjectId(),
    productType: productType._id,
    createdBy,
    afterSalesConfig: productAfterSalesConfig,
    condition,
    lifecycleStage: "ACTIVE",
    status: "AVAILABLE",
  });

  const variant = await UniversalVariant.create({
    color: "Black",
    variantName: "256GB",
    originalPrice: 30000000,
    price: 28000000,
    stock: 5,
    images: [],
    sku: `SKU-${new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase()}`,
    slug: `${product.baseSlug}-256gb`,
    productId: product._id,
  });

  product.variants = [variant._id];
  await product.save();

  return { productType, product, variant };
};

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), {
    dbName: "device-warranty-service-test",
  });
});

beforeEach(async () => {
  await clearAllCollections();
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test("after-sales defaults distinguish BRAND and STORE warranty by product condition", async () => {
  const brandCatalog = await seedCatalog({
    productTypeName: "Smartphone",
    condition: "NEW",
  });
  const storeCatalog = await seedCatalog({
    productTypeName: "Laptop",
    condition: "LIKE_NEW",
    identifierPolicy: IDENTIFIER_POLICIES.SERIAL,
  });

  const brandConfig = mergeAfterSalesConfig({
    product: brandCatalog.product.toObject(),
    productType: brandCatalog.productType.toObject(),
  });
  const storeConfig = mergeAfterSalesConfig({
    product: storeCatalog.product.toObject(),
    productType: storeCatalog.productType.toObject(),
  });

  assert.equal(brandConfig.warrantyProvider, WARRANTY_PROVIDERS.BRAND);
  assert.equal(brandConfig.trackingMode, TRACKING_MODES.NONE);
  assert.equal(brandConfig.warrantyMonths, 12);

  assert.equal(storeConfig.warrantyProvider, WARRANTY_PROVIDERS.STORE);
  assert.equal(storeConfig.trackingMode, TRACKING_MODES.SERIALIZED);
  assert.equal(storeConfig.identifierPolicy, IDENTIFIER_POLICIES.SERIAL);
});

test("registerSerializedUnits validates identifier format and uniqueness for store-managed products", async () => {
  const storeId = new mongoose.Types.ObjectId();
  const { product, variant } = await seedCatalog({
    productTypeName: "Smartphone",
    condition: "LIKE_NEW",
  });

  await runWithBranchContext(
    {
      activeBranchId: String(storeId),
      scopeMode: "branch",
      isGlobalAdmin: false,
    },
    async () => {
      const devices = await registerSerializedUnits({
        storeId,
        productId: product._id,
        variantId: variant._id,
        variantSku: variant.sku,
        productName: product.name,
        variantName: variant.variantName,
        serializedUnits: [{ imei: "356789012345678" }],
      });

      assert.equal(devices.length, 1);
      assert.equal(devices[0].imeiNormalized, "356789012345678");

      const persisted = await Device.findById(devices[0]._id)
        .setOptions({ skipBranchIsolation: true })
        .lean();
      assert.ok(persisted);

      await assert.rejects(
        registerSerializedUnits({
          storeId,
          productId: product._id,
          variantId: variant._id,
          variantSku: variant.sku,
          productName: product.name,
          variantName: variant.variantName,
          serializedUnits: [{ imei: "12345" }],
        }),
        (error) => {
          assert.equal(error.code, "DEVICE_IDENTIFIER_INVALID");
          return true;
        }
      );

      await assert.rejects(
        registerSerializedUnits({
          storeId,
          productId: product._id,
          variantId: variant._id,
          variantSku: variant.sku,
          productName: product.name,
          variantName: variant.variantName,
          serializedUnits: [{ imei: "356789012345678" }],
        }),
        (error) => {
          assert.equal(error.code, "DEVICE_IMEI_DUPLICATE");
          return true;
        }
      );
    }
  );
});

test("activateWarrantyForOrder creates a store warranty record and supports public lookup by phone or IMEI", async () => {
  const storeId = new mongoose.Types.ObjectId();
  const { product, variant } = await seedCatalog({
    productTypeName: "Smartphone",
    condition: "LIKE_NEW",
  });

  const order = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "POS-WARRANTY-001",
    assignedStore: { storeId },
    customerId: new mongoose.Types.ObjectId(),
    shippingAddress: {
      fullName: "Customer Test",
      phoneNumber: "0900000000",
    },
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productId: product._id,
        variantSku: variant.sku,
        quantity: 1,
        productName: product.name,
        imei: "356789012345680",
      },
    ],
  };

  const soldAt = new Date("2026-03-01T00:00:00Z");
  const records = await activateWarrantyForOrder({
    order,
    soldAt,
    actor: { _id: new mongoose.Types.ObjectId(), fullName: "Cashier" },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].warrantyType, "STORE");
  assert.equal(records[0].customerPhone, "0900000000");
  assert.equal(records[0].imei, "356789012345680");

  const savedWarranty = await WarrantyRecord.findById(records[0]._id)
    .setOptions({ skipBranchIsolation: true })
    .lean();
  assert.ok(savedWarranty);
  assert.equal(savedWarranty.customerPhoneNormalized, "0900000000");
  assert.equal(savedWarranty.warrantyMonths, 12);
  assert.equal(
    new Date(savedWarranty.expiresAt).toISOString(),
    "2027-03-01T00:00:00.000Z"
  );

  const lookupByIdentifier = await getPublicWarrantyLookup({
    identifier: "356789012345680",
  });
  assert.equal(lookupByIdentifier.productName, product.name);
  assert.equal(lookupByIdentifier.warrantyStatus, "ACTIVE");

  const lookupByPhone = await searchWarrantyRecords({
    phone: "0900000000",
  });
  assert.equal(lookupByPhone.total, 1);
  assert.equal(lookupByPhone.warranties[0].identifier, "356789012345680");
  assert.equal(lookupByPhone.warranties[0].warrantyPolicy, "");
});

test("activateWarrantyForOrder rejects missing identifiers for serialized store warranty items", async () => {
  const storeId = new mongoose.Types.ObjectId();
  const { product, variant } = await seedCatalog({
    productTypeName: "Laptop",
    condition: "LIKE_NEW",
    identifierPolicy: IDENTIFIER_POLICIES.SERIAL,
  });

  const order = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "ORD-STORE-001",
    assignedStore: { storeId },
    shippingAddress: {
      fullName: "Customer Test",
      phoneNumber: "0911111111",
    },
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productId: product._id,
        variantSku: variant.sku,
        quantity: 1,
        productName: product.name,
      },
    ],
  };

  await assert.rejects(
    activateWarrantyForOrder({
      order,
      soldAt: new Date("2026-03-01T00:00:00Z"),
    }),
    (error) => {
      assert.equal(error.code, "WARRANTY_IDENTIFIER_REQUIRED");
      return true;
    }
  );
});

test("activateWarrantyForOrder skips brand warranty products", async () => {
  const storeId = new mongoose.Types.ObjectId();
  const { product, variant } = await seedCatalog({
    productTypeName: "Smartphone",
    condition: "NEW",
  });

  const order = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: "ORD-BRAND-001",
    assignedStore: { storeId },
    shippingAddress: {
      fullName: "Customer Test",
      phoneNumber: "0922222222",
    },
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        productId: product._id,
        variantSku: variant.sku,
        quantity: 1,
        productName: product.name,
      },
    ],
  };

  const records = await activateWarrantyForOrder({
    order,
    soldAt: new Date("2026-03-01T00:00:00Z"),
  });

  assert.equal(records.length, 0);
  assert.equal(
    await WarrantyRecord.countDocuments().setOptions({ skipBranchIsolation: true }),
    0
  );
});
