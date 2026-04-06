import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { protect } from "../../middleware/authMiddleware.js";
import { resolveAccessContext } from "../../middleware/authz/resolveAccessContext.js";
import { authorize } from "../../middleware/authz/authorize.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";
import {
  canReviewProduct,
  createReview,
  deleteReview,
  getProductReviews,
  likeReview,
  replyToReview,
  toggleReviewVisibility,
  updateAdminReply,
  updateReview,
} from "./reviewController.js";
import { getReviewUploadSignature } from "./reviewUploadController.js";

const router = express.Router();

const buildRateLimitKey = (req) => {
  const userId = req?.user?._id ? String(req.user._id) : "anonymous";
  return `${userId}:${ipKeyGenerator(req.ip || "")}`;
};

const reviewUploadSignatureLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: buildRateLimitKey,
  message: {
    success: false,
    code: "REVIEW_UPLOAD_SIGNATURE_RATE_LIMIT",
    message: "Too many upload signature requests. Please try again in 1 minute.",
  },
});

// Prevent review spam while still allowing normal usage.
const createReviewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: buildRateLimitKey,
  message: {
    success: false,
    code: "REVIEW_CREATE_RATE_LIMIT",
    message: "Too many review submissions. Please try again later.",
  },
});

router.get("/product/:productId", getProductReviews);

router.get(
  "/can-review/:productId",
  protect,
  resolveAccessContext,
  authorize(AUTHZ_ACTIONS.REVIEW_CREATE_SELF, {
    scopeMode: "self",
    resourceType: "REVIEW",
  }),
  canReviewProduct
);

const resolveReviewModerationScope = (req) =>
  req.authz?.isGlobalAdmin ? "global" : "branch";
const resolveReviewUploadScope = (req) =>
  req.authz?.permissions?.has(AUTHZ_ACTIONS.REVIEW_MODERATE)
    ? resolveReviewModerationScope(req)
    : "self";

router.use(protect, resolveAccessContext);

router.post(
  "/upload/signature",
  authorize(null, {
    anyOf: [AUTHZ_ACTIONS.REVIEW_UPLOAD_SELF, AUTHZ_ACTIONS.REVIEW_MODERATE],
    scopeMode: resolveReviewUploadScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "REVIEW",
  }),
  reviewUploadSignatureLimiter,
  getReviewUploadSignature
);

router.post(
  "/",
  authorize(AUTHZ_ACTIONS.REVIEW_CREATE_SELF, {
    scopeMode: "self",
    resourceType: "REVIEW",
  }),
  createReviewLimiter,
  createReview
);
router.put(
  "/:id",
  authorize(AUTHZ_ACTIONS.REVIEW_UPDATE_SELF, {
    scopeMode: "self",
    resourceType: "REVIEW",
  }),
  updateReview
);

router.delete(
  "/:id",
  authorize(null, {
    anyOf: [AUTHZ_ACTIONS.REVIEW_DELETE_SELF, AUTHZ_ACTIONS.REVIEW_MODERATE],
    scopeMode: resolveReviewUploadScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "REVIEW",
  }),
  deleteReview
);
router.post(
  "/:id/like",
  authorize(AUTHZ_ACTIONS.REVIEW_LIKE_SELF, {
    scopeMode: "self",
    resourceType: "REVIEW",
  }),
  likeReview
);

router.post(
  "/:id/reply",
  authorize(AUTHZ_ACTIONS.REVIEW_REPLY, {
    scopeMode: resolveReviewModerationScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "REVIEW",
  }),
  replyToReview
);
router.put(
  "/:id/reply",
  authorize(AUTHZ_ACTIONS.REVIEW_REPLY, {
    scopeMode: resolveReviewModerationScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "REVIEW",
  }),
  updateAdminReply
);
router.patch(
  "/:id/toggle-visibility",
  authorize(AUTHZ_ACTIONS.REVIEW_MODERATE, {
    scopeMode: resolveReviewModerationScope,
    requireActiveBranchFor: ["branch"],
    resourceType: "REVIEW",
  }),
  toggleReviewVisibility
);

export default router;
