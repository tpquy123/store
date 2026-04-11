import React from "react";
import { usePermission } from "../hooks/usePermission";
import { useAuthStore } from "../state/auth.store";

/**
 * PermissionGate — Kiểm soát hiển thị component theo permission.
 *
 * Props mới so với bản cũ:
 *   - skeleton: ReactNode — hiện khi authz đang rehydrate
 *   - requiresStepUp: boolean — thêm visual indicator 🔐
 *   - onStepUpRequired: Function — callback khi cần step-up
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Nội dung hiển thị nếu có quyền
 * @param {React.ReactNode} [props.fallback=null] - Nội dung khi không có quyền
 * @param {React.ReactNode} [props.skeleton=null] - Skeleton khi đang load authz
 * @param {string} [props.permission] - Single permission key
 * @param {string[]} [props.permissions] - Array of permission keys (any)
 * @param {string[]} [props.anyOf] - Cho phép nếu có ít nhất 1
 * @param {string[]} [props.allOf] - Cho phép nếu có tất cả
 * @param {boolean} [props.requiresStepUp=false] - Thêm 🔐 badge
 * @param {Function} [props.onStepUpRequired] - Callback khi cần step-up
 */
const PermissionGate = ({
  children,
  fallback = null,
  skeleton = null,
  permission,
  permissions,
  anyOf,
  allOf,
  requiresStepUp = false,
  onStepUpRequired,
}) => {
  const { rehydrating } = useAuthStore();
  const required = allOf?.length ? allOf : anyOf?.length ? anyOf : permissions || permission;
  const mode = allOf?.length ? "all" : "any";
  const allowed = usePermission(required, { mode });

  // Hiện skeleton trong khi authz đang được rehydrate từ localStorage
  if (rehydrating && skeleton) return <>{skeleton}</>;

  if (!allowed) return fallback;

  // Nếu action cần step-up → bọc thêm badge indicator
  if (requiresStepUp) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        {children}
        <span
          title="Thao tác này yêu cầu xác minh bổ sung (OTP)"
          style={{
            position: "absolute",
            top: "-6px",
            right: "-6px",
            fontSize: "12px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "default",
            userSelect: "none",
            lineHeight: 1,
          }}
        >
          🔐
        </span>
      </div>
    );
  }

  return <>{children}</>;
};

export default PermissionGate;
