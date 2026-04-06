/**
 * Integration tests: Paid-order cancel guard & 2-hour revert window
 *
 * Kiểm tra rằng:
 * 1. Đơn đã thanh toán (paymentStatus=PAID) KHÔNG thể bị hủy trực tiếp qua cancelOrder
 * 2. Đơn đã thanh toán KHÔNG thể bị hủy qua updateOrderStatus với status=CANCELLED
 * 3. Đơn chưa thanh toán (COD/PENDING) vẫn hủy được bình thường
 * 4. Admin có thể chuyển sang CANCEL_REFUND_PENDING (snapshot được ghi, revertableUntil được set)
 * 5. Admin có thể revert trong 2 giờ
 * 6. Revert sau 2 giờ bị từ chối (REVERT_WINDOW_EXPIRED)
 *
 * Pattern: Sử dụng JWT thật + test-only middleware để inject req.user và req.authz
 * (tương tự pattern trong sepay.integration.test.js)
 */

import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import config from "../config/config.js";
import Order from "../modules/order/Order.js";
import User from "../modules/auth/User.js";
import { protect } from "../middleware/authMiddleware.js";
import { resolveAccessContext } from "../middleware/authz/resolveAccessContext.js";
import * as orderController from "../modules/order/orderController.js";
import { authorize } from "../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../authz/actions.js";

let replSet;
let app;
let adminUser;
let orderSeed = 1;
let phoneSeed = 700000000;

const nextPhone = () => `0${String(phoneSeed++).padStart(9, "0")}`;
const nextOrderNumber = () => `ORD-GUARD-${String(orderSeed++).padStart(6, "0")}`;

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

const buildAdminToken = (user) =>
  jwt.sign(
    { id: String(user._id), pv: Number(user.permissionsVersion || 1) },
    config.JWT_SECRET,
    { expiresIn: "1h" }
  );

const createAdminUser = async () =>
  User.create({
    role: "GLOBAL_ADMIN",
    systemRoles: ["GLOBAL_ADMIN"],
    fullName: "Admin Guard Test",
    phoneNumber: nextPhone(),
    email: `admin-guard-${Date.now()}-${Math.random()}@test.local`,
    password: "Strong@1234",
    status: "ACTIVE",
    permissionsVersion: 1,
  });

const createPaidOnlineOrder = async (ownerId, overrides = {}) =>
  Order.create({
    userId: ownerId,
    customerId: ownerId,
    orderNumber: nextOrderNumber(),
    orderSource: "ONLINE",
    fulfillmentType: "HOME_DELIVERY",
    items: [
      {
        price: 5000000,
        quantity: 1,
        name: "iPhone 15",
        productName: "iPhone 15",
      },
    ],
    shippingAddress: {
      fullName: "Nguyen Van A",
      phoneNumber: "0909000000",
      email: "buyer@test.local",
      province: "Ho Chi Minh",
      district: "Quan 1",
      ward: "Phuong Ben Nghe",
      detailAddress: "123 Le Loi",
    },
    paymentMethod: "BANK_TRANSFER",
    paymentStatus: "PAID",
    paidAt: new Date(),
    status: "PENDING",
    totalAmount: 5000000,
    total: 5000000,
    subtotal: 5000000,
    ...overrides,
  });

const createUnpaidCodOrder = async (ownerId) =>
  Order.create({
    userId: ownerId,
    customerId: ownerId,
    orderNumber: nextOrderNumber(),
    orderSource: "ONLINE",
    fulfillmentType: "HOME_DELIVERY",
    items: [
      {
        price: 1000000,
        quantity: 1,
        name: "Samsung A15",
        productName: "Samsung A15",
      },
    ],
    shippingAddress: {
      fullName: "Nguyen Van B",
      phoneNumber: "0908000000",
      email: "buyer2@test.local",
      province: "Ha Noi",
      district: "Cau Giay",
      ward: "Mai Dich",
      detailAddress: "456 Tran Thai Tong",
    },
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    status: "PENDING",
    totalAmount: 1000000,
    total: 1000000,
    subtotal: 1000000,
  });

before(
  async () => {
    process.env.ORDER_AUDIT_ENABLED = "false";

    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    await mongoose.connect(replSet.getUri(), {
      dbName: "paid-order-guard-test",
    });

    await Promise.all([
      ensureCollectionExists("orders"),
      ensureCollectionExists("users"),
      Order.init(),
      User.init(),
    ]);

    app = express();
    app.use(express.json());
    app.use(protect);
    app.use(resolveAccessContext);

    app.patch("/:id/cancel", orderController.cancelOrder);
    app.patch(
      "/:id/status",
      authorize(AUTHZ_ACTIONS.ORDERS_WRITE, { scopeMode: "global", resourceType: "ORDER" }),
      orderController.updateOrderStatus
    );
    app.post(
      "/:id/revert",
      authorize(AUTHZ_ACTIONS.ORDERS_WRITE, { scopeMode: "global", resourceType: "ORDER" }),
      orderController.revertOrderStatus
    );

    app.use((err, req, res, next) => {
      if (res.headersSent) return next(err);
      return res.status(err.httpStatus || 500).json({
        success: false,
        message: err.message || "Unhandled error",
      });
    });
  },
  { timeout: 180000 }
);

