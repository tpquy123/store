import mongoose from "mongoose";
import Permission from "../modules/auth/Permission.js";
import Role from "../modules/auth/Role.js";
import User from "../modules/auth/User.js";
import UserPermissionGrant from "../modules/auth/UserPermissionGrant.js";
import { logPermissionAuditEvent } from "../modules/auth/permissionAuditService.js";
import {
  getOrLoadRawPermissionGrants,
  invalidateUserPermissionCache,
} from "./effectivePermissionCache.js";
import { SCOPE_TYPES, ensurePermissionCatalogSeeded } from "./permissionCatalog.js";

const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();
const normalizeScopeType = (value) => String(value || "").trim().toUpperCase();
const normalizeScopeId = (value) => String(value || "").trim();
const normalizeTemplateKey = (value) => String(value || "").trim().toUpperCase();

const toUniqueStrings = (items = []) =>
  Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));

const buildAssignmentKey = ({ key, scopeType, scopeId }) =>
  `${normalizePermissionKey(key)}|${normalizeScopeType(scopeType)}|${normalizeScopeId(scopeId)}`;

const isValidScopeType = (scopeType) =>
  ["GLOBAL", "BRANCH", "SELF", "TASK", "RESOURCE"].includes(scopeType);

const toUserPermissionCacheKey = (userId, permissionsVersion = 1) =>
  `${String(userId || "").trim()}:${Number(permissionsVersion || 1)}:raw`;

export const loadPermissionCatalogMap = async ({ includeInactive = false } = {}) => {
  await ensurePermissionCatalogSeeded();

  const filter = includeInactive ? {} : { isActive: true };
  const permissions = await Permission.find(filter)
    .select("_id key module action scopeType isSensitive isActive resourceType defaultScope")
    .lean();

  const byKey = new Map();
  for (const permission of permissions) {
    const key = normalizePermissionKey(permission.key);
    byKey.set(key, {
      id: String(permission._id),
      key,
      module: permission.module,
      action: permission.action,
      scopeType: permission.scopeType,
      isSensitive: Boolean(permission.isSensitive),
      isActive: Boolean(permission.isActive),
      resourceType: permission.resourceType || permission.module,
      defaultScope: permission.defaultScope || permission.scopeType,
    });
  }

  return byKey;
};

const expandTemplateAssignments = async ({
  templateKeys = [],
  branchIds = [],
  targetUserId = "",
}) => {
  const normalizedTemplateKeys = toUniqueStrings(templateKeys.map(normalizeTemplateKey));
  if (!normalizedTemplateKeys.length) {
    return [];
  }

  const roles = await Role.find({
    key: { $in: normalizedTemplateKeys },
    isActive: true,
  })
    .select("_id key permissions")
    .lean();

  const catalogMap = await loadPermissionCatalogMap();
  const expanded = [];

  for (const role of roles) {
    const templateKey = normalizeTemplateKey(role.key);
    for (const permissionKey of role.permissions || []) {
      const permission = catalogMap.get(normalizePermissionKey(permissionKey));
      if (!permission || !permission.isActive) continue;

      const scopeType = normalizeScopeType(permission.scopeType);
      if (scopeType === SCOPE_TYPES.BRANCH) {
        for (const branchId of branchIds) {
          expanded.push({
            key: permission.key,
            scopeType,
            scopeId: normalizeScopeId(branchId),
            fromTemplateKey: templateKey,
          });
        }
        continue;
      }

      if (scopeType === SCOPE_TYPES.SELF) {
        expanded.push({
          key: permission.key,
          scopeType,
          scopeId: normalizeScopeId(targetUserId),
          fromTemplateKey: templateKey,
        });
        continue;
      }

      expanded.push({
        key: permission.key,
        scopeType,
        scopeId: "",
        fromTemplateKey: templateKey,
      });
    }
  }

  return expanded;
};

