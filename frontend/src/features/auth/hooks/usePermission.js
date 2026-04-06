import { useMemo } from "react";
import { useAuthStore } from "../state/auth.store";
import {
  getAuthorizationSnapshot,
  hasPermissionSnapshot,
  isGlobalAdminAuthorization,
} from "../lib/authorization";

export const usePermission = (required, options = {}) => {
  const { user, authz, authorization } = useAuthStore();

  const snapshot = useMemo(
    () => getAuthorizationSnapshot({ authz, authorization }),
    [authz, authorization],
  );
  const isGlobalAdmin = isGlobalAdminAuthorization({ user, authz, authorization });

  if (isGlobalAdmin) return true;
  return hasPermissionSnapshot(snapshot, required, options);
};

export default usePermission;
