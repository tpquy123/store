// ============================================
// FILE: backend/src/modules/product/legacyProductRoutes.js
// Compatibility routes for legacy category endpoints
// ============================================

import express from "express";
import ProductType from "../productType/ProductType.js";
import controller from "./universalProductController.js";

const LEGACY_TYPE_MAP = {
  iphones: {
    slugs: ["iphone", "smartphone"],
    names: ["iphone", "smartphone"],
    searchHint: "iphone",
  },
  ipads: {
    slugs: ["ipad", "tablet"],
    names: ["ipad", "tablet"],
    searchHint: "ipad",
  },
  macs: {
    slugs: ["mac", "macbook", "laptop"],
    names: ["mac", "macbook", "laptop"],
    searchHint: "mac",
  },
  airpods: {
    slugs: ["airpods", "headphone", "earbud", "earbuds"],
    names: ["airpods", "headphone", "tai nghe", "earbud", "earbuds"],
    searchHint: "airpods",
  },
  applewatches: {
    slugs: ["applewatch", "smartwatch", "watch"],
    names: ["apple watch", "smartwatch", "watch"],
    searchHint: "apple watch",
  },
  accessories: {
    slugs: ["accessories", "accessory", "phu-kien", "phu kien"],
    names: ["accessories", "accessory", "phu kien", "phu-kien"],
    searchHint: "phu kien",
  },
};

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildAlternationRegex = (tokens = []) => {
  const cleaned = (Array.isArray(tokens) ? tokens : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map(escapeRegex);
  if (!cleaned.length) return null;
  return new RegExp(`(${cleaned.join("|")})`, "i");
};

const resolveProductTypeId = async (legacyKey) => {
  const mapping = LEGACY_TYPE_MAP[legacyKey];
  if (!mapping) return null;

  const slugRegex = buildAlternationRegex(mapping.slugs);
  if (slugRegex) {
    const bySlug = await ProductType.findOne({ slug: slugRegex })
      .select("_id")
      .lean();
    if (bySlug?._id) return bySlug._id;
  }

  const nameRegex = buildAlternationRegex(mapping.names);
  if (nameRegex) {
    const byName = await ProductType.findOne({ name: nameRegex })
      .select("_id")
      .lean();
    if (byName?._id) return byName._id;
  }

  return null;
};

export const createLegacyProductRouter = (legacyKey) => {
  const router = express.Router();
  const mapping = LEGACY_TYPE_MAP[legacyKey];

  router.get("/", async (req, res, next) => {
    try {
      const productTypeId = await resolveProductTypeId(legacyKey);
      if (productTypeId) {
        req.query.productType = String(productTypeId);
      } else if (!req.query.search && mapping?.searchHint) {
        req.query.search = mapping.searchHint;
      }
      return controller.findAll(req, res, next);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:id", (req, res, next) => {
    const { id } = req.params;
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      return controller.findOne(req, res, next);
    }
    return controller.getProductDetail(req, res, next);
  });

  return router;
};

export default createLegacyProductRouter;
