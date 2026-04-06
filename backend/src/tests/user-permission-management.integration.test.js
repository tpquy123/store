import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

import config from "../config/config.js";
import userRoutes from "../modules/auth/userRoutes.js";
import User from "../modules/auth/User.js";
import Store from "../modules/store/Store.js";
import UserPermissionGrant from "../modules/auth/UserPermissionGrant.js";

let mongoServer;
let app;
let fixture = {};
let phoneSeed = 360000000;

const nextPhone = () => `0${String(phoneSeed++).padStart(9, "0")}`;

const createStore = async ({ code, name }) =>
  Store.create({
    code,
    name,
    status: "ACTIVE",
    address: {
      province: "Ho Chi Minh",
      district: "District 1",
      street: "Test Street",
    },
  });

const createToken = (user) =>
  jwt.sign(
    {
      id: String(user._id),
      pv: Number(user.permissionsVersion || 1),
    },
    config.JWT_SECRET,
    { expiresIn: "1h" }
  );

before(
  async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "user-permission-management-integration-test",
    });

    app = express();
    app.use(express.json());
    app.use("/api/users", userRoutes);
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

  const [branchAdmin, outsideStaff, globalAdmin] = await Promise.all([
    User.create({
      role: "BRANCH_ADMIN",
      fullName: "Branch Admin",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      status: "ACTIVE",
      storeLocation: String(storeA._id),
      branchAssignments: [
        {
          storeId: storeA._id,
          roles: ["BRANCH_ADMIN"],
          status: "ACTIVE",
          isPrimary: true,
        },
      ],
    }),
    User.create({
      role: "POS_STAFF",
      fullName: "Outside Staff",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      status: "ACTIVE",
      storeLocation: String(storeB._id),
      branchAssignments: [
        {
          storeId: storeB._id,
          roles: ["POS_STAFF"],
          status: "ACTIVE",
          isPrimary: true,
        },
      ],
    }),
    User.create({
      role: "GLOBAL_ADMIN",
      fullName: "Global Admin",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      status: "ACTIVE",
      systemRoles: ["GLOBAL_ADMIN"],
    }),
  ]);

  fixture = {
    storeA,
    storeB,
    branchAdmin,
    outsideStaff,
    globalAdmin,
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

test("branch admin cannot create GLOBAL_ADMIN account", async () => {
  const token = createToken(fixture.branchAdmin);
  const response = await request(app)
    .post("/api/users/employees")
    .set("Authorization", `Bearer ${token}`)
    .send({
      fullName: "Escalation User",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      role: "GLOBAL_ADMIN",
    });

  assert.equal(response.status, 403);
  assert.equal(response.body?.code, "AUTHZ_ROLE_FORBIDDEN");
});

test("branch admin cannot update employee outside assigned branches", async () => {
  const token = createToken(fixture.branchAdmin);
  const response = await request(app)
    .put(`/api/users/employees/${fixture.outsideStaff._id}`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      fullName: "Mutated Name",
    });

  assert.equal(response.status, 403);
  assert.equal(response.body?.code, "AUTHZ_BRANCH_FORBIDDEN");
});

test("branch admin cannot toggle status for employee outside assigned branches", async () => {
  const token = createToken(fixture.branchAdmin);
  const response = await request(app)
    .patch(`/api/users/employees/${fixture.outsideStaff._id}/toggle-status`)
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 403);
  assert.equal(response.body?.code, "AUTHZ_BRANCH_FORBIDDEN");
});

test("explicit SELF permissions bind to target user during create", async () => {
  const token = createToken(fixture.globalAdmin);
  const response = await request(app)
    .post("/api/users/employees")
    .set("Authorization", `Bearer ${token}`)
    .send({
      fullName: "Self Scope User",
      phoneNumber: nextPhone(),
      password: "Strong@1234",
      role: "POS_STAFF",
      storeLocation: String(fixture.storeA._id),
      branchIds: [String(fixture.storeA._id)],
      enableGranularPermissions: true,
      permissions: [
        {
          key: "analytics.read.personal",
          scopeType: "SELF",
          scopeId: "new-user-preview",
        },
      ],
    });

  assert.equal(response.status, 201);
  const createdUserId = response.body?.data?.user?._id;
  assert.ok(createdUserId);

  const grants = await UserPermissionGrant.find({
    userId: createdUserId,
    status: "ACTIVE",
  })
    .lean();

  const selfGrant = grants.find((row) => String(row.permissionKey) === "analytics.read.personal");

  assert.ok(selfGrant, "Expected analytics.read.personal grant");
  assert.equal(String(selfGrant.scopeRef || ""), String(createdUserId));
});
