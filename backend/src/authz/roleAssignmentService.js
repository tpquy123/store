import mongoose from "mongoose";
import Role from "../modules/auth/Role.js";
import UserRoleAssignment from "../modules/auth/UserRoleAssignment.js";
import { invalidateUserPermissionCache } from "./effectivePermissionCache.js";
import { BRANCH_ROLES, SYSTEM_ROLES, TASK_ROLES } from "./actions.js";

const normalizeText = (value) => String(value || "").trim();
const normalizeRoleKey = (value) => normalizeText(value).toUpperCase();
const normalizeScopeType = (value) => normalizeText(value).toUpperCase();
const normalizeScopeRef = (value) => normalizeText(value);

const toUniqueStrings = (items = []) =>
  Array.from(new Set(items.map((item) => normalizeText(item)).filter(Boolean)));

const createAssignmentKey = ({ roleKey, scopeType, scopeRef }) =>
  `${normalizeRoleKey(roleKey)}|${normalizeScopeType(scopeType)}|${normalizeScopeRef(scopeRef)}`;

const normalizeScopeRefForType = (scopeType, scopeRef) => {
  const normalizedScopeType = normalizeScopeType(scopeType);
  if (normalizedScopeType === "GLOBAL" || normalizedScopeType === "TASK") {
    return "";
  }
  return normalizeScopeRef(scopeRef);
};

const branchRoleKeyForLegacy = (roleKey) => {
  const normalized = normalizeRoleKey(roleKey);
  return normalized === "ADMIN" ? "BRANCH_ADMIN" : normalized;
};

const legacyRoleKeyForUserField = (roleKey) => {
  const normalized = normalizeRoleKey(roleKey);
  return normalized === "BRANCH_ADMIN" ? "ADMIN" : normalized;
};

const roleScopeTypeFallback = (roleKey) => {
  const normalizedRoleKey = normalizeRoleKey(roleKey);
  if (normalizedRoleKey === "CUSTOMER") return "SELF";
  if (SYSTEM_ROLES.includes(normalizedRoleKey)) return "GLOBAL";
  if (TASK_ROLES.includes(normalizedRoleKey)) return "TASK";
  if (BRANCH_ROLES.includes(normalizedRoleKey)) return "BRANCH";
  return "BRANCH";
};

const toLeanRoleMap = async ({ roleKeys = [], roleIds = [] } = {}) => {
  const filter = { isActive: true };
  const normalizedRoleKeys = roleKeys.map(normalizeRoleKey).filter(Boolean);
  const normalizedRoleIds = roleIds
    .map((value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null))
    .filter(Boolean);

  if (normalizedRoleKeys.length) {
    filter.key = { $in: normalizedRoleKeys };
  }
  if (normalizedRoleIds.length) {
    filter.$or = [{ _id: { $in: normalizedRoleIds } }, { key: { $in: normalizedRoleKeys } }];
    delete filter.key;
  }

  const roles = await Role.find(filter)
    .select("_id key name scopeType permissions isActive isSystem metadata")
    .lean();

  const byKey = new Map();
  const byId = new Map();
  for (const role of roles) {
    byKey.set(normalizeRoleKey(role.key), role);
    byId.set(String(role._id), role);
  }

  return {
    byKey,
    byId,
    roles,
  };
};

