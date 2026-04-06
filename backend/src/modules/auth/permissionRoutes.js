import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import resolveAccessContext from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import {
  listPermissions,
  createPermission,
  getPermission,
  updatePermission,
  patchPermission,
} from "./permissionController.js";

const router = express.Router();

router.use(protect, resolveAccessContext);
router.use(
  authorize(AUTHZ_ACTIONS.USERS_MANAGE_GLOBAL, {
    scopeMode: "global",
    resourceType: "PERMISSION",
  })
);

router.get("/", listPermissions);
router.post("/", createPermission);
router.get("/:id", getPermission);
router.put("/:id", updatePermission);
router.patch("/:id", patchPermission);

export default router;
