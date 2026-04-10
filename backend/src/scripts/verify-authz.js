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

const User = mongoose.model("AuthzVerifyUser", UserSchema);
const UserRoleAssignment = mongoose.model(
  "AuthzVerifyUserRoleAssignment",
  UserRoleAssignmentSchema,
);
const Role = mongoose.model("AuthzVerifyRole", RoleSchema);

const normalizeText = (value) => String(value || "").trim();
const normalizeRoleKey = (value) => normalizeText(value).toUpperCase();

const loadRoleMap = async () => {
  const roles = await Role.find({ isActive: { $ne: false } }).lean();
  return new Map(roles.map((role) => [normalizeRoleKey(role.key), role]));
};

const roleMap = await loadRoleMap();

console.log("Test 1: POS staff should not have leaked manager permissions");
const posUsers = await User.find({
  $or: [
    { role: "POS_STAFF" },
    { branchAssignments: { $elemMatch: { roles: "POS_STAFF" } } },
  ],
})
  .limit(3)
  .lean();

for (const user of posUsers) {
  const assignments = await UserRoleAssignment.find({
    userId: user._id,
    status: "ACTIVE",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).lean();

  const permissions = new Set();
  for (const assignment of assignments) {
    const role = roleMap.get(normalizeRoleKey(assignment.roleKey));
    for (const permission of Array.isArray(role?.permissions) ? role.permissions : []) {
      permissions.add(normalizeText(permission).toLowerCase());
    }
  }

  const sensitivePermissions = [
    "orders.write",
    "order.status.manage",
    "inventory.write",
    "users.manage.branch",
  ];
  const leaked = sensitivePermissions.filter((permission) => permissions.has(permission));

  if (leaked.length > 0) {
    console.log(`FAIL user ${user._id} leaked permissions: ${leaked.join(", ")}`);
  } else {
    console.log(`PASS user ${user._id} permissions look clean`);
  }
}

console.log("Test 2: no users should still be in EXPLICIT mode");
const explicitUsers = await User.countDocuments({ permissionMode: "EXPLICIT" });
console.log(
  explicitUsers > 0
    ? `FAIL ${explicitUsers} users still have permissionMode=EXPLICIT`
    : "PASS no users with permissionMode=EXPLICIT",
);

console.log("Test 3: staff users should largely have canonical assignments");
const totalStaffUsers = await User.countDocuments({
  role: { $nin: ["USER", "CUSTOMER", null, ""] },
});
const usersWithAssignments = await UserRoleAssignment.distinct("userId", {
  status: "ACTIVE",
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});
console.log(`Staff users: ${totalStaffUsers}`);
console.log(`Users with active assignments: ${usersWithAssignments.length}`);
if (totalStaffUsers > 0 && usersWithAssignments.length < totalStaffUsers * 0.8) {
  console.log("WARN fewer than 80% of staff have active canonical assignments");
} else {
  console.log("PASS canonical assignment coverage looks healthy");
}

console.log("Test 4: POS_STAFF role permissions should stay constrained");
const posRole = roleMap.get("POS_STAFF");
if (!posRole) {
  console.log("FAIL POS_STAFF role not found");
} else {
  const normalizedPermissions = (posRole.permissions || []).map((permission) =>
    normalizeText(permission).toLowerCase(),
  );
  console.log(`POS_STAFF permissions: ${normalizedPermissions.join(", ")}`);
  if (
    normalizedPermissions.includes("orders.write") ||
    normalizedPermissions.includes("order.status.manage")
  ) {
    console.log("FAIL POS_STAFF role contains over-privileged permissions");
  } else {
    console.log("PASS POS_STAFF role permissions look correct");
  }
}

await mongoose.disconnect();
console.log("Verification complete");
process.exit(0);
