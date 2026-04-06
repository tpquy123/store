import Permission from "../modules/auth/Permission.js";
import Role from "../modules/auth/Role.js";
import { ROLE_PERMISSIONS, SYSTEM_ROLES, BRANCH_ROLES, TASK_ROLES } from "./actions.js";
import { ensurePermissionCatalogSeeded } from "./permissionCatalog.js";

const SYSTEM_TEMPLATE_METADATA = Object.freeze({
  GLOBAL_ADMIN: {
    name: "Global Admin",
    description: "Full access across all modules and branches",
  },
  ADMIN: {
    name: "Branch Admin (Legacy Admin)",
    description: "Full branch operations and staff management in branch scope",
  },
  BRANCH_ADMIN: {
    name: "Branch Admin",
    description: "Full branch operations and staff management in branch scope",
  },
  WAREHOUSE_MANAGER: {
    name: "Warehouse Manager",
    description: "Warehouse operations, inventory, and transfer approvals",
  },
  WAREHOUSE_STAFF: {
    name: "Warehouse Staff",
    description: "Warehouse handling and inventory execution tasks",
  },
  PRODUCT_MANAGER: {
    name: "Product Manager",
    description: "Product catalog and inventory read controls",
  },
  ORDER_MANAGER: {
    name: "Order Manager",
    description: "Order lifecycle management and branch analytics",
  },
  POS_STAFF: {
    name: "POS Staff",
    description: "Point-of-sale operations and personal analytics",
  },
  CASHIER: {
    name: "Cashier",
    description: "Checkout operations and personal analytics",
  },
  SHIPPER: {
    name: "Shipper",
    description: "Assigned shipment tasks and personal analytics",
  },
  SALES_STAFF: {
    name: "Sales Staff",
    description: "Sales operations with branch-scoped order and warranty access",
  },
});

const normalizeRoleKey = (value) => String(value || "").trim().toUpperCase();
const normalizePermissionKey = (value) => String(value || "").trim().toLowerCase();

const roleKeys = Object.keys(ROLE_PERMISSIONS);

const resolveTemplateScope = (roleKey) => {
  const normalized = normalizeRoleKey(roleKey);
  if (normalized === "CUSTOMER") return "SELF";
  if (SYSTEM_ROLES.includes(normalized)) return "GLOBAL";
  if (TASK_ROLES.includes(normalized)) return "TASK";
  if (BRANCH_ROLES.includes(normalized)) return "BRANCH";
  return "BRANCH";
};

const getTemplatePayload = (roleKey) => {
  const metadata = SYSTEM_TEMPLATE_METADATA[roleKey] || {
    name: roleKey,
    description: `${roleKey} permission template`,
  };

  return {
    key: normalizeRoleKey(roleKey),
    name: metadata.name,
    description: metadata.description,
    scopeType: resolveTemplateScope(roleKey),
    isSystem: true,
    isActive: true,
    permissions: (ROLE_PERMISSIONS[roleKey] || [])
      .filter((permissionKey) => permissionKey !== "*")
      .map(normalizePermissionKey),
    metadata: {
      roleKey: normalizeRoleKey(roleKey),
      source: "SYSTEM_ROLE_TEMPLATE",
    },
  };
};

export const ensurePermissionTemplatesSeeded = async () => {
  await ensurePermissionCatalogSeeded();

  if (!roleKeys.length) {
    return 0;
  }

  const templateOps = roleKeys.map((roleKey) => ({
    updateOne: {
      filter: { key: normalizeRoleKey(roleKey) },
      update: {
        $set: getTemplatePayload(roleKey),
      },
      upsert: true,
    },
  }));
  await Role.bulkWrite(templateOps, { ordered: false });
  return templateOps.length;
};

export const getPermissionTemplates = async ({ includeInactive = false } = {}) => {
  const templateFilter = includeInactive ? {} : { isActive: true };
  const roles = await Role.find(templateFilter)
    .select("_id key name description scopeType isSystem isActive permissions metadata")
    .sort({ isSystem: -1, key: 1 })
    .lean();

  const permissionKeys = Array.from(
    new Set(
      roles.flatMap((role) =>
        Array.isArray(role.permissions) ? role.permissions.map(normalizePermissionKey) : []
      )
    )
  );

  const permissionRows = permissionKeys.length
    ? await Permission.find({ key: { $in: permissionKeys } })
        .select("_id key module action scopeType isSensitive isActive resourceType defaultScope")
        .lean()
    : [];
  const permissionByKey = new Map(
    permissionRows.map((row) => [normalizePermissionKey(row.key), row])
  );

  return roles.map((role) => ({
    _id: String(role._id),
    key: normalizeRoleKey(role.key),
    name: role.name,
    description: role.description || "",
    scope: role.scopeType || "BRANCH",
    scopeType: role.scopeType || "BRANCH",
    isSystem: Boolean(role.isSystem),
    isActive: Boolean(role.isActive),
    metadata: role.metadata || {},
    permissions: (role.permissions || [])
      .map((permissionKey) => permissionByKey.get(normalizePermissionKey(permissionKey)))
      .filter(Boolean)
      .map((permission) => ({
        key: normalizePermissionKey(permission.key),
        module: permission.module,
        action: permission.action,
        scopeType: permission.scopeType,
        scopeId: "",
        isSensitive: Boolean(permission.isSensitive),
        resourceType: permission.resourceType || permission.module,
        defaultScope: permission.defaultScope || permission.scopeType,
      })),
  }));
};

export default {
  ensurePermissionTemplatesSeeded,
  getPermissionTemplates,
};