beforeEach(async () => {
  await clearAllCollections();
  // Small pause to let WiredTiger release IX locks after collection truncation
  await new Promise((resolve) => setTimeout(resolve, 80));
  adminUser = await createAdminUser();
});

after(
  async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  },
  { timeout: 120000 }
);

// ─────────────────────────────────────────────────────────────
// TEST 1: cancelOrder phải block đơn đã PAID với 409
// ─────────────────────────────────────────────────────────────
test("PATCH /:id/cancel – block đơn đã PAID với 409 PAID_ORDER_CANCEL_BLOCKED", async () => {
  const order = await createPaidOnlineOrder(adminUser._id);
  const token = buildAdminToken(adminUser);

  const response = await request(app)
    .patch(`/${order._id}/cancel`)
    .set("Authorization", `Bearer ${token}`)
    .send({ cancelReason: "Test hủy nhầm" });

  assert.equal(
    response.status,
    409,
    `Expected 409 but got ${response.status}: ${JSON.stringify(response.body)}`
  );
  assert.equal(response.body.code, "PAID_ORDER_CANCEL_BLOCKED");
  assert.equal(response.body.suggestedStatus, "CANCEL_REFUND_PENDING");

  // Đơn phải vẫn còn nguyên trạng thái PENDING + PAID
  const reloaded = await Order.findById(order._id).lean();
  assert.equal(reloaded.status, "PENDING");
  assert.equal(reloaded.paymentStatus, "PAID");
});

// ─────────────────────────────────────────────────────────────
// TEST 2: updateOrderStatus CANCELLED phải block đơn đã PAID
// ─────────────────────────────────────────────────────────────
test("PATCH /:id/status {CANCELLED} – block đơn đã PAID với 409 PAID_ORDER_CANCEL_BLOCKED", async () => {
  const order = await createPaidOnlineOrder(adminUser._id);
  const token = buildAdminToken(adminUser);

  const response = await request(app)
    .patch(`/${order._id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "CANCELLED", note: "Admin hủy nhầm" });

  assert.equal(
    response.status,
    409,
    `Expected 409 but got ${response.status}: ${JSON.stringify(response.body)}`
  );
  assert.equal(response.body.code, "PAID_ORDER_CANCEL_BLOCKED");

  const reloaded = await Order.findById(order._id).lean();
  assert.equal(reloaded.status, "PENDING");
  assert.equal(reloaded.paymentStatus, "PAID");
});

// ─────────────────────────────────────────────────────────────
// TEST 3: Đơn COD chưa PAID vẫn hủy được bình thường
// ─────────────────────────────────────────────────────────────
test("PATCH /:id/cancel – Đơn COD chưa thanh toán vẫn hủy được (200)", async () => {
  const order = await createUnpaidCodOrder(adminUser._id);
  const token = buildAdminToken(adminUser);

  const response = await request(app)
    .patch(`/${order._id}/cancel`)
    .set("Authorization", `Bearer ${token}`)
    .send({ cancelReason: "Khách đổi ý" });

  assert.equal(
    response.status,
    200,
    `Expected 200 but got ${response.status}: ${JSON.stringify(response.body)}`
  );
  assert.equal(response.body.success, true);

  const reloaded = await Order.findById(order._id).lean();
  assert.equal(reloaded.status, "CANCELLED");
});

// ─────────────────────────────────────────────────────────────
// TEST 4: Admin chuyển đơn PAID sang CANCEL_REFUND_PENDING
//         → snapshot được ghi, revertableUntil được set, refundStatus=PENDING
// ─────────────────────────────────────────────────────────────
test("PATCH /:id/status {CANCEL_REFUND_PENDING} – snapshot + revertableUntil + refundStatus=PENDING", async () => {
  const order = await createPaidOnlineOrder(adminUser._id);
  const token = buildAdminToken(adminUser);
  const beforeTime = new Date();

  const response = await request(app)
    .patch(`/${order._id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "CANCEL_REFUND_PENDING", note: "Hết hàng – cần hoàn tiền" });

  assert.equal(
    response.status,
    200,
    `Expected 200 but got ${response.status}: ${JSON.stringify(response.body)}`
  );
  assert.equal(response.body.success, true);

  const reloaded = await Order.findById(order._id).lean();
  assert.equal(reloaded.status, "CANCEL_REFUND_PENDING", "Status phải là CANCEL_REFUND_PENDING");
  assert.equal(reloaded.cancelledByAdmin, true, "cancelledByAdmin phải true");
  assert.equal(reloaded.refundStatus, "PENDING", "refundStatus phải là PENDING");
  assert.ok(reloaded.revertableUntil, "revertableUntil phải được set");

  const revertableUntilDate = new Date(reloaded.revertableUntil);
  assert.ok(revertableUntilDate > beforeTime, "revertableUntil phải là tương lai");
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000 + 10000);
  assert.ok(revertableUntilDate <= twoHoursFromNow, "revertableUntil không được quá ~2 giờ");

  // Snapshot phải tồn tại với đúng dữ liệu
  assert.ok(Array.isArray(reloaded.snapshots) && reloaded.snapshots.length > 0, "Snapshot phải được ghi");
  const snap = reloaded.snapshots[reloaded.snapshots.length - 1];
  assert.equal(snap.status, "PENDING", "Snapshot phải lưu trạng thái cũ PENDING");
  assert.equal(snap.paymentStatus, "PAID", "Snapshot phải lưu paymentStatus PAID");
});

