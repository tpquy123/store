import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authAPI } from "../api/auth.api";
import { useCartStore } from "@/features/cart";
import {
  getPermissionSet,
  hasPermissionSnapshot,
  isGlobalAdminAuthorization,
} from "../lib/authorization";

const normalizeBranchId = (value) => {
  if (!value) return "";
  return String(value).trim();
};

const normalizeAllowedBranchIds = (authz) => {
  const allowed = Array.isArray(authz?.allowedBranchIds) ? authz.allowedBranchIds : [];
  return [...new Set(allowed.map(normalizeBranchId).filter(Boolean))];
};

const getAuthorizationPayload = (payload = {}) => payload?.authorization || payload?.authz || null;

const isGlobalAdminContext = (user, authz) =>
  isGlobalAdminAuthorization({ user, authorization: authz });

const isBranchScopedStaff = (user, authz) => {
  if (isGlobalAdminContext(user, authz)) return false;
  return authz?.requiresBranchAssignment === true;
};

const canManageCart = (authz) =>
  hasPermissionSnapshot(authz, "cart.manage.self") || getPermissionSet(authz).has("*");

const deriveFixedBranchId = (user, authz) => {
  const allowedBranchIds = normalizeAllowedBranchIds(authz);
  const authzActiveBranchId = normalizeBranchId(authz?.activeBranchId);

  if (authzActiveBranchId) {
    if (allowedBranchIds.length === 0 || allowedBranchIds.includes(authzActiveBranchId)) {
      return authzActiveBranchId;
    }
  }

  if (allowedBranchIds.length > 0) {
    return allowedBranchIds[0];
  }

  const legacyStoreLocation = normalizeBranchId(user?.storeLocation);
  if (legacyStoreLocation) {
    return legacyStoreLocation;
  }

  return "";
};

const resolveActiveBranchId = ({ user, authz, currentActiveBranchId = "" }) => {
  const fixedBranchId = deriveFixedBranchId(user, authz);
  const simulatedBranchId = normalizeBranchId(authz?.simulatedBranchId);
  const contextMode = String(authz?.contextMode || "STANDARD").toUpperCase();

  if (isBranchScopedStaff(user, authz)) {
    return fixedBranchId || null;
  }

  if (isGlobalAdminContext(user, authz)) {
    if (contextMode === "SIMULATED" && simulatedBranchId) {
      return simulatedBranchId;
    }
    const current = normalizeBranchId(currentActiveBranchId);
    return current || fixedBranchId || null;
  }

  const current = normalizeBranchId(currentActiveBranchId);
  return current || fixedBranchId || null;
};

const resolveContextMode = (authz) => {
  const mode = String(authz?.contextMode || "STANDARD").trim().toUpperCase();
  return mode || "STANDARD";
};