export const normalizeRequestedPermissionAssignments = async ({
  permissions = [],
  templateKeys = [],
  branchIds = [],
  targetUserId = "",
} = {}) => {
  const catalogMap = await loadPermissionCatalogMap();
  const normalizedBranchIds = toUniqueStrings(branchIds.map(normalizeScopeId));

  const explicitAssignments = Array.isArray(permissions) ? permissions : [];
  const templateAssignments = await expandTemplateAssignments({
    templateKeys,
    branchIds: normalizedBranchIds,
    targetUserId,
  });

  const combined = [...templateAssignments, ...explicitAssignments];
  const deduped = new Map();
  const errors = [];

  for (const raw of combined) {
    const key = normalizePermissionKey(raw?.key || raw?.permissionKey);
    if (!key) continue;

    const catalog = catalogMap.get(key);
    if (!catalog || !catalog.isActive) {
      errors.push(`Unknown permission key: ${key}`);
      continue;
    }

    const requestedScopeType = normalizeScopeType(
      raw?.scopeType || catalog.defaultScope || catalog.scopeType
    );
    if (!isValidScopeType(requestedScopeType)) {
      errors.push(`Invalid scope type for ${key}: ${requestedScopeType}`);
      continue;
    }

    if (requestedScopeType !== catalog.scopeType) {
      errors.push(`Scope mismatch for ${key}: expected ${catalog.scopeType}, got ${requestedScopeType}`);
      continue;
    }

    const requestedScopeIds = [];
    if (requestedScopeType === SCOPE_TYPES.BRANCH) {
      const rowScopeId = normalizeScopeId(raw?.scopeId || raw?.scopeRef);
      const rowBranchIds = Array.isArray(raw?.branchIds) ? raw.branchIds : [];
      const mergedScopeIds = toUniqueStrings([rowScopeId, ...rowBranchIds, ...normalizedBranchIds]);
      if (!mergedScopeIds.length) {
        errors.push(`Branch scope requires scopeId/branchIds for permission ${key}`);
        continue;
      }
      requestedScopeIds.push(...mergedScopeIds);
    } else if (requestedScopeType === SCOPE_TYPES.SELF) {
      const resolvedSelfScopeId = normalizeScopeId(targetUserId || raw?.scopeId || raw?.scopeRef);
      requestedScopeIds.push(resolvedSelfScopeId);
    } else if (requestedScopeType === "TASK" || requestedScopeType === "RESOURCE") {
      requestedScopeIds.push(normalizeScopeId(raw?.scopeId || raw?.scopeRef));
    } else {
      requestedScopeIds.push("");
    }

    for (const scopeId of requestedScopeIds) {
      const normalizedScopeId =
        requestedScopeType === SCOPE_TYPES.GLOBAL ? "" : normalizeScopeId(scopeId);
      const assignment = {
        key,
        scopeType: requestedScopeType,
        scopeId: normalizedScopeId,
        module: catalog.module,
        action: catalog.action,
        isSensitive: Boolean(catalog.isSensitive),
        resourceType: catalog.resourceType,
        conditions: Array.isArray(raw?.conditions) ? raw.conditions : [],
      };
      deduped.set(buildAssignmentKey(assignment), assignment);
    }
  }

  return {
    assignments: Array.from(deduped.values()),
    errors,
  };
};

