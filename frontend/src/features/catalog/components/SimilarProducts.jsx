import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { universalProductAPI } from "../api/catalog.api";

const PRODUCT_TYPE_TO_ROUTE_MAP = {
  smartphone: "dien-thoai",
  tablet: "may-tinh-bang",
  laptop: "macbook",
  smartwatch: "apple-watch",
  headphone: "tai-nghe",
  tv: "tivi",
  monitor: "man-hinh",
  keyboard: "ban-phim",
  mouse: "chuot",
  speaker: "loa",
  camera: "may-anh",
  "gaming-console": "may-choi-game",
  accessories: "phu-kien",
};

const CATEGORY_TO_PRODUCT_TYPE_SLUG_MAP = {
  iPhone: "smartphone",
  iPad: "tablet",
  Mac: "laptop",
  AirPods: "headphone",
  AppleWatch: "smartwatch",
  Accessory: "accessories",
  Accessories: "accessories",
};

const PRODUCT_TYPE_ALIAS_MAP = {
  smartphone: "smartphone",
  phone: "smartphone",
  iphone: "smartphone",
  tablet: "tablet",
  ipad: "tablet",
  laptop: "laptop",
  mac: "laptop",
  macbook: "laptop",
  notebook: "laptop",
  smartwatch: "smartwatch",
  "apple watch": "smartwatch",
  applewatch: "smartwatch",
  watch: "smartwatch",
  headphone: "headphone",
  headphones: "headphone",
  airpod: "headphone",
  airpods: "headphone",
  earbud: "headphone",
  earbuds: "headphone",
  accessories: "accessories",
  accessory: "accessories",
};

const CATEGORY_ALIAS_MAP = {
  iphone: "iPhone",
  smartphone: "iPhone",
  phone: "iPhone",
  "dien-thoai": "iPhone",
  "dien thoai": "iPhone",
  ipad: "iPad",
  tablet: "iPad",
  "may-tinh-bang": "iPad",
  "may tinh bang": "iPad",
  mac: "Mac",
  macbook: "Mac",
  laptop: "Mac",
  notebook: "Mac",
  airpods: "AirPods",
  airpod: "AirPods",
  headphone: "AirPods",
  headphones: "AirPods",
  earbud: "AirPods",
  earbuds: "AirPods",
  "tai-nghe": "AirPods",
  "tai nghe": "AirPods",
  applewatch: "AppleWatch",
  "apple watch": "AppleWatch",
  smartwatch: "AppleWatch",
  watch: "AppleWatch",
  "dong-ho-thong-minh": "AppleWatch",
  "dong ho thong minh": "AppleWatch",
  accessory: "Accessory",
  accessories: "Accessories",
  "phu-kien": "Accessories",
  "phu kien": "Accessories",
};

const TYPO_MAPPINGS = {
  ip: "iphone",
  ifone: "iphone",
  iphon: "iphone",
  promax: "pro max",
  iapd: "ipad",
  pad: "ipad",
  macbok: "macbook",
  mb: "macbook",
  mba: "macbook air",
  mbp: "macbook pro",
  airpod: "airpods",
  aripod: "airpods",
  wach: "apple watch",
  wacth: "apple watch",
  aw: "apple watch",
};

const normalizeCategory = (category, productType) => {
  let catStr = "";

  if (typeof category === "string" && category.trim()) {
    catStr = category;
  } else if (productType && typeof productType === "object") {
    catStr = productType.slug || productType.name || "";
  } else if (typeof productType === "string") {
    catStr = productType;
  }

  if (!catStr) return null;

  const normalizedInput = catStr.toLowerCase().trim();
  return CATEGORY_ALIAS_MAP[normalizedInput] || catStr;
};

