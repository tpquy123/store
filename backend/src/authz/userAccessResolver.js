import mongoose from "mongoose";
import {
  LEGACY_TO_BRANCH_ROLE,
  SYSTEM_ROLES,
  TASK_ROLES,
  isBranchRole,
  isSystemRole,
  isTaskRole,
} from "./actions.js";

const toStringId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value?._id) return toStringId(value._id);
  return String(value).trim();
};

const normalizeBranchRoles = (roles = []) => {
  const output = new Set();
  for (const role of roles) {
    if (!role) continue;
    if (isBranchRole(role)) {
      output.add(LEGACY_TO_BRANCH_ROLE[role] || role);
      continue;
    }
    if (LEGACY_TO_BRANCH_ROLE[role]) {
      output.add(LEGACY_TO_BRANCH_ROLE[role]);
    }
  }
  return Array.from(output);
};

const dedupeBranchAssignments = (assignments = []) => {
  const byStore = new Map();
  for (const assignment of assignments) {
    const storeId = toStringId(assignment?.storeId);
    if (!storeId) continue;

    const existing = byStore.get(storeId) || {
      storeId,
      roles: [],
      status: "ACTIVE",
      isPrimary: false,
      assignedAt: assignment?.assignedAt || undefined,
      assignedBy: assignment?.assignedBy || undefined,
    };

    const mergedRoles = new Set([
      ...existing.roles,
      ...normalizeBranchRoles(assignment?.roles || []),
    ]);

    existing.roles = Array.from(mergedRoles);
    existing.status = assignment?.status || existing.status;
    existing.isPrimary = Boolean(existing.isPrimary || assignment?.isPrimary);
    existing.assignedAt = existing.assignedAt || assignment?.assignedAt || undefined;
    existing.assignedBy = existing.assignedBy || assignment?.assignedBy || undefined;

    byStore.set(storeId, existing);
  }
  return Array.from(byStore.values()).filter((item) => item.roles.length > 0);
};

export const deriveAuthzWriteFromLegacyInput = ({ role, storeLocation, assignedBy } = {}) => {
  const normalizedRole = String(role || "").trim().toUpperCase();
  const storeId = toStringId(storeLocation);
  const branchRoleKey = LEGACY_TO_BRANCH_ROLE[normalizedRole] || "";

  const systemRoles = [];
  const taskRoles = [];
  const branchAssignments = [];
  let authzState = "ACTIVE";

  if (SYSTEM_ROLES.includes(normalizedRole)) {
    systemRoles.push("GLOBAL_ADMIN");
  } else if (TASK_ROLES.includes(normalizedRole)) {
    taskRoles.push("SHIPPER");
  } else if (branchRoleKey) {
    if (storeId) {
      branchAssignments.push({
        storeId,
        roles: [branchRoleKey],
        status: "ACTIVE",
        isPrimary: true,
        assignedBy: assignedBy || undefined,
      });
    } else if (branchRoleKey === "BRANCH_ADMIN") {
      authzState = "REVIEW_REQUIRED";
    }
  }

  return {
    systemRoles,
    taskRoles,
    branchAssignments,
    authzState,
  };
};

export const normalizeUserAccess = (user) => {
  const safeUser = user?.toObject ? user.toObject() : user || {};

  const role = String(safeUser.role || "").trim().toUpperCase();
  const rawSystemRoles = Array.isArray(safeUser.systemRoles)
    ? safeUser.systemRoles.filter(Boolean)
    : [];
  const rawTaskRoles = Array.isArray(safeUser.taskRoles)
    ? safeUser.taskRoles.filter(Boolean)
    : [];
  const rawAssignments = Array.isArray(safeUser.branchAssignments)
    ? safeUser.branchAssignments
    : [];

  const systemRoles = rawSystemRoles.filter(isSystemRole);
  const taskRoles = rawTaskRoles.filter(isTaskRole);
  const branchAssignments = dedupeBranchAssignments(rawAssignments);
  const authzState = safeUser.authzState || "ACTIVE";
  const activeBranchAssignments = branchAssignments.filter(
    (assignment) => String(assignment?.status || "ACTIVE").trim().toUpperCase() === "ACTIVE"
  );

  const defaultBranchId = toStringId(safeUser?.preferences?.defaultBranchId);
  const allowedBranchIds = activeBranchAssignments
    .map((assignment) => toStringId(assignment.storeId))
    .filter(Boolean);

  const primaryAssignment =
    activeBranchAssignments.find((assignment) => assignment.isPrimary) ||
    activeBranchAssignments[0];
  const primaryBranchId = toStringId(primaryAssignment?.storeId);
  const preferredBranchId =
    defaultBranchId && allowedBranchIds.includes(defaultBranchId) ? defaultBranchId : "";
  const requiresBranchAssignment = branchAssignments.length > 0;
  const isGlobalAdmin = systemRoles.includes("GLOBAL_ADMIN");
  const permissionMode = "HYBRID";

  return {
    userId: toStringId(safeUser._id),
    role,
    authzVersion: Number(safeUser.authzVersion || 1),
    authzState,
    permissionsVersion: Number(safeUser.permissionsVersion || 1),
    systemRoles: Array.from(new Set(systemRoles)),
    taskRoles: Array.from(new Set(taskRoles)),
    branchAssignments,
    allowedBranchIds: Array.from(new Set(allowedBranchIds)),
    defaultBranchId: preferredBranchId || primaryBranchId || "",
    isGlobalAdmin,
    requiresBranchAssignment,
    permissionMode,
  };
};
