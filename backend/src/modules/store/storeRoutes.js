import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import {
  getAllStores,
  getNearbyStores,
  getStoreById,
  checkStoreStock,
  createStore,
  updateStore,
  deleteStore,
} from "./storeController.js";

const router = express.Router();

router.use(protect, resolveAccessContext);

const resolveStoreScopeMode = (req) => (req?.authz?.isGlobalAdmin ? "global" : "branch");
const requireStoreManage = authorize(AUTHZ_ACTIONS.STORE_MANAGE, {
  scopeMode: resolveStoreScopeMode,
  requireActiveBranchFor: ["branch"],
  resourceType: "STORE",
});
const requireStoreListRead = authorize(null, {
  anyOf: [AUTHZ_ACTIONS.STORE_MANAGE, AUTHZ_ACTIONS.ORDERS_READ],
  scopeMode: resolveStoreScopeMode,
  resourceType: "STORE",
});
const requireStoreDetailRead = authorize(null, {
  anyOf: [AUTHZ_ACTIONS.STORE_MANAGE, AUTHZ_ACTIONS.INVENTORY_READ],
  scopeMode: resolveStoreScopeMode,
  resourceType: "STORE",
});

router.get("/", requireStoreListRead, getAllStores);
router.get("/nearby", getNearbyStores);
router.get("/:id", requireStoreDetailRead, getStoreById);
router.post("/:storeId/check-stock", checkStoreStock);

// Admin only routes — resolveAccessContext must come after restrictTo so that
// BranchContext (scopeMode="global" for GLOBAL_ADMIN) is available to
// branchIsolationPlugin when the controller queries branch-scoped models.
router.post("/", requireStoreManage, createStore);
router.put("/:id", requireStoreManage, updateStore);
router.delete("/:id", requireStoreManage, deleteStore);

export default router;