export const normalizeRequestedRoleAssignments = async (payload = {}) => {
  const rawAssignments = Array.isArray(payload?.roleAssignments)
    ? payload.roleAssignments
    : [];
  const roleKeys = toUniqueStrings(
    Array.isArray(payload?.roleKeys) ? payload.roleKeys : [payload?.role]
  ).map(normalizeRoleKey);
  const branchIds = toUniqueStrings(payload?.branchIds || []);
  const primaryBranchId = normalizeText(payload?.primaryBranchId || payload?.storeLocation);

  let requestedAssignments = rawAssignments
    .map((assignment) => ({
      roleKey: normalizeRoleKey(assignment?.roleKey),
      roleId: normalizeText(assignment?.roleId),
      scopeType: normalizeScopeType(assignment?.scopeType),
      scopeRef: normalizeScopeRef(assignment?.scopeRef),
      metadata: assignment?.metadata || {},
    }))
    .filter((assignment) => assignment.roleKey || assignment.roleId);

  if (!requestedAssignments.length && roleKeys.length) {
    const { byKey } = await toLeanRoleMap({ roleKeys });
    requestedAssignments = roleKeys.flatMap((roleKey) => {
      const role = byKey.get(roleKey);
      const scopeType = normalizeScopeType(role?.scopeType || roleScopeTypeFallback(roleKey));

      if (scopeType === "BRANCH") {
        const effectiveBranchIds = branchIds.length
          ? branchIds
          : primaryBranchId
            ? [primaryBranchId]
            : [];
        return effectiveBranchIds.map((branchId) => ({
          roleKey,
          roleId: String(role?._id || ""),
          scopeType,
          scopeRef: branchId,
          metadata: { primaryBranchId },
        }));
      }

      return [
        {
          roleKey,
          roleId: String(role?._id || ""),
          scopeType,
          scopeRef: "",
          metadata: { primaryBranchId },
        },
      ];
    });
  }

  if (!requestedAssignments.length) {
    return [];
  }

  const roleIds = requestedAssignments.map((assignment) => assignment.roleId);
  const requestedRoleKeys = requestedAssignments.map((assignment) => assignment.roleKey);
  const { byKey, byId } = await toLeanRoleMap({
    roleKeys: requestedRoleKeys,
    roleIds,
  });

  const deduped = new Map();
  const invalidRoles = [];

  for (const assignment of requestedAssignments) {
    const role =
      byId.get(assignment.roleId) ||
      byKey.get(normalizeRoleKey(assignment.roleKey));

    if (!role) {
      invalidRoles.push(assignment.roleKey || assignment.roleId || "UNKNOWN");
      continue;
    }

    const scopeType = normalizeScopeType(assignment.scopeType || role.scopeType || roleScopeTypeFallback(role.key));
    const scopeRef = normalizeScopeRefForType(scopeType, assignment.scopeRef);

    deduped.set(
      createAssignmentKey({
        roleKey: role.key,
        scopeType,
        scopeRef,
      }),
      {
        roleId: String(role._id),
        roleKey: normalizeRoleKey(role.key),
        roleName: role.name || role.key,
        scopeType,
        scopeRef,
        metadata: assignment.metadata || {},
      }
    );
  }

  if (invalidRoles.length) {
    const error = new Error(`Unknown or inactive roles: ${invalidRoles.join(", ")}`);
    error.status = 400;
    error.code = "AUTHZ_ROLE_INVALID";
    throw error;
  }

  return Array.from(deduped.values());
};

export const loadActiveUserRoleAssignments = async ({ userId } = {}) => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId || !mongoose.Types.ObjectId.isValid(normalizedUserId)) {
    return [];
  }

  const rows = await UserRoleAssignment.find({
    userId: normalizedUserId,
    status: "ACTIVE",
  })
    .populate("roleId", "_id key name scopeType permissions isActive isSystem metadata")
    .select("userId roleId roleKey scopeType scopeRef status assignedAt assignedBy expiresAt metadata")
    .sort({ assignedAt: 1, createdAt: 1 })
    .lean();

  return rows
    .filter((row) => row?.roleId && row.roleId.isActive !== false)
    .map((row) => ({
      id: String(row._id),
      roleId: String(row.roleId._id),
      roleKey: normalizeRoleKey(row.roleKey || row.roleId?.key),
      roleName: row.roleId?.name || row.roleKey || "",
      permissions: Array.isArray(row.roleId?.permissions) ? row.roleId.permissions : [],
      scopeType: normalizeScopeType(row.scopeType || row.roleId?.scopeType),
      scopeRef: normalizeScopeRef(row.scopeRef),
      assignedAt: row.assignedAt || null,
      assignedBy: row.assignedBy ? String(row.assignedBy) : "",
      metadata: row.metadata || {},
      role: row.roleId,
    }));
};

export const buildLegacyRoleAssignmentsFromUser = (user = {}) => {
  const assignments = [];
  const branchAssignments = Array.isArray(user?.branchAssignments) ? user.branchAssignments : [];

  for (const roleKey of Array.isArray(user?.systemRoles) ? user.systemRoles : []) {
    assignments.push({
      roleKey: normalizeRoleKey(roleKey),
      scopeType: "GLOBAL",
      scopeRef: "",
      metadata: {},
    });
  }

  for (const roleKey of Array.isArray(user?.taskRoles) ? user.taskRoles : []) {
    assignments.push({
      roleKey: normalizeRoleKey(roleKey),
      scopeType: "TASK",
      scopeRef: "",
      metadata: {},
    });
  }

  for (const assignment of branchAssignments) {
    const status = normalizeText(assignment?.status || "ACTIVE").toUpperCase();
    if (status !== "ACTIVE") {
      continue;
    }
    const scopeRef = normalizeScopeRef(assignment?.storeId);
    const isPrimary = Boolean(assignment?.isPrimary);
    for (const roleKey of Array.isArray(assignment?.roles) ? assignment.roles : []) {
      assignments.push({
        roleKey: branchRoleKeyForLegacy(roleKey),
        scopeType: "BRANCH",
        scopeRef,
        metadata: {
          isPrimary,
        },
      });
    }
  }

  const deduped = new Map();
  for (const assignment of assignments) {
    deduped.set(createAssignmentKey(assignment), assignment);
  }
  return Array.from(deduped.values());
};

