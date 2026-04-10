#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_CONNECTIONSTRING;
if (!MONGO_URI) {
  console.error("MONGODB_CONNECTIONSTRING not set");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("Connected to MongoDB");

const UserSchema = new mongoose.Schema({}, { strict: false, collection: "users" });
const UserRoleAssignmentSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "userroleassignments" },
);
const RoleSchema = new mongoose.Schema({}, { strict: false, collection: "roles" });
const BackupSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "migration_backup_users_authz" },
);

const User = mongoose.model("AuthzMigrationUser", UserSchema);
const UserRoleAssignment = mongoose.model(
  "AuthzMigrationUserRoleAssignment",
  UserRoleAssignmentSchema,
);
const Role = mongoose.model("AuthzMigrationRole", RoleSchema);
const Backup = mongoose.model("AuthzMigrationBackup", BackupSchema);

const normalizeText = (value) => String(value || "").trim();
const normalizeRoleKey = (value) => normalizeText(value).toUpperCase();
const toUniqueStrings = (items = []) =>
  Array.from(new Set(items.map((item) => normalizeText(item)).filter(Boolean)));

const LEGACY_ROLE_TO_CANONICAL = Object.freeze({
  ADMIN: "BRANCH_ADMIN",
  BRANCH_ADMIN: "BRANCH_ADMIN",
  WAREHOUSE_MANAGER: "WAREHOUSE_MANAGER",
  WAREHOUSE_STAFF: "WAREHOUSE_STAFF",
  PRODUCT_MANAGER: "PRODUCT_MANAGER",
  ORDER_MANAGER: "ORDER_MANAGER",
  POS_STAFF: "POS_STAFF",
  CASHIER: "CASHIER",
  SALES_STAFF: "SALES_STAFF",
  GLOBAL_ADMIN: "GLOBAL_ADMIN",
  SHIPPER: "SHIPPER",
  CUSTOMER: "CUSTOMER",
});

const BRANCH_ROLES = new Set([
  "BRANCH_ADMIN",
  "WAREHOUSE_MANAGER",
  "WAREHOUSE_STAFF",
  "PRODUCT_MANAGER",
  "ORDER_MANAGER",
  "POS_STAFF",
  "CASHIER",
  "SALES_STAFF",
]);

const assignmentKey = ({ roleKey, scopeType, scopeRef }) =>
  `${normalizeRoleKey(roleKey)}|${normalizeText(scopeType).toUpperCase()}|${normalizeText(scopeRef)}`;

const buildRoleMap = async () => {
  const roles = await Role.find({ isActive: { $ne: false } }).lean();
  return new Map(roles.map((role) => [normalizeRoleKey(role.key), role]));
};

const buildDesiredAssignments = (userDoc) => {
  const desired = [];
  const legacyRole = normalizeRoleKey(userDoc?.role);
  const canonicalLegacyRole = LEGACY_ROLE_TO_CANONICAL[legacyRole] || legacyRole;

  const pushAssignment = ({ roleKey, scopeType, scopeRef = "", metadata = {} }) => {
    if (!roleKey || !scopeType) return;
    desired.push({
      roleKey: normalizeRoleKey(roleKey),
      scopeType: normalizeText(scopeType).toUpperCase(),
      scopeRef: normalizeText(scopeRef),
      metadata,
    });
  };

  for (const roleKey of Array.isArray(userDoc?.systemRoles) ? userDoc.systemRoles : []) {
    if (normalizeRoleKey(roleKey) === "GLOBAL_ADMIN") {
      pushAssignment({ roleKey: "GLOBAL_ADMIN", scopeType: "GLOBAL" });
    }
  }

  for (const roleKey of Array.isArray(userDoc?.taskRoles) ? userDoc.taskRoles : []) {
    if (normalizeRoleKey(roleKey) === "SHIPPER") {
      pushAssignment({ roleKey: "SHIPPER", scopeType: "TASK" });
    }
  }

  const branchAssignments = Array.isArray(userDoc?.branchAssignments)
    ? userDoc.branchAssignments
    : [];
  for (const branchAssignment of branchAssignments) {
    const status = normalizeText(branchAssignment?.status || "ACTIVE").toUpperCase();
    if (status !== "ACTIVE") continue;

    const storeId = normalizeText(branchAssignment?.storeId);
    if (!storeId) continue;

    const branchRoles = toUniqueStrings(
      Array.isArray(branchAssignment?.roles) && branchAssignment.roles.length > 0
        ? branchAssignment.roles.map((roleKey) => LEGACY_ROLE_TO_CANONICAL[normalizeRoleKey(roleKey)] || normalizeRoleKey(roleKey))
        : canonicalLegacyRole && BRANCH_ROLES.has(canonicalLegacyRole)
          ? [canonicalLegacyRole]
          : [],
    );

    for (const roleKey of branchRoles) {
      pushAssignment({
        roleKey,
        scopeType: "BRANCH",
        scopeRef: storeId,
        metadata: {
          isPrimary: Boolean(branchAssignment?.isPrimary),
          reason: "migration_from_branch_assignments",
        },
      });
    }
  }

  if (desired.length === 0 && canonicalLegacyRole === "GLOBAL_ADMIN") {
    pushAssignment({
      roleKey: "GLOBAL_ADMIN",
      scopeType: "GLOBAL",
      metadata: { reason: "migration_from_legacy_role" },
    });
  }

  if (desired.length === 0 && canonicalLegacyRole === "SHIPPER") {
    pushAssignment({
      roleKey: "SHIPPER",
      scopeType: "TASK",
      metadata: { reason: "migration_from_legacy_role" },
    });
  }

  if (desired.length === 0 && canonicalLegacyRole === "CUSTOMER") {
    pushAssignment({
      roleKey: "CUSTOMER",
      scopeType: "SELF",
      scopeRef: normalizeText(userDoc?._id),
      metadata: { reason: "migration_from_legacy_role" },
    });
  }

  if (
    desired.length === 0 &&
    canonicalLegacyRole &&
    BRANCH_ROLES.has(canonicalLegacyRole) &&
    normalizeText(userDoc?.storeLocation)
  ) {
    pushAssignment({
      roleKey: canonicalLegacyRole,
      scopeType: "BRANCH",
      scopeRef: normalizeText(userDoc.storeLocation),
      metadata: { reason: "migration_from_store_location" },
    });
  }

  const deduped = new Map();
  for (const assignment of desired) {
    deduped.set(assignmentKey(assignment), assignment);
  }

  return Array.from(deduped.values());
};