const resolveProductTypeSlug = (productType, normalizedCategory) => {
  if (productType && typeof productType === "object") {
    const normalizedValue = String(productType.slug || productType.name || "")
      .trim()
      .toLowerCase();
    if (PRODUCT_TYPE_ALIAS_MAP[normalizedValue]) {
      return PRODUCT_TYPE_ALIAS_MAP[normalizedValue];
    }
  }

  if (typeof productType === "string") {
    const normalizedValue = productType.trim().toLowerCase();
    if (PRODUCT_TYPE_ALIAS_MAP[normalizedValue]) {
      return PRODUCT_TYPE_ALIAS_MAP[normalizedValue];
    }
  }

  if (normalizedCategory && CATEGORY_TO_PRODUCT_TYPE_SLUG_MAP[normalizedCategory]) {
    return CATEGORY_TO_PRODUCT_TYPE_SLUG_MAP[normalizedCategory];
  }

  return null;
};

const extractProductTypeId = (productType) => {
  if (!productType || typeof productType !== "object" || !productType._id) {
    return null;
  }
  return String(productType._id);
};

const extractProductsFromResponse = (response) => {
  const payload = response?.data;

  if (Array.isArray(payload?.data?.products)) return payload.data.products;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;

  return [];
};

const resolveRouteFromProductType = (productType, fallbackRoute = "products") => {
  const productTypeSlug = resolveProductTypeSlug(productType, null);
  if (productTypeSlug && PRODUCT_TYPE_TO_ROUTE_MAP[productTypeSlug]) {
    return PRODUCT_TYPE_TO_ROUTE_MAP[productTypeSlug];
  }
  return fallbackRoute;
};

const correctTypos = (input) => {
  if (!input) return "";

  let corrected = input.toLowerCase().trim();
  if (TYPO_MAPPINGS[corrected]) return TYPO_MAPPINGS[corrected];

  Object.keys(TYPO_MAPPINGS).forEach((key) => {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    if (regex.test(corrected)) {
      corrected = corrected.replace(regex, TYPO_MAPPINGS[key]);
    }
  });

  return corrected;
};

const tokenizeQuery = (query) => {
  if (!query) return [];

  const corrected = correctTypos(query);
  const tokens = corrected.toLowerCase().trim().split(/\s+/);
  const stopWords = ["the", "a", "an", "and", "or", "cua", "cho", "voi", "va"];

  return tokens.filter((token) => !stopWords.includes(token) && token.length > 0);
};

const calculateRelevanceScore = (productName, baseName) => {
  const name = String(productName || "").toLowerCase();
  const base = String(baseName || "").toLowerCase();

  if (!name || !base) return 0;

  const nameTokens = tokenizeQuery(productName);
  const baseTokens = tokenizeQuery(baseName);
  if (nameTokens.length === 0 || baseTokens.length === 0) return 0;

  let score = 0;
  let matchedTokens = 0;

  if (name === base) return 100;

  baseTokens.forEach((baseToken) => {
    nameTokens.forEach((nameToken) => {
      if (nameToken === baseToken) {
        matchedTokens += 1;
        score += 30;
        if (name.startsWith(baseToken)) {
          score += 15;
        }
      } else if (nameToken.includes(baseToken) || baseToken.includes(nameToken)) {
        matchedTokens += 1;
        score += 15;
      }
    });
  });

  const matchRatio = matchedTokens / Math.max(baseTokens.length, nameTokens.length);
  if (matchRatio >= 0.8) {
    score += 20;
  } else if (matchRatio >= 0.5) {
    score += 10;
  }

  if (name.includes(base)) {
    score += 25;
  }

  const modelRegex = /(\w+\s+\d+)\s*(pro|max|plus|mini|air)?/i;
  const nameMatch = name.match(modelRegex);
  const baseMatch = base.match(modelRegex);

  if (nameMatch && baseMatch) {
    if (nameMatch[1] === baseMatch[1]) {
      score += 40;
    } else if (nameMatch[1].split(" ")[0] === baseMatch[1].split(" ")[0]) {
      score += 20;
    }
  }

  const lengthDiff = Math.abs(name.length - base.length);
  if (lengthDiff > 30) {
    score -= 10;
  }

  return Math.min(Math.max(score, 0), 100);
};

