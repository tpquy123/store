export { authAPI } from "./api/auth.api";
export { default as PermissionGate } from "./components/PermissionGate";
export { default as StepUpModal } from "./components/StepUpModal";
export { default as SensitiveAction } from "./components/SensitiveAction";
export { default as LoginPage } from "./pages/LoginPage";
export { default as RegisterPage } from "./pages/RegisterPage";
export { useAuthStore } from "./state/auth.store";
export { usePermission } from "./hooks/usePermission";
export { useStepUp } from "./hooks/useStepUp";
export {
  isActionSensitive,
  getGracePeriodExpiry,
  SENSITIVE_ACTIONS,
} from "./lib/authorization";