export const buildLegacyAuthzMirror = ({
  assignments = [],
  fallbackRole = "USER",
  primaryBranchId = "",
} = {}) => {
  const systemRoles = new Set();
  const taskRoles = new Set();
  const branchByStoreId = new Map();
  const uniqueRoleIds = new Set();
  const uniqueRoleKeys = new Set();
  const selfScopedRoles = [];

  for (const assignment of assignments) {
    const roleKey = normalizeRoleKey(assignment.roleKey);
    const scopeType = normalizeScopeType(assignment.scopeType);
    const scopeRef = normalizeScopeRefForType(scopeType, assignment.scopeRef);
    if (assignment.roleId) {
      uniqueRoleIds.add(String(assignment.roleId));
    }
    if (roleKey) {
      uniqueRoleKeys.add(roleKey);
    }

    if (scopeType === "GLOBAL") {
      systemRoles.add(roleKey);
      continue;
    }

    if (scopeType === "TASK") {
      taskRoles.add(roleKey);
      continue;
    }

    if (scopeType === "SELF") {
      if (roleKey && !selfScopedRoles.includes(roleKey)) {
        selfScopedRoles.push(roleKey);
      }
      continue;
    }

    if (scopeType === "BRANCH" && scopeRef) {
      const existing = branchByStoreId.get(scopeRef) || {
        storeId: scopeRef,
        roles: [],
        status: "ACTIVE",
        isPrimary: false,
      };
      existing.roles = Array.from(
        new Set([...existing.roles, branchRoleKeyForLegacy(roleKey)])
      );
      existing.isPrimary =
        existing.isPrimary ||
        normalizeScopeRef(primaryBranchId) === scopeRef ||
        assignment?.metadata?.isPrimary === true;
      branchByStoreId.set(scopeRef, existing);
    }
  }

  const branchAssignments = Array.from(branchByStoreId.values());
  if (branchAssignments.length > 0 && !branchAssignments.some((item) => item.isPrimary)) {
    branchAssignments[0].isPrimary = true;
  }

  const primaryBranch =
    branchAssignments.find((item) => item.isPrimary) ||
    branchAssignments[0] ||
    null;

  let legacyRole = normalizeRoleKey(fallbackRole) || "USER";
  if (systemRoles.has("GLOBAL_ADMIN")) {
    legacyRole = "GLOBAL_ADMIN";
  } else if (taskRoles.has("SHIPPER")) {
    legacyRole = "SHIPPER";
  } else if (primaryBranch?.roles?.length) {
    legacyRole = legacyRoleKeyForUserField(primaryBranch.roles[0]);
  } else if (selfScopedRoles.length > 0) {
    legacyRole = legacyRoleKeyForUserField(selfScopedRoles[0]);
  }

  return {
    legacyRole,
    roles: Array.from(uniqueRoleIds),
    roleKeys: Array.from(uniqueRoleKeys),
    systemRoles: Array.from(systemRoles),
    taskRoles: Array.from(taskRoles),
    branchAssignments,
    storeLocation: normalizeScopeRef(primaryBranch?.storeId || primaryBranchId),
    primaryBranchId: normalizeScopeRef(primaryBranch?.storeId || primaryBranchId),
  };
};

