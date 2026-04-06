import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import User from "../modules/auth/User.js";
import Permission from "../modules/auth/Permission.js";
import UserPermission from "../modules/auth/UserPermission.js";
import UserPermissionGrant from "../modules/auth/UserPermissionGrant.js";
import { ensurePermissionCatalogSeeded } from "../authz/permissionCatalog.js";
import { ensurePermissionTemplatesSeeded } from "../authz/permissionTemplateService.js";
import {
  buildLegacyRoleAssignmentsFromUser,
  syncUserRoleAssignments,
} from "../authz/roleAssignmentService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const normalizeText = (value) => String(value || "").trim();
const normalizePermissionKey = (value) => normalizeText(value).toLowerCase();
const normalizeScopeType = (value) => normalizeText(value).toUpperCase();
const toUniqueStrings = (items = []) =>
  Array.from(new Set(items.map((item) => normalizeText(item)).filter(Boolean)));

const buildGrantKey = ({ key, scopeType, scopeRef }) =>
  `${normalizePermissionKey(key)}|${normalizeScopeType(scopeType)}|${normalizeText(scopeRef)}`;

const resolveReadModelAssignment = ({ user, catalogEntry }) => {
  const scopeType = normalizeScopeType(catalogEntry?.defaultScope || catalogEntry?.scopeType);
  if (scopeType === "GLOBAL") {
    return { scopeType, scopeRef: "" };
  }
  if (scopeType === "BRANCH") {
    const scopeRef = normalizeText(user?.storeLocation);
    return scopeRef ? { scopeType, scopeRef } : null;
  }
  if (scopeType === "SELF" || scopeType === "TASK") {
    const scopeRef = normalizeText(user?._id);
    return scopeRef ? { scopeType, scopeRef } : null;
  }
  return null;
};

const buildLegacyDirectGrantAssignments = async ({
  user,
  permissionById,
  permissionByKey,
}) => {
  const legacyRows = await UserPermission.find({
    userId: user._id,
    status: "ACTIVE",
  })
    .select("permissionId scopeType scopeId metadata")
    .lean();

  const assignments = [];

  for (const row of legacyRows) {
    const permission = permissionById.get(normalizeText(row.permissionId));
    if (!permission) continue;

    const scopeType = normalizeScopeType(row.scopeType || permission.scopeType);
    assignments.push({
      key: permission.key,
      scopeType,
      scopeRef: scopeType === "GLOBAL" ? "" : normalizeText(row.scopeId),
      conditions: Array.isArray(row.metadata?.conditions) ? row.metadata.conditions : [],
    });
  }

  for (const key of Array.isArray(user?.permissions) ? user.permissions : []) {
    const permission = permissionByKey.get(normalizePermissionKey(key));
    if (!permission) continue;
    const resolvedScope = resolveReadModelAssignment({ user, catalogEntry: permission });
    if (!resolvedScope) continue;
    assignments.push({
      key: permission.key,
      scopeType: resolvedScope.scopeType,
      scopeRef: resolvedScope.scopeRef,
      conditions: [],
    });
  }

  const deduped = new Map();
  for (const assignment of assignments) {
    deduped.set(buildGrantKey(assignment), {
      key: normalizePermissionKey(assignment.key),
      scopeType: normalizeScopeType(assignment.scopeType),
      scopeRef:
        normalizeScopeType(assignment.scopeType) === "GLOBAL"
          ? ""
          : normalizeText(assignment.scopeRef),
      conditions: Array.isArray(assignment.conditions) ? assignment.conditions : [],
    });
  }

  return Array.from(deduped.values());
};

const run = async () => {
  const dryRun = process.argv.includes("--dry-run");

  await connectDB();
  await ensurePermissionCatalogSeeded();
  await ensurePermissionTemplatesSeeded();

  const permissions = await Permission.find({})
    .select("_id key scopeType defaultScope")
    .lean();
  const permissionById = new Map(
    permissions.map((permission) => [normalizeText(permission._id), {
      key: normalizePermissionKey(permission.key),
      scopeType: permission.scopeType,
      defaultScope: permission.defaultScope,
    }]),
  );
  const permissionByKey = new Map(
    permissions.map((permission) => [normalizePermissionKey(permission.key), {
      key: normalizePermissionKey(permission.key),
      scopeType: permission.scopeType,
      defaultScope: permission.defaultScope,
    }]),
  );

  const users = await User.find({}).select(
    "_id role roles permissions authorizationVersion permissionsVersion storeLocation systemRoles taskRoles branchAssignments",
  );

  const summary = {
    totalUsers: users.length,
    roleBackfilledUsers: 0,
    directGrantInserted: 0,
    directGrantUsers: 0,
  };

  for (const user of users) {
    const legacyRoleAssignments = buildLegacyRoleAssignmentsFromUser(user);
    if (legacyRoleAssignments.length > 0) {
      summary.roleBackfilledUsers += 1;
      if (!dryRun) {
        await syncUserRoleAssignments({
          user,
          assignments: legacyRoleAssignments,
          actorUserId: null,
          primaryBranchId: normalizeText(user.storeLocation),
          reason: "canonical_authz_backfill",
        });
      }
    }

    const legacyDirectGrants = await buildLegacyDirectGrantAssignments({
      user,
      permissionById,
      permissionByKey,
    });

    if (!legacyDirectGrants.length) {
      continue;
    }

    summary.directGrantUsers += 1;

    const existingGrantRows = await UserPermissionGrant.find({
      userId: user._id,
      status: "ACTIVE",
    })
      .select("permissionKey scopeType scopeRef")
      .lean();

    const existingGrantKeys = new Set(
      existingGrantRows.map((row) =>
        buildGrantKey({
          key: row.permissionKey,
          scopeType: row.scopeType,
          scopeRef: row.scopeRef,
        }),
      ),
    );

    const grantDocs = legacyDirectGrants
      .filter((assignment) => !existingGrantKeys.has(buildGrantKey(assignment)))
      .map((assignment) => ({
        userId: user._id,
        permissionKey: assignment.key,
        scopeType: assignment.scopeType,
        scopeRef: assignment.scopeRef,
        effect: "ALLOW",
        conditions: assignment.conditions,
        status: "ACTIVE",
        assignedBy: null,
        assignedAt: new Date(),
        metadata: {
          reason: "canonical_authz_backfill",
          migratedAt: new Date().toISOString(),
        },
      }));

    summary.directGrantInserted += grantDocs.length;

    if (dryRun || grantDocs.length === 0) {
      continue;
    }

    await UserPermissionGrant.insertMany(grantDocs, { ordered: false });

    const nextDirectPermissionKeys = toUniqueStrings([
      ...existingGrantRows.map((row) => row.permissionKey),
      ...grantDocs.map((row) => row.permissionKey),
    ]).map(normalizePermissionKey);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          permissions: nextDirectPermissionKeys,
        },
        $inc: {
          permissionsVersion: 1,
          authorizationVersion: 1,
        },
      },
    );
  }

  console.log("Canonical authorization migration summary", summary);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Canonical authorization migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
