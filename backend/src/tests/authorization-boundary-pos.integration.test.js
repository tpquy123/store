import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

import config from "../config/config.js";
import orderRoutes from "../modules/order/orderRoutes.js";
import deviceRoutes from "../modules/device/deviceRoutes.js";
import warrantyRoutes from "../modules/warranty/warrantyRoutes.js";
import User from "../modules/auth/User.js";
import Store from "../modules/store/Store.js";
import { ensurePermissionCatalogSeeded } from "../authz/permissionCatalog.js";
import { ensurePermissionTemplatesSeeded } from "../authz/permissionTemplateService.js";
import { syncUserRoleAssignments } from "../authz/roleAssignmentService.js";
import { applyUserPermissionAssignments } from "../authz/userPermissionService.js";

let mongoServer;
let app;
let fixture = {};
let phoneSeed = 390000000;

const nextPhone = () => `0${String(phoneSeed++).padStart(9, "0")}`;

const createStore = async ({ code, name }) =>
  Store.create({
    code,
    name,
    status: "ACTIVE",
    address: {
      province: "Ho Chi Minh",
      district: "District 1",
      street: "Authz Boundary Street",
    },
  });

const createToken = (user) =>
  jwt.sign(
    {
      id: String(user._id),
      pv: Number(user.permissionsVersion || 1),
    },
    config.JWT_SECRET,
    { expiresIn: "1h" },
  );

before(
  async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "authorization-boundary-pos-integration-test",
    });

    app = express();
    app.use(express.json());
    app.use("/api/orders", orderRoutes);
    app.use("/api/devices", deviceRoutes);
    app.use("/api/warranty", warrantyRoutes);
  },
  { timeout: 120000 },
);

beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  for (const collection of collections) {
    await collection.deleteMany({});
  }

  await ensurePermissionCatalogSeeded();
  await ensurePermissionTemplatesSeeded();

  const branch = await createStore({ code: "POS1", name: "POS Branch" });

  const explicitPosUser = await User.create({
    role: "POS_STAFF",
    permissionMode: "EXPLICIT",
    fullName: "POS Explicit User",
    phoneNumber: nextPhone(),
    password: "Strong@1234",
    status: "ACTIVE",
    storeLocation: String(branch._id),
  });

  await syncUserRoleAssignments({
    user: explicitPosUser,
    assignments: [
      {
        roleKey: "POS_STAFF",
        scopeType: "BRANCH",
        scopeRef: String(branch._id),
      },
    ],
    primaryBranchId: String(branch._id),
    reason: "test_pos_role_seed",
  });

  await applyUserPermissionAssignments({
    targetUserId: explicitPosUser._id,
    assignments: [
      {
        key: "pos.order.create",
        scopeType: "BRANCH",
        scopeId: String(branch._id),
      },
      {
        key: "pos.order.cancel",
        scopeType: "BRANCH",
        scopeId: String(branch._id),
      },
      {
        key: "pos.order.finalize",
        scopeType: "BRANCH",
        scopeId: String(branch._id),
      },
    ],
    reason: "test_pos_direct_grants",
  });

  const customer = await User.create({
    role: "CUSTOMER",
    permissionMode: "ROLE_FALLBACK",
    fullName: "Customer User",
    phoneNumber: nextPhone(),
    password: "Strong@1234",
    status: "ACTIVE",
  });

  await syncUserRoleAssignments({
    user: customer,
    assignments: [
      {
        roleKey: "CUSTOMER",
        scopeType: "SELF",
        scopeRef: String(customer._id),
      },
    ],
    reason: "test_customer_role_seed",
  });

  fixture = {
    branch,
    explicitPosUser: await User.findById(explicitPosUser._id),
    customer: await User.findById(customer._id),
  };
});

after(
  async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  },
  { timeout: 120000 },
);

test("explicit POS user is denied manager and after-sales APIs", async () => {
  const token = createToken(fixture.explicitPosUser);

  const [ordersResponse, devicesResponse, warrantyResponse] = await Promise.all([
    request(app)
      .get("/api/orders/all")
      .set("Authorization", `Bearer ${token}`),
    request(app)
      .get("/api/devices")
      .set("Authorization", `Bearer ${token}`),
    request(app)
      .get("/api/warranty")
      .set("Authorization", `Bearer ${token}`),
  ]);

  assert.equal(ordersResponse.status, 403);
  assert.equal(ordersResponse.body?.code, "AUTHZ_ACTION_DENIED");
  assert.equal(devicesResponse.status, 403);
  assert.equal(devicesResponse.body?.code, "AUTHZ_ACTION_DENIED");
  assert.equal(warrantyResponse.status, 403);
  assert.equal(warrantyResponse.body?.code, "AUTHZ_ACTION_DENIED");
});

test("customer can still read own order history endpoint", async () => {
  const token = createToken(fixture.customer);

  const response = await request(app)
    .get("/api/orders/my-orders")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  assert.ok(Array.isArray(response.body?.data?.orders));
});