// ─────────────────────────────────────────────────────────────
// TEST 5: Admin revert trong vòng 2 giờ → thành công
// ─────────────────────────────────────────────────────────────
test("POST /:id/revert – trong 2 giờ phải thành công, khôi phục trạng thái cũ", async () => {
  const order = await createPaidOnlineOrder(adminUser._id);
  const token = buildAdminToken(adminUser);

  // Bước 1: Chuyển sang CANCEL_REFUND_PENDING
  const cancelResponse = await request(app)
    .patch(`/${order._id}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({ status: "CANCEL_REFUND_PENDING", note: "Lỡ tay đổi sai" });
  assert.equal(cancelResponse.status, 200, `Safe-cancel failed: ${JSON.stringify(cancelResponse.body)}`);

  const afterCancel = await Order.findById(order._id).lean();
  assert.equal(afterCancel.status, "CANCEL_REFUND_PENDING");

  // Bước 2: Revert ngay (trong 2 giờ)
  const revertResponse = await request(app)
    .post(`/${order._id}/revert`)
    .set("Authorization", `Bearer ${token}`)
    .send({});

  assert.equal(
    revertResponse.status,
    200,
    `Expected 200 but got ${revertResponse.status}: ${JSON.stringify(revertResponse.body)}`
  );
  assert.equal(revertResponse.body.success, true);

  const afterRevert = await Order.findById(order._id).lean();
  assert.equal(afterRevert.status, "PENDING", "Phải về trạng thái PENDING");
  assert.equal(afterRevert.paymentStatus, "PAID", "paymentStatus phải vẫn là PAID");
  assert.equal(afterRevert.refundStatus, "NOT_REQUIRED", "refundStatus phải reset");
  assert.equal(afterRevert.cancelledByAdmin, false, "cancelledByAdmin phải false");
  assert.equal(afterRevert.revertableUntil, null, "revertableUntil phải bị xóa");
});

// ─────────────────────────────────────────────────────────────
// TEST 6: Admin revert SAU 2 giờ → 403 REVERT_WINDOW_EXPIRED
// ─────────────────────────────────────────────────────────────
test("POST /:id/revert – sau 2 giờ phải trả 403 REVERT_WINDOW_EXPIRED", async () => {
  const order = await createPaidOnlineOrder(adminUser._id);
  const token = buildAdminToken(adminUser);

  // Tạo thủ công snapshot với revertableUntil trong QUÁ KHỨ
  await Order.findByIdAndUpdate(order._id, {
    status: "CANCEL_REFUND_PENDING",
    cancelledByAdmin: true,
    refundStatus: "PENDING",
    revertableUntil: new Date(Date.now() - 1000), // 1 giây trước = hết hạn
    $push: {
      snapshots: {
        status: "PENDING",
        paymentStatus: "PAID",
        snapshotAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        reason: "Test expired window",
      },
    },
  });

  const revertResponse = await request(app)
    .post(`/${order._id}/revert`)
    .set("Authorization", `Bearer ${token}`)
    .send({});

  assert.equal(
    revertResponse.status,
    403,
    `Expected 403 but got ${revertResponse.status}: ${JSON.stringify(revertResponse.body)}`
  );
  assert.equal(revertResponse.body.code, "REVERT_WINDOW_EXPIRED");

  // Đơn không được thay đổi
  const afterRevert = await Order.findById(order._id).lean();
  assert.equal(afterRevert.status, "CANCEL_REFUND_PENDING", "Đơn không được thay đổi sau khi revert thất bại");
});
