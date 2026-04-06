import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { ensurePermissionCatalogSeeded } from "../authz/permissionCatalog.js";
import { ensurePermissionTemplatesSeeded } from "../authz/permissionTemplateService.js";
import { syncUserRoleAssignments } from "../authz/roleAssignmentService.js";
import { applyUserPermissionAssignments } from "../authz/userPermissionService.js";
import { getUserPermissions } from "../authz/authorizationService.js";
import User from "../modules/auth/User.js";
import Store from "../modules/store/Store.js";

let mongoServer;
let phoneSeed = 380000000;

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

before(
  async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "multi-role-authorization-integration-test",
    });
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

test("getUserPermissions merges multiple role permissions with direct grants and dedupes", async () => {
  const branch = await createStore({ code: "BRA", name: "Branch A" });
  const user = await User.create({
    role: "WAREHOUSE_STAFF",
    fullName: "Hybrid Staff",
    phoneNumber: nextPhone(),
    password: "Strong@1234",
    status: "ACTIVE",
    storeLocation: String(branch._id),
  });

  await syncUserRoleAssignments({
    user,
    assignments: [
      {
        roleKey: "SALES_STAFF",
        scopeType: "BRANCH",
        scopeRef: String(branch._id),
      },
      {
        roleKey: "WAREHOUSE_STAFF",
        scopeType: "BRANCH",
        scopeRef: String(branch._id),
      },
    ],
    primaryBranchId: String(branch._id),
    reason: "test_multi_role_seed",
  });

  await applyUserPermissionAssignments({
    targetUserId: user._id,
    assignments: [
      {
        key: "users.manage.branch",
        scopeType: "BRANCH",
        scopeId: String(branch._id),
      },
    ],
    reason: "test_direct_grant_seed",
  });

  const effective = await getUserPermissions(user._id, {
    activeBranchId: String(branch._id),
  });

  assert.deepEqual(
    [...effective.permissions].sort(),
    Array.from(new Set(effective.permissions)).sort(),
  );
  assert.ok(effective.roleKeys.includes("SALES_STAFF"));
  assert.ok(effective.roleKeys.includes("WAREHOUSE_STAFF"));
  assert.ok(effective.permissions.includes("orders.read"));
  assert.ok(effective.permissions.includes("orders.write"));
  assert.ok(effective.permissions.includes("inventory.read"));
  assert.ok(effective.permissions.includes("inventory.write"));
  assert.ok(effective.permissions.includes("warehouse.read"));
  assert.ok(effective.permissions.includes("users.manage.branch"));
});

test("getUserPermissions honors direct grants when the assigned role does not include the permission", async () => {
  const branch = await createStore({ code: "BRB", name: "Branch B" });
  const user = await User.create({
    role: "WAREHOUSE_STAFF",
    fullName: "Direct Grant User",
    phoneNumber: nextPhone(),
    password: "Strong@1234",
    status: "ACTIVE",
    storeLocation: String(branch._id),
  });

  await syncUserRoleAssignments({
    user,
    assignments: [
      {
        roleKey: "WAREHOUSE_STAFF",
        scopeType: "BRANCH",
        scopeRef: String(branch._id),
      },
    ],
    primaryBranchId: String(branch._id),
    reason: "test_direct_grant_override_seed",
  });

  const beforeGrant = await getUserPermissions(user._id, {
    activeBranchId: String(branch._id),
  });

  assert.equal(beforeGrant.permissions.includes("users.manage.branch"), false);

  await applyUserPermissionAssignments({
    targetUserId: user._id,
    assignments: [
      {
        key: "users.manage.branch",
        scopeType: "BRANCH",
        scopeId: String(branch._id),
      },
    ],
    reason: "test_direct_grant_override_apply",
  });

  const afterGrant = await getUserPermissions(user._id, {
    activeBranchId: String(branch._id),
  });

  assert.ok(afterGrant.permissions.includes("users.manage.branch"));
  assert.ok(afterGrant.roleKeys.includes("WAREHOUSE_STAFF"));
});

test("getUserPermissions resolves SELF-scoped customer role assignments without legacy role fallback", async () => {
  const user = await User.create({
    role: "CUSTOMER",
    fullName: "Customer Role User",
    phoneNumber: nextPhone(),
    password: "Strong@1234",
    status: "ACTIVE",
  });

  await syncUserRoleAssignments({
    user,
    assignments: [
      {
        roleKey: "CUSTOMER",
        scopeType: "SELF",
        scopeRef: String(user._id),
      },
    ],
    reason: "test_customer_self_role_seed",
  });

  const effective = await getUserPermissions(user._id);

  assert.ok(effective.roleKeys.includes("CUSTOMER"));
  assert.ok(effective.permissions.includes("cart.manage.self"));
  assert.ok(effective.permissions.includes("order.view.self"));
  assert.equal(effective.permissions.includes("orders.read"), false);
});
