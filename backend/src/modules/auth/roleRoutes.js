import express from "express";
import { protect } from "../../middleware/authMiddleware.js";
import resolveAccessContext from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import {
  listRoles,
  createRole,
  getRole,
  updateRole,
  patchRole,
} from "./roleController.js";

const router = express.Router();

router.use(protect, resolveAccessContext);
router.use(
  authorize(AUTHZ_ACTIONS.USERS_MANAGE_GLOBAL, {
    scopeMode: "global",
    resourceType: "ROLE",
  })
);

router.get("/", listRoles);
router.post("/", createRole);
router.get("/:key", getRole);
router.put("/:key", updateRole);
router.patch("/:key", patchRole);

export default router;
