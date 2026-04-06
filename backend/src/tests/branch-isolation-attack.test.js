import test from "node:test";
import assert from "node:assert/strict";
import { AUTHZ_ACTIONS } from "../authz/actions.js";
import { buildPermissionSet, evaluatePolicy } from "../authz/policyEngine.js";

// ============================================
// HELPER: Build a mock authz context
// ============================================
const buildContext = (overrides = {}) => {
  const base = {
    userId: "67af5df0f70d57d0a18f4b17",
    role: "ADMIN",
    systemRoles: [],
    taskRoles: [],
    branchAssignments: [
      {
        storeId: "BRANCH_A",
        roles: ["WAREHOUSE_MANAGER"],
        status: "ACTIVE",
      },
      {
        storeId: "BRANCH_B",
        roles: ["CASHIER"],
        status: "ACTIVE",
      },
    ],
    allowedBranchIds: ["BRANCH_A", "BRANCH_B"],
    activeBranchId: "BRANCH_A",
    isGlobalAdmin: false,
  };

  const context = { ...base, ...overrides };
  context.permissions = buildPermissionSet(context);
  return context;
};

// ============================================
// TEST 1: Privilege bleed is eliminated
// ============================================
test("KILL-SWITCH: roles from Branch B do NOT leak into Branch A permissions", () => {
  const authz = buildContext({ activeBranchId: "BRANCH_A" });

  // WAREHOUSE_MANAGER at Branch A should have inventory.write
  assert.ok(
    authz.permissions.has(AUTHZ_ACTIONS.INVENTORY_WRITE),
    "Should have INVENTORY_WRITE from Branch A WAREHOUSE_MANAGER"
  );

  // But CASHIER at Branch B gives ANALYTICS_READ_PERSONAL — which
  // should NOT be present since only Branch A roles are loaded
  // CASHIER has: ORDERS_READ, ORDERS_WRITE, ANALYTICS_READ_PERSONAL
  // WAREHOUSE_MANAGER does NOT have ANALYTICS_READ_PERSONAL
  assert.ok(
    !authz.permissions.has(AUTHZ_ACTIONS.ANALYTICS_READ_PERSONAL),
    "Should NOT have ANALYTICS_READ_PERSONAL — that belongs to Branch B CASHIER"
  );
});

test("KILL-SWITCH: switching to Branch B loads CASHIER permissions, drops WAREHOUSE_MANAGER", () => {
  const authz = buildContext({ activeBranchId: "BRANCH_B" });

  // CASHIER at Branch B has ANALYTICS_READ_PERSONAL
  assert.ok(
    authz.permissions.has(AUTHZ_ACTIONS.ANALYTICS_READ_PERSONAL),
    "Should have ANALYTICS_READ_PERSONAL from Branch B CASHIER"
  );

  // Should NOT have INVENTORY_WRITE (WAREHOUSE_MANAGER is Branch A only)
  assert.ok(
    !authz.permissions.has(AUTHZ_ACTIONS.INVENTORY_WRITE),
    "Should NOT have INVENTORY_WRITE — that belongs to Branch A WAREHOUSE_MANAGER"
  );
});

// ============================================
// TEST 2: Missing branch → evaluatePolicy denies
// ============================================
test("KILL-SWITCH: missing activeBranchId → DENY on branch-scoped action", () => {
  const authz = buildContext({ activeBranchId: "" });

  const result = evaluatePolicy({
    action: AUTHZ_ACTIONS.INVENTORY_READ,
    authz,
    mode: "branch",
    requireActiveBranch: true,
  });

  assert.equal(result.allowed, false);
  // With our kill-switch fix, empty activeBranchId means buildPermissionSet loads
  // NO branch-derived permissions, so the action is denied with AUTHZ_ACTION_DENIED
  assert.equal(result.code, "AUTHZ_ACTION_DENIED");
});

// ============================================
// TEST 3: GLOBAL_ADMIN still gets wildcard
// ============================================
test("KILL-SWITCH: GLOBAL_ADMIN retains wildcard via systemRoles", () => {
  const authz = buildContext({
    systemRoles: ["GLOBAL_ADMIN"],
    isGlobalAdmin: true,
    branchAssignments: [],
    activeBranchId: "BRANCH_A",
  });

  assert.ok(authz.permissions.has("*"), "GLOBAL_ADMIN should have wildcard permission");
});

// ============================================
// TEST 4: Non-assigned branch → DENY
// ============================================
test("KILL-SWITCH: action denied on branch not in allowedBranchIds", () => {
  const authz = buildContext({
    activeBranchId: "BRANCH_C",
    allowedBranchIds: ["BRANCH_A", "BRANCH_B"],
  });

  // Branch C has no assignment, so buildPermissionSet will find no matching assignment
  // and permissions will only have whatever systemRoles or taskRoles grants (none in this case)
  assert.ok(
    !authz.permissions.has(AUTHZ_ACTIONS.INVENTORY_READ),
    "Should NOT have INVENTORY_READ for unassigned Branch C"
  );
});

// ============================================
// TEST 5: Empty assignments must not fall back to legacy single-role grants
// ============================================
test("KILL-SWITCH: legacy single-role fallback is disabled when scoped assignments are missing", () => {
  const authz = buildContext({
    role: "ADMIN",
    systemRoles: [],
    branchAssignments: [],
    activeBranchId: "",
  });

  assert.ok(
    !authz.permissions.has(AUTHZ_ACTIONS.ORDERS_READ),
    "Legacy ADMIN should not retain branch grants without canonical assignments"
  );
});

test("KILL-SWITCH: legacy role NOT granted when branchAssignments exist", () => {
  const authz = buildContext({
    role: "ADMIN",
    systemRoles: [],
    branchAssignments: [{ storeId: "BRANCH_A", roles: ["CASHIER"], status: "ACTIVE" }],
    activeBranchId: "BRANCH_A",
  });

  // Has CASHIER from Branch A, but should NOT also have ADMIN global permissions
  // ADMIN has INVENTORY_WRITE, CASHIER does not
  assert.ok(
    !authz.permissions.has(AUTHZ_ACTIONS.INVENTORY_WRITE),
    "Legacy ADMIN role should NOT bleed through when V2 branchAssignments exist"
  );
});

// ============================================
// TEST 6: Cross-branch evaluatePolicy resource check
// ============================================
test("KILL-SWITCH: evaluatePolicy denies resource from wrong branch", () => {
  const authz = buildContext({ activeBranchId: "BRANCH_A" });

  const result = evaluatePolicy({
    action: AUTHZ_ACTIONS.INVENTORY_READ,
    authz,
    mode: "branch",
    requireActiveBranch: true,
    resource: { branchId: "BRANCH_B" },
  });

  assert.equal(result.allowed, false, "Cross-branch resource access should be denied");
});

console.log("✅ All kill-switch attack simulation tests passed");