export const validateGrantAntiEscalation = ({
  actorAuthz,
  assignments = [],
  targetUserId = "",
}) => {
  const violations = [];
  const actorPermissionSet = actorAuthz?.permissions || new Set();
  const actorAllowedBranchIds = toUniqueStrings(actorAuthz?.allowedBranchIds || []);
  const actorId = String(actorAuthz?.userId || "").trim();
  const isGlobalAdmin = Boolean(actorAuthz?.isGlobalAdmin);

  for (const assignment of assignments) {
    const key = normalizePermissionKey(assignment.key);
    const scopeType = normalizeScopeType(assignment.scopeType);
    const scopeId = normalizeScopeId(assignment.scopeId);

    if (!isGlobalAdmin && scopeType === SCOPE_TYPES.GLOBAL) {
      violations.push(`Global scope grant is forbidden for non-global admin (${key})`);
      continue;
    }

    if (!isGlobalAdmin && !actorPermissionSet.has("*") && !actorPermissionSet.has(key)) {
      violations.push(`Cannot grant permission not owned by actor (${key})`);
      continue;
    }

    if (!isGlobalAdmin && scopeType === SCOPE_TYPES.BRANCH) {
      if (!scopeId || !actorAllowedBranchIds.includes(scopeId)) {
        violations.push(`Cannot grant permission outside actor branch scope (${key}:${scopeId || "n/a"})`);
        continue;
      }
    }

    if (!isGlobalAdmin && (scopeType === SCOPE_TYPES.SELF || scopeType === "TASK")) {
      const normalizedTargetUserId = normalizeScopeId(targetUserId);
      if (scopeId && normalizedTargetUserId && scopeId !== normalizedTargetUserId) {
        violations.push(`Scoped self grant must target the user itself (${key})`);
        continue;
      }
      if (scopeId && actorId && scopeId !== actorId && scopeId !== normalizedTargetUserId) {
        violations.push(`Cannot grant self/task scope to another actor (${key})`);
      }
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
};

export const loadActiveUserPermissionGrants = async ({
  userId,
  permissionsVersion = 1,
} = {}) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId || !mongoose.Types.ObjectId.isValid(normalizedUserId)) {
    return [];
  }

  const cacheKey = toUserPermissionCacheKey(normalizedUserId, permissionsVersion);
  const rawRows = await getOrLoadRawPermissionGrants(cacheKey, async () => {
    const rows = await UserPermissionGrant.find({
      userId: normalizedUserId,
      status: "ACTIVE",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .select("permissionKey scopeType scopeRef conditions assignedBy assignedAt expiresAt metadata")
      .lean();
    return rows;
  });

  const catalogMap = await loadPermissionCatalogMap();
  const grants = [];
  for (const row of rawRows) {
    const key = normalizePermissionKey(row.permissionKey);
    const permission = catalogMap.get(key);
    if (!permission || !permission.isActive) continue;

    grants.push({
      key,
      module: permission.module,
      action: permission.action,
      scopeType: normalizeScopeType(row.scopeType || permission.scopeType),
      scopeId: normalizeScopeId(row.scopeRef),
      scopeRef: normalizeScopeId(row.scopeRef),
      isSensitive: Boolean(permission.isSensitive),
      resourceType: permission.resourceType,
      defaultScope: permission.defaultScope,
      assignedBy: row.assignedBy ? String(row.assignedBy) : "",
      assignedAt: row.assignedAt || null,
      conditions: Array.isArray(row.conditions) ? row.conditions : [],
      source: "DIRECT",
    });
  }

  return grants;
};

const syncUserPermissionReadModel = async (userId) => {
  const directPermissionKeys = await UserPermissionGrant.distinct("permissionKey", {
    userId,
    status: "ACTIVE",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        permissions: directPermissionKeys.map(normalizePermissionKey),
      },
    }
  );
};

export const applyUserPermissionAssignments = async ({
  targetUserId,
  assignments = [],
  actorUserId = null,
  req = null,
  reason = "",
} = {}) => {
  const normalizedTargetUserId = String(targetUserId || "").trim();
  if (!normalizedTargetUserId) {
    throw new Error("targetUserId is required");
  }

  const existingRows = await UserPermissionGrant.find({
    userId: normalizedTargetUserId,
    status: "ACTIVE",
  })
    .select("_id permissionKey scopeType scopeRef conditions metadata")
    .lean();

  const existingByKey = new Map();
  for (const row of existingRows) {
    const assignmentKey = buildAssignmentKey({
      key: row.permissionKey,
      scopeType: row.scopeType,
      scopeId: row.scopeRef,
    });
    existingByKey.set(assignmentKey, row);
  }

  const targetByKey = new Map();
  for (const assignment of assignments) {
    targetByKey.set(buildAssignmentKey(assignment), assignment);
  }

  const revokeRowIds = [];
  const revokedEntries = [];
  for (const [assignmentKey, row] of existingByKey.entries()) {
    if (!targetByKey.has(assignmentKey)) {
      revokeRowIds.push(String(row._id));
      revokedEntries.push({
        key: normalizePermissionKey(row.permissionKey),
        scopeType: normalizeScopeType(row.scopeType),
        scopeId: normalizeScopeId(row.scopeRef),
      });
    }
  }

  const grantDocs = [];
  const grantedEntries = [];
  const catalogMap = await loadPermissionCatalogMap();
  for (const [assignmentKey, assignment] of targetByKey.entries()) {
    if (existingByKey.has(assignmentKey)) {
      continue;
    }

    const permission = catalogMap.get(normalizePermissionKey(assignment.key));
    if (!permission) continue;

    grantDocs.push({
      userId: normalizedTargetUserId,
      permissionKey: normalizePermissionKey(assignment.key),
      scopeType: normalizeScopeType(assignment.scopeType),
      scopeRef: normalizeScopeId(assignment.scopeId),
      effect: "ALLOW",
      conditions: Array.isArray(assignment.conditions) ? assignment.conditions : [],
      status: "ACTIVE",
      assignedBy: actorUserId || null,
      assignedAt: new Date(),
      metadata: {
        reason: reason || "permission_sync",
      },
    });

    grantedEntries.push({
      key: normalizePermissionKey(assignment.key),
      scopeType: normalizeScopeType(assignment.scopeType),
      scopeId: normalizeScopeId(assignment.scopeId),
      conditions: Array.isArray(assignment.conditions) ? assignment.conditions : [],
      isSensitive: Boolean(permission.isSensitive),
    });
  }

  if (revokeRowIds.length) {
    await UserPermissionGrant.updateMany(
      { _id: { $in: revokeRowIds } },
      {
        $set: {
          status: "REVOKED",
          expiresAt: new Date(),
          metadata: {
            reason: reason || "permission_sync",
          },
        },
      }
    );
  }

  if (grantDocs.length) {
    await UserPermissionGrant.insertMany(grantDocs, { ordered: false });
  }

  invalidateUserPermissionCache(normalizedTargetUserId);
  await syncUserPermissionReadModel(normalizedTargetUserId);

  if (req) {
    for (const granted of grantedEntries) {
      await logPermissionAuditEvent({
        req,
        targetUserId: normalizedTargetUserId,
        actionType: "PERMISSION_GRANTED",
        oldValues: {},
        newValues: granted,
        changedPaths: ["permissions"],
        note: "Permission grant applied",
        reason,
        metadata: {
          permission: granted.key,
          scopeType: granted.scopeType,
          scopeId: granted.scopeId,
          isSensitive: Boolean(granted.isSensitive),
        },
      });
    }

    for (const revoked of revokedEntries) {
      await logPermissionAuditEvent({
        req,
        targetUserId: normalizedTargetUserId,
        actionType: "PERMISSION_REVOKED",
        oldValues: revoked,
        newValues: {},
        changedPaths: ["permissions"],
        note: "Permission grant revoked",
        reason,
        metadata: {
          permission: revoked.key,
          scopeType: revoked.scopeType,
          scopeId: revoked.scopeId,
        },
      });
    }
  }

  return {
    grantedCount: grantDocs.length,
    revokedCount: revokeRowIds.length,
    grantedEntries,
    revokedEntries,
  };
};

export const collectBranchScopeIdsFromGrants = (grants = []) => {
  return toUniqueStrings(
    grants
      .filter((grant) => normalizeScopeType(grant.scopeType) === SCOPE_TYPES.BRANCH)
      .map((grant) => normalizeScopeId(grant.scopeId || grant.scopeRef))
  );
};

export default {
  loadActiveUserPermissionGrants,
  applyUserPermissionAssignments,
  normalizeRequestedPermissionAssignments,
  validateGrantAntiEscalation,
  collectBranchScopeIdsFromGrants,
};
