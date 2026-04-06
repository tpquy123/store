import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore, usePermission } from "@/features/auth";
import {
  isGlobalAdminAuthorization,
  resolveHomeRoute,
} from "@/features/auth/lib/authorization";
import { Loading } from "@/shared/ui/Loading";

const ProtectedRoute = ({ children, allowedPermissions }) => {
  const { isAuthenticated, user, authz, authorization, rehydrating } = useAuthStore();
  const hasAllowedPermission = usePermission(allowedPermissions || [], { mode: "any" });
  const hasPermissionRules =
    Array.isArray(allowedPermissions) && allowedPermissions.length > 0;

  if (rehydrating) return <Loading />;
  if (!isAuthenticated || !user) return <Navigate to="/" replace />;

  if (isGlobalAdminAuthorization({ user, authz, authorization })) {
    return children;
  }

  if (!hasPermissionRules) {
    return children;
  }

  if (hasAllowedPermission) {
    return children;
  }

  return <Navigate to={resolveHomeRoute({ user, authz, authorization }) || "/"} replace />;
};

export default ProtectedRoute;