const resolveSimulatedBranchId = (authz) => {
  const normalized = normalizeBranchId(authz?.simulatedBranchId);
  return normalized || null;
};

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      rehydrating: true,
      error: null,
      activeBranchId: null,
      authz: null,
      authorization: null,
      contextMode: "STANDARD",
      simulatedBranchId: null,
      finishRehydration: () => set({ rehydrating: false }),

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authAPI.login(credentials);
          const { user, token } = response.data.data;
          const authorization = getAuthorizationPayload(response.data.data);

          const activeBranchId = resolveActiveBranchId({
            user,
            authz: authorization,
            currentActiveBranchId: null,
          });

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            activeBranchId,
            authz: authorization || null,
            authorization: authorization || null,
            contextMode: resolveContextMode(authorization),
            simulatedBranchId: resolveSimulatedBranchId(authorization),
          });

          const cartStore = useCartStore.getState();
          if (canManageCart(authorization)) {
            await cartStore.fetchCartCount(token);
          } else {
            cartStore.resetCartState();
          }

          return { success: true };
        } catch (error) {
          const message = error.response?.data?.message || "Dang nhap that bai";
          set({
            error: message,
            isLoading: false,
            isAuthenticated: false,
          });
          return { success: false, message };
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          await authAPI.register(data);
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          const message = error.response?.data?.message || "Dang ky that bai";
          set({ error: message, isLoading: false });
          return { success: false, message };
        }
      },

      logout: async () => {
        try {
          await authAPI.logout();
        } catch (error) {
          console.error("Logout error:", error);
        } finally {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null,
            activeBranchId: null,
            authz: null,
            authorization: null,
            contextMode: "STANDARD",
            simulatedBranchId: null,
          });
          useCartStore.getState().resetCartState();
        }
      },

      getCurrentUser: async () => {
        const token = get().token;

        if (!token) {
          return { success: false };
        }

        try {
          const response = await authAPI.getCurrentUser();
          const { user } = response.data.data;
          const authorization = getAuthorizationPayload(response.data.data);

          const activeBranchId = resolveActiveBranchId({
            user,
            authz: authorization,
            currentActiveBranchId: get().activeBranchId,
          });

          set({
            user,
            isAuthenticated: true,
            activeBranchId,
            authz: authorization || get().authorization || get().authz,
            authorization: authorization || get().authorization || get().authz,
            contextMode: resolveContextMode(authorization || get().authorization || get().authz),
            simulatedBranchId: resolveSimulatedBranchId(authorization || get().authorization || get().authz),
          });

          const cartStore = useCartStore.getState();
          if (canManageCart(authorization || get().authorization || get().authz)) {
            await cartStore.fetchCartCount(token);
          } else {
            cartStore.resetCartState();
          }

          return { success: true };
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            activeBranchId: null,
            authz: null,
            authorization: null,
            contextMode: "STANDARD",
            simulatedBranchId: null,
          });
          useCartStore.getState().resetCartState();
          return { success: false };
        }
      },

      setActiveBranch: (branchId) => {
        const { user, authz } = get();
        if (!isGlobalAdminContext(user, authz)) {
          return;
        }

        set({ activeBranchId: normalizeBranchId(branchId) || null });
      },

      setBranchSimulation: async (branchId) => {
        const { user, authz } = get();
        if (!isGlobalAdminContext(user, authz)) {
          return { success: false, message: "Only global admin can simulate branch" };
        }

        const normalized = normalizeBranchId(branchId);
        if (!normalized) {
          return { success: false, message: "branchId is required" };
        }

        try {
          const response = await authAPI.setSimulatedBranchContext({ branchId: normalized });
          const nextAuthz = getAuthorizationPayload(response.data?.data) || authz;
          const nextActiveBranchId =
            normalizeBranchId(nextAuthz?.activeBranchId) || normalized || null;

          set({
            authz: nextAuthz || null,
            authorization: nextAuthz || null,
            activeBranchId: nextActiveBranchId,
            contextMode: resolveContextMode(nextAuthz),
            simulatedBranchId: resolveSimulatedBranchId(nextAuthz) || normalized,
          });

          return { success: true };
        } catch (error) {
          return {
            success: false,
            message: error.response?.data?.message || "Failed to simulate branch",
          };
        }
      },

      clearBranchSimulation: async () => {
        const { user, authz } = get();
        if (!isGlobalAdminContext(user, authz)) {
          return { success: false, message: "Only global admin can clear simulation" };
        }

        try {
          const response = await authAPI.clearSimulatedBranchContext();
          const nextAuthz = getAuthorizationPayload(response.data?.data) || authz;
          const nextActiveBranchId = resolveActiveBranchId({
            user,
            authz: nextAuthz,
            currentActiveBranchId: get().activeBranchId,
          });

          set({
            authz: nextAuthz || null,
            authorization: nextAuthz || null,
            activeBranchId: nextActiveBranchId,
            contextMode: resolveContextMode(nextAuthz),
            simulatedBranchId: resolveSimulatedBranchId(nextAuthz),
          });

          return { success: true };
        } catch (error) {
          return {
            success: false,
            message: error.response?.data?.message || "Failed to clear simulation",
          };
        }
      },

      changePassword: async (data) => {
        set({ isLoading: true, error: null });
        try {
          await authAPI.changePassword(data);
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          const message = error.response?.data?.message || "Doi mat khau that bai";
          set({ error: message, isLoading: false });
          return { success: false, message };
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "auth-storage",
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("auth-storage rehydrate failed:", error);
        }
        state?.finishRehydration?.();
      },
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        activeBranchId: state.activeBranchId,
        authz: state.authz,
        authorization: state.authorization,
        contextMode: state.contextMode,
        simulatedBranchId: state.simulatedBranchId,
      }),
    },
  ),
);
