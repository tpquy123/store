import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

console.info("🚀 [HTTP Setup] Kích hoạt API Client với cấu hình:", {
  env_VITE_API_URL: import.meta.env.VITE_API_URL,
  mode: import.meta.env.MODE,
  isProd: import.meta.env.PROD,
  finalBaseUrl: BASE_URL,
});

const normalizeBranchId = (value) => {
  if (!value) return "";
  return String(value).trim();
};

const toAllowedBranchIds = (authz) => {
  const raw = Array.isArray(authz?.allowedBranchIds) ? authz.allowedBranchIds : [];
  return [...new Set(raw.map(normalizeBranchId).filter(Boolean))];
};

const resolveAuthorizationState = (state) => state?.authorization || state?.authz || null;

const isGlobalAdminState = (state) => {
  const authz = resolveAuthorizationState(state);
  return Boolean(authz?.isGlobalAdmin);
};

const isBranchScopedStaffState = (state) => {
  const authz = resolveAuthorizationState(state);
  if (isGlobalAdminState(state)) return false;
  return authz?.requiresBranchAssignment === true;
};

const deriveFixedBranchIdFromState = (state) => {
  const authz = resolveAuthorizationState(state);
  const allowedBranchIds = toAllowedBranchIds(authz);
  const authzActiveBranchId = normalizeBranchId(authz?.activeBranchId);

  if (authzActiveBranchId) {
    if (allowedBranchIds.length === 0 || allowedBranchIds.includes(authzActiveBranchId)) {
      return authzActiveBranchId;
    }
  }

  if (allowedBranchIds.length > 0) {
    return allowedBranchIds[0];
  }
  return "";
};

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const authStorage = localStorage.getItem("auth-storage");
    if (authStorage) {
      try {
        const { state } = JSON.parse(authStorage);
        const token = state?.token;
        const authz = resolveAuthorizationState(state);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        const allowedBranchIds = toAllowedBranchIds(authz);
        const fixedBranchId = deriveFixedBranchIdFromState(state);
        const mutableBranchId = normalizeBranchId(state?.activeBranchId);
        const contextMode = String(
          state?.contextMode || authz?.contextMode || "STANDARD",
        )
          .trim()
          .toUpperCase();
        const simulatedBranchId = normalizeBranchId(
          state?.simulatedBranchId || authz?.simulatedBranchId,
        );

        let activeBranchId = "";
        if (isBranchScopedStaffState(state)) {
          activeBranchId = fixedBranchId;
        } else if (
          isGlobalAdminState(state) &&
          contextMode === "SIMULATED" &&
          simulatedBranchId
        ) {
          activeBranchId = simulatedBranchId;
        } else if (mutableBranchId) {
          activeBranchId = mutableBranchId;
        } else {
          activeBranchId = fixedBranchId;
        }

        if (
          activeBranchId &&
          allowedBranchIds.length > 0 &&
          !allowedBranchIds.includes(activeBranchId) &&
          !isGlobalAdminState(state)
        ) {
          activeBranchId = fixedBranchId;
        }

        if (activeBranchId) {
          config.headers["X-Active-Branch-Id"] = activeBranchId;
        }

        if (
          isGlobalAdminState(state) &&
          contextMode === "SIMULATED" &&
          simulatedBranchId
        ) {
          config.headers["X-Simulate-Branch-Id"] = simulatedBranchId;
        } else if (config.headers["X-Simulate-Branch-Id"]) {
          delete config.headers["X-Simulate-Branch-Id"];
        }
      } catch (error) {
        console.error("Error parsing auth-storage:", error);
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 🔍 Thêm log chi tiết cho Production Debug
    console.error("🚨 [HTTP interceptor] Lỗi gọi API:", {
      message: error?.message,
      code: error?.code,               // Mã lỗi (VD: ERR_NETWORK, ECONNREFUSED)
      name: error?.name,               // Tên nhóm lỗi (VD: AxiosError)
      url: error?.config?.url,
      method: error?.config?.method,
      baseURL: error?.config?.baseURL, // Kiểm tra lại chính xác URL ghép vào là gì
      status: error?.response?.status,
      data: error?.response?.data,
      isAxiosError: error?.isAxiosError,
      isBrowserOnline: typeof navigator !== 'undefined' ? navigator.onLine : 'unknown'
    });

    if (
      error.response?.status === 401 &&
      !String(error.config?.url || "").includes("/auth/login")
    ) {
      localStorage.removeItem("auth-storage");
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }

    return Promise.reject(error);
  },
);

export default api;
