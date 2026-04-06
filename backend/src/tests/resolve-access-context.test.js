import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccessContext } from "../middleware/authz/resolveAccessContext.js";

const createMockRes = () => {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
  return res;
};

const buildStaffUser = (overrides = {}) => ({
  _id: "staff-user-1",
  role: "POS_STAFF",
  authzState: "ACTIVE",
  systemRoles: [],
  taskRoles: [],
  branchAssignments: [
    {
      storeId: "BRANCH_A",
      roles: ["POS_STAFF"],
      status: "ACTIVE",
      isPrimary: true,
    },
  ],
  ...overrides,
});

test("resolveAccessContext binds staff to fixed branch from assignment", async () => {
  const req = {
    user: buildStaffUser(),
    headers: {},
  };
  const res = createMockRes();

  let nextCalled = false;
  await resolveAccessContext(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.authz.activeBranchId, "BRANCH_A");
});

test("resolveAccessContext denies manual branch switch via header for staff", async () => {
  const req = {
    user: buildStaffUser(),
    headers: {
      "x-active-branch-id": "BRANCH_B",
    },
  };
  const res = createMockRes();

  let nextCalled = false;
  await resolveAccessContext(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload?.code, "AUTHZ_BRANCH_FORBIDDEN");
});

test("resolveAccessContext denies staff with no branch assignment", async () => {
  const req = {
    user: buildStaffUser({
      branchAssignments: [
        {
          storeId: "BRANCH_A",
          roles: ["POS_STAFF"],
          status: "SUSPENDED",
          isPrimary: true,
        },
      ],
    }),
    headers: {},
  };
  const res = createMockRes();

  await resolveAccessContext(req, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload?.code, "AUTHZ_NO_BRANCH_ASSIGNED");
});

test("resolveAccessContext keeps simulation path for global admin", async () => {
  const req = {
    user: {
      _id: "global-admin-1",
      role: "GLOBAL_ADMIN",
      authzState: "ACTIVE",
      systemRoles: ["GLOBAL_ADMIN"],
      taskRoles: [],
      branchAssignments: [],
    },
    headers: {
      "x-simulate-branch-id": "BRANCH_SIM",
    },
  };
  const res = createMockRes();

  let nextCalled = false;
  await resolveAccessContext(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.authz.contextMode, "SIMULATED");
  assert.equal(req.authz.activeBranchId, "BRANCH_SIM");
});
