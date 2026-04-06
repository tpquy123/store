// ============================================
// FILE: backend/src/routes/homePageRoutes.js
// Routes for homepage layout management
// ============================================

import express from "express";
import {
  getActiveLayout,
  updateLayout,
  toggleSection,
  reorderSections,
  updateSectionConfig,
  uploadBannerImage,
  deleteBannerImage,
  resetToDefault,
} from "./homePageController.js";
import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import { uploadBanner } from "../../middleware/uploadBanner.js";

const router = express.Router();

// Public route - get active layout
router.get("/layout", getActiveLayout);

// Admin routes - protected
router.use(
  protect,
  resolveAccessContext,
  authorize(AUTHZ_ACTIONS.CONTENT_MANAGE, {
    scopeMode: (req) => (req.authz?.isGlobalAdmin ? "global" : "branch"),
    requireActiveBranchFor: ["branch"],
    resourceType: "CONTENT",
  })
);

router.put("/layout", updateLayout);
router.patch("/sections/:sectionId/toggle", toggleSection);
router.put("/sections/reorder", reorderSections);
router.patch("/sections/:sectionId/config", updateSectionConfig);
router.post("/upload-banner", uploadBanner.single("image"), uploadBannerImage);
router.delete("/banner", deleteBannerImage);
router.post("/reset-default", resetToDefault);

export default router;