console.log("Step 1: backing up users");
const allUsers = await User.find({}).lean();
await Backup.deleteMany({});
if (allUsers.length > 0) {
  await Backup.insertMany(
    allUsers.map((user) => ({
      ...user,
      _migrationBackedUpAt: new Date(),
    })),
    { ordered: false },
  );
}
console.log(`Backed up ${allUsers.length} users to migration_backup_users_authz`);

console.log("Step 2: processing users");
const roleMap = await buildRoleMap();
let processed = 0;
let skipped = 0;
let errors = 0;
let createdAssignments = 0;
let resetUsers = 0;

for (const userDoc of allUsers) {
  try {
    const userId = userDoc._id;
    const desiredAssignments = buildDesiredAssignments(userDoc);
    const existingAssignments = await UserRoleAssignment.find({
      userId,
      status: "ACTIVE",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).lean();

    const existingKeys = new Set(
      existingAssignments.map((assignment) =>
        assignmentKey({
          roleKey: assignment.roleKey,
          scopeType: assignment.scopeType,
          scopeRef: assignment.scopeRef,
        }),
      ),
    );

    const docsToCreate = [];
    for (const assignment of desiredAssignments) {
      const key = assignmentKey(assignment);
      if (existingKeys.has(key)) continue;

      const roleDoc = roleMap.get(assignment.roleKey);
      if (!roleDoc?._id) {
        console.warn(
          `Skipping assignment for user ${userId}: role ${assignment.roleKey} not found`,
        );
        continue;
      }

      docsToCreate.push({
        userId,
        roleId: roleDoc._id,
        roleKey: assignment.roleKey,
        scopeType: assignment.scopeType,
        scopeRef: assignment.scopeType === "SELF" && !assignment.scopeRef
          ? normalizeText(userId)
          : assignment.scopeRef,
        status: "ACTIVE",
        assignedAt: new Date(),
        metadata: assignment.metadata || {},
      });
    }

    if (docsToCreate.length > 0) {
      await UserRoleAssignment.insertMany(docsToCreate, { ordered: false });
      createdAssignments += docsToCreate.length;
    }

    const currentVersion = Number(userDoc.permissionsVersion || 1);
    const needsLegacyReset =
      String(userDoc.permissionMode || "ROLE_FALLBACK").toUpperCase() !== "ROLE_FALLBACK" ||
      (Array.isArray(userDoc.permissions) && userDoc.permissions.length > 0);
    const shouldBumpVersion = needsLegacyReset || docsToCreate.length > 0;

    if (shouldBumpVersion) {
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            permissionMode: "ROLE_FALLBACK",
            permissions: [],
            permissionsVersion: currentVersion + 1,
          },
        },
      );
    }

    if (needsLegacyReset) {
      resetUsers += 1;
    } else if (docsToCreate.length === 0) {
      skipped += 1;
    }

    processed += 1;
  } catch (error) {
    errors += 1;
    console.error(`Error processing user ${userDoc?._id}: ${error.message}`);
  }
}

console.log("Step 3: verification");
const usersWithExplicitMode = await User.countDocuments({ permissionMode: "EXPLICIT" });
const usersWithDirectPermissions = await User.countDocuments({
  "permissions.0": { $exists: true },
});
const totalAssignments = await UserRoleAssignment.countDocuments({
  status: "ACTIVE",
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

console.log(`Users still with permissionMode=EXPLICIT: ${usersWithExplicitMode}`);
console.log(`Users still with direct permissions[]: ${usersWithDirectPermissions}`);
console.log(`Total active UserRoleAssignments: ${totalAssignments}`);

console.log("Summary");
console.log(`Total users: ${allUsers.length}`);
console.log(`Processed: ${processed}`);
console.log(`Skipped (already clean): ${skipped}`);
console.log(`Users reset to legacy-safe state: ${resetUsers}`);
console.log(`Assignments created: ${createdAssignments}`);
console.log(`Errors: ${errors}`);

await mongoose.disconnect();

if (errors > 0) {
  process.exit(1);
}

process.exit(0);
