import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

import { connectDB } from "../config/db.js";
import User from "../modules/auth/User.js";
import Role from "../modules/auth/Role.js";
import Permission from "../modules/auth/Permission.js";
import UserRoleAssignment from "../modules/auth/UserRoleAssignment.js";
import UserPermissionGrant from "../modules/auth/UserPermissionGrant.js";
import { ensurePermissionCatalogSeeded } from "../authz/permissionCatalog.js";
import { ensurePermissionTemplatesSeeded } from "../authz/permissionTemplateService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const IMPACTED_ROLE_KEYS = new Set(["POS_STAFF", "CASHIER"]);
const VALID_PERMISSION_MODES = new Set(["ROLE_FALLBACK", "EXPLICIT", "HYBRID"]);
const LEGACY_ROLE_KEYS = new Set([
  "GLOBAL_ADMIN",
  "CUSTOMER",
  "SALES_STAFF",
  "WAREHOUSE_MANAGER",
  "WAREHOUSE_STAFF",
  "PRODUCT_MANAGER",
  "ORDER_MANAGER",
  "SHIPPER",
  "POS_STAFF",
  "CASHIER",
  "ADMIN",
  "BRANCH_ADMIN",
]);

const normalizeText = (value) => String(value || "").trim();
const normalizeRoleKey = (value) => normalizeText(value).toUpperCase();
const normalizePermissionKey = (value) => normalizeText(value).toLowerCase();
const normalizePermissionMode = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  return VALID_PERMISSION_MODES.has(normalized) ? normalized : "ROLE_FALLBACK";
};
const uniqueStrings = (items = [], normalizeFn = normalizeText) =>
  Array.from(new Set(items.map((item) => normalizeFn(item)).filter(Boolean)));

const createBackupDir = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(process.cwd(), "backups", "authz-explicit-hardening", timestamp);
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
};

const writeJson = (targetPath, value) => {
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2), "utf8");
};

const backupCollections = async (backupDir) => {
  const [users, roles, permissions, roleAssignments, permissionGrants] = await Promise.all([
    User.find({}).lean(),
    Role.find({}).lean(),
    Permission.find({}).lean(),
    UserRoleAssignment.find({}).lean(),
    UserPermissionGrant.find({}).lean(),
  ]);

  writeJson(path.join(backupDir, "users.authz.json"), users);
  writeJson(path.join(backupDir, "roles.json"), roles);
  writeJson(path.join(backupDir, "permissions.json"), permissions);
  writeJson(path.join(backupDir, "user-role-assignments.json"), roleAssignments);
  writeJson(path.join(backupDir, "user-permission-grants.json"), permissionGrants);
};

const collectRoleKeysFromUser = (user = {}, activeAssignments = []) => {
  if (activeAssignments.length > 0) {
    return uniqueStrings(activeAssignments.map((assignment) => assignment.roleKey), normalizeRoleKey);
  }

  const branchRoles = Array.isArray(user.branchAssignments)
    ? user.branchAssignments.flatMap((assignment) => assignment?.roles || [])
    : [];

  return uniqueStrings(
    [
      user.role,
      ...(user.systemRoles || []),
      ...(user.taskRoles || []),
      ...branchRoles,
    ].filter((roleKey) => LEGACY_ROLE_KEYS.has(normalizeRoleKey(roleKey))),
    normalizeRoleKey,
  );
};

const collectActiveGrantKeys = (activeGrants = []) =>
  uniqueStrings(activeGrants.map((grant) => grant.permissionKey), normalizePermissionKey);

