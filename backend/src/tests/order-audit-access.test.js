import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

import config from "../config/config.js";
import orderAuditRoutes from "../modules/audit/orderAuditRoutes.js";
import User from "../modules/auth/User.js";
import Store from "../modules/store/Store.js";
import AuditLog from "../modules/audit/AuditLog.js";

let mongoServer;
let app;
let fixture = {};
let phoneSeed = 200000000;

const nextPhone = () => `0${String(phoneSeed++).padStart(9, "0")}`;

const createStore = async ({ code, name }) => {
  return Store.create({
    code,
    name,
    status: "ACTIVE",
    address: {
      province: "Ho Chi Minh",
      district: "District 1",
      street: "Test Street",
    },
  });
};

const createToken = (user) => {
  return jwt.sign(
    {
      id: String(user._id),
      pv: Number(user.permissionsVersion || 1),
    },
    config.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

before(
  async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "order-audit-access-test",
    });

    app = express();
    app.use(express.json());
    app.use("/api/audit-logs", orderAuditRoutes);
  },
  { timeout: 120000 }
);

beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  for (const collection of collections) {
    await collection.deleteMany({});
  }

  const [storeA, storeB] = await Promise.all([
    createStore({ code: "BRA", name: "Branch A" }),
    createStore({ code: "BRB", name: "Branch B" }),
  ]);

  const [globalAdmin, orderManager, customer] = await Promise.all([
    User.create({
      role: "GLOBAL_ADMIN",
      systemRoles: ["GLOBAL_ADMIN"],
      fullName: "Global Admin",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      status: "ACTIVE",
    }),
    User.create({
      role: "ORDER_MANAGER",
      fullName: "Branch Order Manager",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      status: "ACTIVE",
      branchAssignments: [
        {
          storeId: storeA._id,
          roles: ["ORDER_MANAGER"],
          status: "ACTIVE",
          isPrimary: true,
        },
      ],
    }),
    User.create({
      role: "CUSTOMER",
      fullName: "Customer User",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      status: "ACTIVE",
    }),
  ]);

  const orderId = new mongoose.Types.ObjectId();
  await AuditLog.insertMany([
    {
      entityType: "ORDER",
      entityId: String(orderId),
      orderId,
      branchId: storeA._id,
      actionType: "UPDATE_STATUS",
      outcome: "SUCCESS",
      actor: {
        actorType: "USER",
        userId: orderManager._id,
        role: "ORDER_MANAGER",
        source: "TEST",
      },
    },
    {
      entityType: "ORDER",
      entityId: String(orderId),
      orderId,
      branchId: storeB._id,
      actionType: "UPDATE_STATUS",
      outcome: "SUCCESS",
      actor: {
        actorType: "USER",
        userId: orderManager._id,
        role: "ORDER_MANAGER",
        source: "TEST",
      },
    },
    {
      entityType: "ORDER",
      entityId: String(orderId),
      orderId,
      branchId: null,
      actionType: "PROCESS_CARRIER_WEBHOOK",
      outcome: "SUCCESS",
      actor: {
        actorType: "SYSTEM",
        userId: null,
        role: "SYSTEM",
        source: "TEST",
      },
    },
  ]);

  fixture = {
    storeA,
    storeB,
    globalAdmin,
    orderManager,
    customer,
  };
});

after(
  async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  },
  { timeout: 120000 }
);

test("disallowed role cannot access order audit list", async () => {
  const token = createToken(fixture.customer);
  const response = await request(app)
    .get("/api/audit-logs/orders")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 403);
  assert.equal(response.body?.code, "AUTHZ_ACTION_DENIED");
});

test("branch-scoped order manager only sees own branch logs", async () => {
  const token = createToken(fixture.orderManager);
  const response = await request(app)
    .get("/api/audit-logs/orders")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  const logs = response.body?.data?.logs || [];
  assert.equal(logs.length, 1);
  assert.equal(String(logs[0].branchId), String(fixture.storeA._id));
});

test("global admin can query logs with null branch", async () => {
  const token = createToken(fixture.globalAdmin);
  const response = await request(app)
    .get("/api/audit-logs/orders")
    .query({ branchId: "null" })
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  const logs = response.body?.data?.logs || [];
  assert.equal(logs.length, 1);
  assert.equal(logs[0].branchId, null);
});