export const syncUserRoleAssignments = async ({
  user,
  assignments = [],
  actorUserId = null,
  primaryBranchId = "",
  reason = "role_assignment_sync",
} = {}) => {
  if (!user?._id) {
    throw new Error("user is required");
  }

  const normalizedAssignments = await normalizeRequestedRoleAssignments({
    roleAssignments: assignments,
    primaryBranchId,
  });
  const userId = String(user._id);

  const existingAssignments = await loadActiveUserRoleAssignments({ userId });
  const existingByKey = new Map(
    existingAssignments.map((assignment) => [
      createAssignmentKey(assignment),
      assignment,
    ])
  );
  const nextByKey = new Map(
    normalizedAssignments.map((assignment) => [
      createAssignmentKey(assignment),
      assignment,
    ])
  );

  const revokeIds = [];
  for (const [key, assignment] of existingByKey.entries()) {
    if (!nextByKey.has(key)) {
      revokeIds.push(assignment.id);
    }
  }

  const createDocs = [];
  for (const [key, assignment] of nextByKey.entries()) {
    if (existingByKey.has(key)) continue;
    createDocs.push({
      userId,
      roleId: assignment.roleId,
      roleKey: assignment.roleKey,
      scopeType: assignment.scopeType,
      scopeRef: assignment.scopeRef,
      status: "ACTIVE",
      assignedBy: actorUserId || null,
      assignedAt: new Date(),
      metadata: {
        ...(assignment.metadata || {}),
        reason,
      },
    });
  }

  if (revokeIds.length) {
    await UserRoleAssignment.updateMany(
      { _id: { $in: revokeIds } },
      {
        $set: {
          status: "REVOKED",
          expiresAt: new Date(),
          metadata: {
            reason,
          },
        },
      }
    );
  }

  if (createDocs.length) {
    await UserRoleAssignment.insertMany(createDocs, { ordered: false });
  }

  const mirror = buildLegacyAuthzMirror({
    assignments: normalizedAssignments,
    fallbackRole: user.role || "USER",
    primaryBranchId,
  });

  const beforeSnapshot = JSON.stringify({
    roles: Array.isArray(user.roles) ? user.roles.map(String).sort() : [],
    permissionsVersion: Number(user.permissionsVersion || 1),
    role: normalizeRoleKey(user.role || ""),
    systemRoles: toUniqueStrings(user.systemRoles || []).sort(),
    taskRoles: toUniqueStrings(user.taskRoles || []).sort(),
    storeLocation: normalizeText(user.storeLocation || ""),
    branchAssignments: (user.branchAssignments || []).map((item) => ({
      storeId: normalizeText(item.storeId),
      roles: toUniqueStrings(item.roles || []).sort(),
      isPrimary: Boolean(item.isPrimary),
      status: item.status || "ACTIVE",
    })),
  });

  user.roles = mirror.roles;
  user.role = mirror.legacyRole;
  user.systemRoles = mirror.systemRoles;
  user.taskRoles = mirror.taskRoles;
  user.branchAssignments = mirror.branchAssignments;
  user.storeLocation = mirror.storeLocation || user.storeLocation || "";
  user.authzVersion = Math.max(2, Number(user.authzVersion || 2));
  user.authorizationVersion = Number(user.authorizationVersion || 1) + 1;
  if (mirror.primaryBranchId) {
    user.preferences = {
      ...(user.preferences || {}),
      defaultBranchId: mirror.primaryBranchId,
    };
  }

  const afterSnapshot = JSON.stringify({
    roles: Array.isArray(user.roles) ? user.roles.map(String).sort() : [],
    permissionsVersion: Number(user.permissionsVersion || 1),
    role: normalizeRoleKey(user.role || ""),
    systemRoles: toUniqueStrings(user.systemRoles || []).sort(),
    taskRoles: toUniqueStrings(user.taskRoles || []).sort(),
    storeLocation: normalizeText(user.storeLocation || ""),
    branchAssignments: (user.branchAssignments || []).map((item) => ({
      storeId: normalizeText(item.storeId),
      roles: toUniqueStrings(item.roles || []).sort(),
      isPrimary: Boolean(item.isPrimary),
      status: item.status || "ACTIVE",
    })),
  });

  if (beforeSnapshot !== afterSnapshot || createDocs.length || revokeIds.length) {
    user.permissionsVersion = Number(user.permissionsVersion || 1) + 1;
  }

  await user.save();
  invalidateUserPermissionCache(userId);

  return {
    grantedCount: createDocs.length,
    revokedCount: revokeIds.length,
    assignments: normalizedAssignments,
    roleKeys: mirror.roleKeys,
    primaryBranchId: mirror.primaryBranchId,
  };
};

export const resolveUserRoleAssignments = async ({ user } = {}) => {
  const canonical = await loadActiveUserRoleAssignments({ userId: user?._id });
  if (canonical.length > 0) {
    return canonical;
  }
  return buildLegacyRoleAssignmentsFromUser(user);
};

export default {
  normalizeRequestedRoleAssignments,
  loadActiveUserRoleAssignments,
  buildLegacyRoleAssignmentsFromUser,
  buildLegacyAuthzMirror,
  syncUserRoleAssignments,
  resolveUserRoleAssignments,
};