const SimilarProducts = ({ productId, category, currentProduct }) => {
  const [similarProducts, setSimilarProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSimilarProducts = async () => {
      if (!productId) {
        setSimilarProducts([]);
        setIsLoading(false);
        return;
      }

      if (!category && !currentProduct?.productType) {
        setSimilarProducts([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const normalizedCat = normalizeCategory(category, currentProduct?.productType);
        const currentProductTypeSlug = resolveProductTypeSlug(
          currentProduct?.productType,
          normalizedCat
        );
        const currentProductTypeId = extractProductTypeId(currentProduct?.productType);

        const query = { limit: 100 };
        if (currentProductTypeId) {
          query.productType = currentProductTypeId;
        }

        const response = await universalProductAPI.getAll(query);
        let products = extractProductsFromResponse(response);

        if (!Array.isArray(products)) {
          products = [];
        }

        if (!currentProductTypeId && currentProductTypeSlug) {
          const filtered = products.filter(
            (item) =>
              resolveProductTypeSlug(item?.productType, null) ===
              currentProductTypeSlug
          );
          if (filtered.length > 0) {
            products = filtered;
          }
        }

        const categoryRoute =
          PRODUCT_TYPE_TO_ROUTE_MAP[currentProductTypeSlug] || "products";

        products = products.filter((p) => String(p?._id) !== String(productId));

        const productsWithScore = products.map((product) => {
          const itemNormalizedCategory = normalizeCategory(
            product?.category,
            product?.productType
          );
          const itemRoute = resolveRouteFromProductType(
            product?.productType,
            categoryRoute
          );

          return {
            ...product,
            _relevanceScore: calculateRelevanceScore(
              product?.name || product?.model,
              currentProduct?.name || currentProduct?.model || ""
            ),
            _category: itemRoute,
            _categoryName: itemNormalizedCategory || normalizedCat || category,
          };
        });

        productsWithScore.sort((a, b) => {
          if (b._relevanceScore !== a._relevanceScore) {
            return b._relevanceScore - a._relevanceScore;
          }

          if ((b.averageRating || 0) !== (a.averageRating || 0)) {
            return (b.averageRating || 0) - (a.averageRating || 0);
          }

          if ((b.salesCount || 0) !== (a.salesCount || 0)) {
            return (b.salesCount || 0) - (a.salesCount || 0);
          }

          return 0;
        });

        const topProducts = productsWithScore.slice(0, 10);

        if (!cancelled) {
          setSimilarProducts(topProducts);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[SimilarProducts] Error:", err);
          setError(err?.message || "Failed to load similar products");
          setSimilarProducts([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSimilarProducts();

    return () => {
      cancelled = true;
    };
  }, [productId, category, currentProduct]);

  const scroll = (direction) => {
    if (!scrollContainerRef.current) return;

    const scrollAmount = 300;
    const newPosition =
      direction === "left"
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;

    scrollContainerRef.current.scrollTo({
      left: newPosition,
      behavior: "smooth",
    });
    setScrollPosition(newPosition);
  };

  const handleProductClick = (product) => {
    const targetSlug = product?.baseSlug || product?.slug;
    if (!targetSlug) {
      console.warn("[SimilarProducts] Product missing slug", product);
      return;
    }

    const selectedVariant =
      product?.variants?.find((variant) => variant?.stock > 0) ||
      product?.variants?.[0];

    const sku = selectedVariant?.sku;
    let url = `/${product?._category || "products"}/${targetSlug}`;

    if (sku) {
      url += `?sku=${sku}`;
    }

    window.location.href = url;
  };

  if (isLoading) {
    return (
      <div className="py-8">
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
        </div>
      </div>
    );
  }

  if (error) {
    console.warn("[SimilarProducts] Error state:", error);
    return null;
  }

  if (!similarProducts || similarProducts.length === 0) {
    return null;
  }

  return (
    <div className="py-8 bg-white rounded-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Có thể bạn cũng thích</h2>
          <div className="flex gap-2">
            <button
              onClick={() => scroll("left")}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-4 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {similarProducts.map((product) => (
            <div
              key={product._id}
              className="flex-shrink-0 w-[280px] cursor-pointer"
              onClick={() => handleProductClick(product)}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>

        <style>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
    </div>
  );
};

export default SimilarProducts;
