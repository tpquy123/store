import Review from "./Review.js";
import {
  createReview as createReviewService,
  getReviewEligibility,
  getVerifiedProductReviews,
  recalculateVerifiedProductRating,
  updateReview as updateReviewService,
} from "./reviewService.js";
import { isReviewServiceError } from "./reviewErrors.js";
import { AUTHZ_ACTIONS } from "../../authz/actions.js";

const handleReviewError = (res, error) => {
  if (isReviewServiceError(error)) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  if (error?.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      code: "REVIEW_VALIDATION_ERROR",
      message: error.message,
    });
  }

  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      code: "REVIEW_DUPLICATE",
      message: "A review already exists for this order and product.",
    });
  }

  return res.status(500).json({
    success: false,
    code: "REVIEW_INTERNAL_ERROR",
    message: error?.message || "Internal server error.",
  });
};

export const canReviewProduct = async (req, res) => {
  try {
    const eligibility = await getReviewEligibility({
      userId: req.user._id,
      productId: req.params.productId,
    });

    return res.json({
      success: true,
      data: eligibility,
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const getProductReviews = async (req, res) => {
  try {
    const data = await getVerifiedProductReviews({
      productId: req.params.productId,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const createReview = async (req, res) => {
  try {
    const review = await createReviewService({
      userId: req.user._id,
      productId: req.body?.productId,
      orderId: req.body?.orderId,
      rating: req.body?.rating,
      comment: req.body?.comment,
      images: req.body?.images,
    });

    return res.status(201).json({
      success: true,
      message: "Review created successfully.",
      data: { review },
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const updateReview = async (req, res) => {
  try {
    const review = await updateReviewService({
      reviewId: req.params.id,
      userId: req.user._id,
      rating: req.body?.rating,
      comment: req.body?.comment,
      images: req.body?.images,
    });

    return res.json({
      success: true,
      message: "Review updated successfully.",
      data: { review },
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        code: "REVIEW_NOT_FOUND",
        message: "Review not found.",
      });
    }

    const isAuthor = String(review.userId) === String(req.user._id);
    const canModerate = req.authz?.permissions?.has(AUTHZ_ACTIONS.REVIEW_MODERATE);

    if (!isAuthor && !canModerate) {
      return res.status(403).json({
        success: false,
        code: "REVIEW_DELETE_FORBIDDEN",
        message: "You are not allowed to delete this review.",
      });
    }

    const productId = review.productId;
    await review.deleteOne();
    await recalculateVerifiedProductRating(productId);

    return res.json({
      success: true,
      message: "Review deleted successfully.",
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const likeReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        code: "REVIEW_NOT_FOUND",
        message: "Review not found.",
      });
    }

    const userId = String(req.user._id);
    const hasLiked = review.likedBy.some((id) => String(id) === userId);

    if (hasLiked) {
      review.likedBy = review.likedBy.filter((id) => String(id) !== userId);
      review.helpful = Math.max(0, Number(review.helpful || 0) - 1);
    } else {
      review.likedBy.push(req.user._id);
      review.helpful = Number(review.helpful || 0) + 1;
    }

    await review.save();

    return res.json({
      success: true,
      message: hasLiked ? "Review unliked." : "Review liked.",
      data: {
        review,
        hasLiked: !hasLiked,
        helpful: review.helpful,
      },
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const replyToReview = async (req, res) => {
  try {
    const content = String(req.body?.content || "").trim();
    if (!content) {
      return res.status(400).json({
        success: false,
        code: "REVIEW_REPLY_REQUIRED",
        message: "Reply content is required.",
      });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        code: "REVIEW_NOT_FOUND",
        message: "Review not found.",
      });
    }

    review.adminReply = {
      content,
      adminId: req.user._id,
      repliedAt: new Date(),
    };

    await review.save();
    await review.populate("adminReply.adminId", "fullName role avatar");

    return res.json({
      success: true,
      message: "Reply saved.",
      data: { review },
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const updateAdminReply = async (req, res) => {
  try {
    const content = String(req.body?.content || "").trim();
    if (!content) {
      return res.status(400).json({
        success: false,
        code: "REVIEW_REPLY_REQUIRED",
        message: "Reply content is required.",
      });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        code: "REVIEW_NOT_FOUND",
        message: "Review not found.",
      });
    }

    if (!review.adminReply?.content) {
      return res.status(400).json({
        success: false,
        code: "REVIEW_REPLY_NOT_FOUND",
        message: "No existing admin reply to update.",
      });
    }

    review.adminReply.content = content;
    review.adminReply.repliedAt = new Date();

    await review.save();
    await review.populate("adminReply.adminId", "fullName role avatar");

    return res.json({
      success: true,
      message: "Reply updated.",
      data: { review },
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export const toggleReviewVisibility = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        code: "REVIEW_NOT_FOUND",
        message: "Review not found.",
      });
    }

    review.isHidden = !review.isHidden;
    await review.save();
    await recalculateVerifiedProductRating(review.productId);

    return res.json({
      success: true,
      message: review.isHidden ? "Review hidden." : "Review visible.",
      data: { review },
    });
  } catch (error) {
    return handleReviewError(res, error);
  }
};

export default {
  canReviewProduct,
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  likeReview,
  replyToReview,
  updateAdminReply,
  toggleReviewVisibility,
};
