import React from "react";
import { usePermission } from "../hooks/usePermission";

const PermissionGate = ({
  children,
  fallback = null,
  permission,
  permissions,
  anyOf,
  allOf,
}) => {
  const required = allOf?.length ? allOf : anyOf?.length ? anyOf : permissions || permission;
  const mode = allOf?.length ? "all" : "any";
  const allowed = usePermission(required, { mode });

  if (!allowed) return fallback;
  return <>{children}</>;
};

export default PermissionGate;