const arraysEqual = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const run = async () => {
  const backupDir = createBackupDir();
  console.log(`[authz-hardening] backupDir=${backupDir}`);

  await connectDB();
  await backupCollections(backupDir);

  const seededPermissions = await ensurePermissionCatalogSeeded();
  const seededTemplates = await ensurePermissionTemplatesSeeded();

  const [users, activeAssignments, activeGrants, usersMissingMode] = await Promise.all([
    User.find({}),
    UserRoleAssignment.find({ status: "ACTIVE" })
      .select("userId roleKey scopeType scopeRef")
      .lean(),
    UserPermissionGrant.find({
      status: "ACTIVE",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .select("userId permissionKey scopeType scopeRef")
      .lean(),
    User.find({
      $or: [{ permissionMode: { $exists: false } }, { permissionMode: null }],
    })
      .select("_id")
      .lean(),
  ]);

  const usersMissingModeSet = new Set(
    usersMissingMode.map((row) => normalizeText(row._id)),
  );

  const assignmentsByUserId = new Map();
  for (const assignment of activeAssignments) {
    const userId = normalizeText(assignment.userId);
    if (!assignmentsByUserId.has(userId)) {
      assignmentsByUserId.set(userId, []);
    }
    assignmentsByUserId.get(userId).push(assignment);
  }

  const grantsByUserId = new Map();
  for (const grant of activeGrants) {
    const userId = normalizeText(grant.userId);
    if (!grantsByUserId.has(userId)) {
      grantsByUserId.set(userId, []);
    }
    grantsByUserId.get(userId).push(grant);
  }

  const summary = {
    backupDir,
    seededPermissions,
    seededTemplates,
    totalUsers: users.length,
    updatedUsers: 0,
    permissionModeChanged: 0,
    permissionModeNormalized: 0,
    readModelRefreshed: 0,
    rotatedTokens: 0,
    forcedRoleFallback: 0,
    forcedExplicit: 0,
    forcedRoleTemplateRefresh: 0,
    usersChanged: [],
  };

  for (const user of users) {
    const userId = normalizeText(user._id);
    const userAssignments = assignmentsByUserId.get(userId) || [];
    const userGrants = grantsByUserId.get(userId) || [];
    const directGrantKeys = collectActiveGrantKeys(userGrants).sort();
    const existingDirectKeys = uniqueStrings(user.permissions || [], normalizePermissionKey).sort();
    const storedMode = usersMissingModeSet.has(userId)
      ? ""
      : normalizeText(user.permissionMode).toUpperCase();
    const storedModeValid = VALID_PERMISSION_MODES.has(storedMode);
    const currentMode = normalizePermissionMode(user.permissionMode);
    const effectiveRoleKeys = collectRoleKeysFromUser(user, userAssignments);
    const hasRoleBackedAccess = effectiveRoleKeys.length > 0;
    const hasImpactedRole = effectiveRoleKeys.some((roleKey) => IMPACTED_ROLE_KEYS.has(roleKey));

    let nextMode = currentMode;
    if (currentMode === "EXPLICIT" && directGrantKeys.length === 0 && hasRoleBackedAccess) {
      nextMode = "ROLE_FALLBACK";
      summary.forcedRoleFallback += 1;
    } else if (currentMode === "HYBRID" && directGrantKeys.length === 0) {
      nextMode = "ROLE_FALLBACK";
      summary.forcedRoleFallback += 1;
    } else if (currentMode === "ROLE_FALLBACK" && directGrantKeys.length > 0) {
      nextMode = "EXPLICIT";
      summary.forcedExplicit += 1;
    }

    const permissionModeChanged = nextMode !== storedMode;
    const semanticModeChanged = nextMode !== currentMode;
    const readModelChanged = !arraysEqual(existingDirectKeys, directGrantKeys);
    const shouldRotateToken =
      semanticModeChanged ||
      readModelChanged ||
      hasImpactedRole ||
      currentMode === "EXPLICIT" ||
      currentMode === "HYBRID";

    if (!permissionModeChanged && !readModelChanged && !shouldRotateToken) {
      continue;
    }

    if (permissionModeChanged) {
      summary.permissionModeChanged += 1;
      if (!storedModeValid) {
        summary.permissionModeNormalized += 1;
      }
    }
    if (readModelChanged) {
      summary.readModelRefreshed += 1;
    }
    if (hasImpactedRole) {
      summary.forcedRoleTemplateRefresh += 1;
    }
    if (shouldRotateToken) {
      summary.rotatedTokens += 1;
    }

    const setPayload = {
      permissionMode: nextMode,
      permissions: directGrantKeys,
      authzVersion: Math.max(2, Number(user.authzVersion || 2)),
    };
    const incPayload = {};
    if (shouldRotateToken) {
      incPayload.permissionsVersion = 1;
      incPayload.authorizationVersion = 1;
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: setPayload,
        ...(Object.keys(incPayload).length > 0 ? { $inc: incPayload } : {}),
      },
    );

    summary.updatedUsers += 1;
    summary.usersChanged.push({
      userId,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      roleKeys: effectiveRoleKeys,
      fromMode: storedMode || null,
      toMode: nextMode,
      directGrantKeys,
      rotatedToken: shouldRotateToken,
    });
  }

  writeJson(path.join(backupDir, "migration-summary.json"), summary);
  console.log("[authz-hardening] summary");
  console.log(JSON.stringify(summary, null, 2));
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[authz-hardening] failed", error);
    await mongoose.disconnect();
    process.exit(1);
  });
