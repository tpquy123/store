import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Order from "../modules/order/Order.js";
import AuditLog from "../modules/audit/AuditLog.js";
import { ORDER_AUDIT_ACTIONS } from "../modules/order/orderAuditActions.js";
import { cancelExpiredVNPayOrders } from "../modules/order/orderCleanupService.js";
import UniversalProduct, { UniversalVariant } from "../modules/product/UniversalProduct.js";

let replSet;
let orderSeed = 1;

const nextOrderNumber = () => `ORD-SEPAY-CLEAN-${String(orderSeed++).padStart(6, "0")}`;

const ensureCollectionExists = async (name) => {
  const existing = await mongoose.connection.db.listCollections({ name }).toArray();
  if (existing.length > 0) {
    return;
  }
  await mongoose.connection.createCollection(name);
};

const clearAllCollections = async () => {
  const collections = Object.values(mongoose.connection.collections);
  for (const collection of collections) {
    await collection.deleteMany({});
  }
};

const runCleanupWithRetry = async (attempts = 3) => {
  for (let i = 0; i < attempts; i += 1) {
    const result = await cancelExpiredVNPayOrders();
    if (result.success) {
      return result;
    }

    const errorText = String(result.error || "");
    const isTransient =
      /LockTimeout/i.test(errorText) || /TransientTransactionError/i.test(errorText);

    if (!isTransient || i === attempts - 1) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  return { success: false, error: "retry_failed" };
};

const createSepayOrder = async ({
  status = "PENDING_PAYMENT",
  paymentStatus = "PENDING",
  sepayExpiresAt = new Date(Date.now() - 60 * 1000),
  createdAt = undefined,
} = {}) => {
  const ownerId = new mongoose.Types.ObjectId();

  return Order.create({
    userId: ownerId,
    customerId: ownerId,
    orderNumber: nextOrderNumber(),
    orderSource: "ONLINE",
    fulfillmentType: "HOME_DELIVERY",
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        variantId: new mongoose.Types.ObjectId(),
        productType: "UNIVERSAL",
        variantSku: `SKU-CLEAN-${Math.floor(Math.random() * 1000000)}`,
        name: "Cleanup Test Item",
        productName: "Cleanup Test Item",
        price: 1000000,
        quantity: 1,
      },
    ],
    shippingAddress: {
      fullName: "Cleanup Buyer",
      phoneNumber: "0909000000",
      email: "cleanup@test.local",
      province: "Can Tho",
      district: "Ninh Kieu",
      ward: "Xuan Khanh",
      detailAddress: "58 Duong 3 Thang 2",
    },
    paymentMethod: "BANK_TRANSFER",
    paymentStatus,
    status,
    paymentInfo: {
      sepayOrderCode: `DH${String(Math.floor(Math.random() * 1000000000)).padStart(9, "0")}`,
      sepayExpiresAt,
    },
    ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
  });
};

before(
  async () => {
    process.env.ORDER_AUDIT_ENABLED = "true";
    process.env.SEPAY_PAYMENT_TTL_MINUTES = "15";

    replSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: "wiredTiger",
      },
    });

    await mongoose.connect(replSet.getUri(), {
      dbName: "sepay-cleanup-integration-test",
    });

    await Promise.all([
      ensureCollectionExists("orders"),
      ensureCollectionExists("auditlogs"),
      ensureCollectionExists("universalproducts"),
      ensureCollectionExists("universalvariants"),
      Order.init(),
      AuditLog.init(),
      UniversalProduct.init(),
      UniversalVariant.init(),
    ]);
  },
  { timeout: 180000 }
);

beforeEach(async () => {
  await clearAllCollections();
});

after(
  async () => {
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  },
  { timeout: 120000 }
);

test("cleanup job auto-cancels expired SePay pending-payment orders", async () => {
  const expiredOrder = await createSepayOrder({
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    sepayExpiresAt: new Date(Date.now() - 5 * 60 * 1000),
  });

  const activeOrder = await createSepayOrder({
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    sepayExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  const paidOrder = await createSepayOrder({
    status: "PENDING",
    paymentStatus: "PAID",
    sepayExpiresAt: new Date(Date.now() - 30 * 60 * 1000),
  });

  const result = await runCleanupWithRetry();

  assert.equal(result.success, true);
  assert.equal(result.cancelled, 1);

  const reloadedExpired = await Order.findById(expiredOrder._id).lean();
  const reloadedActive = await Order.findById(activeOrder._id).lean();
  const reloadedPaid = await Order.findById(paidOrder._id).lean();

  assert.equal(reloadedExpired.status, "CANCELLED");
  assert.match(String(reloadedExpired.cancelReason || ""), /SePay/i);
  assert.equal(reloadedActive.status, "PENDING_PAYMENT");
  assert.equal(reloadedPaid.status, "PENDING");
  assert.equal(reloadedPaid.paymentStatus, "PAID");

  const auditLog = await AuditLog.findOne({
    actionType: ORDER_AUDIT_ACTIONS.AUTO_CANCEL_EXPIRED_ORDER,
    orderId: expiredOrder._id,
  }).lean();

  assert.ok(auditLog);
  assert.equal(auditLog.outcome, "SUCCESS");
  assert.equal(auditLog.actor?.source, "SCHEDULER_JOB");
});
