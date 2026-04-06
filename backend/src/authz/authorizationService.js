import { normalizeUserAccess } from "./userAccessResolver.js";
import {
  buildPermissionGrantMap,
  buildPermissionSet,
  buildRolePermissionGrants,
  evaluatePolicy,
} from "./policyEngine.js";
import {
  collectBranchScopeIdsFromGrants,
  loadActiveUserPermissionGrants,
} from "./userPermissionService.js";
import { getOrLoadEffectiveContext } from "./effectivePermissionCache.js";
import { loadRolePermissionMap } from "./rolePermissionService.js";
import {
  buildLegacyAuthzMirror,
  resolveUserRoleAssignments,
} from "./roleAssignmentService.js";
import User from "../modules/auth/User.js";

const normalizeScopeType = (value) => String(value || "").trim().toUpperCase();
const normalizeScopeId = (value) => String(value || "").trim();
const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();

const toUniqueStrings = (items = []) =>
  Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));

const dedupePermissionGrants = (grants = []) => {
  const byKey = new Map();
  for (const grant of grants) {
    const key = normalizePermissionKey(grant?.key);
    if (!key) continue;
    const scopeType = normalizeScopeType(grant?.scopeType || "GLOBAL");
    const scopeId = normalizeScopeId(grant?.scopeId);
    const dedupeKey = `${key}|${scopeType}|${scopeId}`;
    byKey.set(dedupeKey, {
      ...grant,
      key,
      scopeType,
      scopeId,
    });
  }
  return Array.from(byKey.values());
};

const mergeCanonicalAssignments = ({ normalized, assignments = [], activeBranchId = "" }) => {
  if (!assignments.length) {
    return normalized;
  }

  const mirror = buildLegacyAuthzMirror({
    assignments,
    fallbackRole: normalized.role || "USER",
    primaryBranchId: activeBranchId || normalized.defaultBranchId || "",
  });

  return {
    ...normalized,
    role: mirror.legacyRole || normalized.role,
    roles: mirror.roles?.length ? mirror.roles : normalized.roles || [],
    roleKeys: mirror.roleKeys || [],
    systemRoles: mirror.systemRoles || normalized.systemRoles || [],
    taskRoles: mirror.taskRoles || normalized.taskRoles || [],
    branchAssignments: mirror.branchAssignments || normalized.branchAssignments || [],
    allowedBranchIds:
      mirror.branchAssignments?.map((assignment) => normalizeScopeId(assignment.storeId)) ||
      normalized.allowedBranchIds ||
      [],
    defaultBranchId:
      mirror.primaryBranchId || activeBranchId || normalized.defaultBranchId || "",
  };
};

export const resolveEffectiveAccessContext = async ({
  user,
  normalizedAccess = null,
  activeBranchId = "",
} = {}) => {
  const normalized = normalizedAccess || normalizeUserAccess(user);
  const effectiveActiveBranchId = normalizeScopeId(activeBranchId || normalized.defaultBranchId);
  const userId = normalizeScopeId(normalized.userId);
  const permissionsVersion = Number(normalized.permissionsVersion || 1);

  const cacheKey = `${userId}:${permissionsVersion}:${effectiveActiveBranchId || "_"}:effective`;
  return getOrLoadEffectiveContext(cacheKey, async () => {
    const roleAssignments = await resolveUserRoleAssignments({ user });
    const normalizedWithAssignments = mergeCanonicalAssignments({
      normalized,
      assignments: roleAssignments,
      activeBranchId: effectiveActiveBranchId,
    });
    const rolePermissionMap = await loadRolePermissionMap();
    const explicitGrants = await loadActiveUserPermissionGrants({
      userId: normalizedWithAssignments.userId,
      permissionsVersion: normalizedWithAssignments.permissionsVersion,
    });

    const roleGrants = buildRolePermissionGrants({
      ...normalizedWithAssignments,
      activeBranchId: effectiveActiveBranchId,
    }, { rolePermissionMap });

    const permissionGrants = dedupePermissionGrants([...roleGrants, ...explicitGrants]);

    const explicitBranchIds = collectBranchScopeIdsFromGrants(permissionGrants);
    const allowedBranchIds = toUniqueStrings([
      ...(normalizedWithAssignments.allowedBranchIds || []),
      ...explicitBranchIds,
    ]);

    const authzSnapshot = {
      ...normalizedWithAssignments,
      activeBranchId: effectiveActiveBranchId,
      allowedBranchIds,
      permissionMode: "HYBRID",
      permissionGrants,
      rolePermissionMap,
      roleAssignments,
      roleKeys: normalizedWithAssignments.roleKeys || [],
    };
    authzSnapshot.permissions = buildPermissionSet(authzSnapshot);
    authzSnapshot.permissionGrantMap = buildPermissionGrantMap(permissionGrants);

    return authzSnapshot;
  });
};

export const getUserPermissions = async (userId, { user = null, activeBranchId = "", resource = null } = {}) => {
  const targetUser =
    user || (userId ? await User.findById(userId) : null);
  if (!targetUser) {
    const error = new Error("User not found");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }
  const effective = await resolveEffectiveAccessContext({
    user: targetUser,
    activeBranchId,
  });

  return {
    userId: effective.userId,
    permissions: Array.from(effective.permissions || []).sort(),
    permissionGrants: Array.isArray(effective.permissionGrants) ? effective.permissionGrants : [],
    roleAssignments: Array.isArray(effective.roleAssignments) ? effective.roleAssignments : [],
    roleKeys: Array.isArray(effective.roleKeys) ? effective.roleKeys : [],
    activeBranchId: effective.activeBranchId || "",
    allowedBranchIds: effective.allowedBranchIds || [],
    resource,
  };
};

export const authorizePermission = ({
  authz,
  permission,
  mode = "branch",
  requireActiveBranch = false,
  resource = null,
} = {}) => {
  return evaluatePolicy({
    action: permission,
    authz,
    mode,
    requireActiveBranch,
    resource,
  });
};

export default {
  resolveEffectiveAccessContext,
  getUserPermissions,
  authorizePermission,
};
