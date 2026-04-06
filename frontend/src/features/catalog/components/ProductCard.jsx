// FILE: frontend/src/components/shared/ProductCard.jsx
// ✅ Redesigned UI with smart variant overflow handling

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Star, ShoppingCart, Edit2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPrice } from "@/shared/lib/utils";
import { useCartStore } from "@/features/cart";
import { useAuthStore, usePermission } from "@/features/auth";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

// ============================================================================
// MAPPINGS
// ============================================================================
const CATEGORY_TO_TYPE_MAP = {
  iPhone: "iPhone",
  iPad: "iPad",
  Mac: "Mac",
  AirPods: "AirPods",
  AppleWatch: "AppleWatch",
  Accessories: "Accessory",
};

const VARIANT_KEY_FIELD = {
  iPhone: "storage",
  iPad: "storage",
  Mac: "storage",
  AirPods: "variantName",
  AppleWatch: "variantName",
  Accessories: "variantName",
};

const PRODUCT_TYPE_TO_CATEGORY = {
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

// ============================================================================
// HELPERS
// ============================================================================
const normalizeStorageValue = (value) => {
  if (!value) return null;
  const str = String(value).trim().toUpperCase();
  const match = str.match(/(\d+(?:\.\d+)?)\s*(GB|TB)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] === "TB" ? amount * 1024 : amount;
};

const getVariantStorageValue = (variant) => {
  if (!variant) return null;
  const byStorage = normalizeStorageValue(variant.storage);
  if (Number.isFinite(byStorage)) return byStorage;
  return normalizeStorageValue(variant.variantName);
};

const isUsableVariant = (variant, baseSlug) =>
  Boolean(variant?.sku && (variant?.slug || baseSlug));

// ============================================================================
// COMPONENT: VariantPills — with overflow scroll + arrows
// Giải pháp cho tên biến thể quá dài / quá nhiều
// ============================================================================
// ============================================================================
// COMPONENT: VariantPills
// Tất cả pills nằm trên 1 hàng scrollable.
// Mũi tên ← → chỉ hiện khi thực sự có thể scroll về hướng đó.
// ============================================================================
const VariantPills = ({ options, selectedKey, onSelect }) => {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft]   = useState(false);
  const [canRight, setCanRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  // Kiểm tra lại mỗi khi options thay đổi (sau render)
  useEffect(() => {
    // Dùng timeout nhỏ để đảm bảo DOM đã layout xong
    const t = setTimeout(checkScroll, 50);
    return () => clearTimeout(t);
  }, [options]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scroll = (e, dir) => {
    e.stopPropagation();
    scrollRef.current?.scrollBy({ left: dir * 90, behavior: "smooth" });
  };

  if (!options.length) return null;

  return (
    <div className="vp-root">
      {/* Mũi tên trái — chỉ hiện khi có thể scroll trái */}
      <button
        className={`vp-arrow vp-arrow-left ${canLeft ? "vp-arrow-visible" : "vp-arrow-hidden"}`}
        onClick={(e) => scroll(e, -1)}
        tabIndex={canLeft ? 0 : -1}
        aria-hidden={!canLeft}
      >
        <ChevronLeft className="w-3 h-3" />
      </button>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="vp-scroll"
        onScroll={checkScroll}
      >
        {options.map((keyValue) => {
          const isSelected = keyValue === selectedKey;
          const lbl = String(keyValue);
          const truncated = lbl.length > 9;
          return (
            <button
              key={keyValue}
              onClick={(e) => onSelect(e, keyValue)}
              title={truncated ? lbl : undefined}
              className={`vp-pill ${isSelected ? "vp-pill-active" : "vp-pill-idle"}`}
            >
              {truncated ? lbl.slice(0, 8) + "…" : lbl}
            </button>
          );
        })}
      </div>

      {/* Mũi tên phải — chỉ hiện khi có thể scroll phải */}
      <button
        className={`vp-arrow vp-arrow-right ${canRight ? "vp-arrow-visible" : "vp-arrow-hidden"}`}
        onClick={(e) => scroll(e, 1)}
        tabIndex={canRight ? 0 : -1}
        aria-hidden={!canRight}
      >
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};

// ============================================================================
// COMPONENT: StarRating
// ============================================================================
const StarRating = ({ rating = 0, reviewCount = 0 }) => (
  <div className="flex items-center gap-1">
    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
    <span className="text-xs font-bold text-gray-700">{rating.toFixed(1)}</span>
    <span className="text-[10px] text-gray-400">({reviewCount})</span>
  </div>
);

// ============================================================================
// COMPONENT CHÍNH: ProductCard
// ============================================================================
const ProductCard = ({
  product,
  isTopNew = false,
  isTopSeller = false,
  onEdit,
  onDelete,
  onClick,
  openInNewTab = false,
  showAdminActions,
}) => {
  const navigate = useNavigate();
  const { addToCart } = useCartStore();
  const { isAuthenticated, user } = useAuthStore();
  const canManageCart = usePermission("cart.manage.self");
  const canManageProducts = usePermission(["product.update", "product.delete"], {
    mode: "any",
  });

  const [isAdding, setIsAdding] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isVariantReady, setIsVariantReady] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const canShowAdminActions =
    typeof showAdminActions === "boolean" ? showAdminActions : canManageProducts;

  const safeVariants = useMemo(
    () => (Array.isArray(product?.variants) ? product.variants : []),
    [product?.variants]
  );
  const keyField = VARIANT_KEY_FIELD[product.category] || "variantName";

  // Auto-select default variant
  useEffect(() => {
    if (!safeVariants.length) {
      setSelectedVariant(null);
      setIsVariantReady(true);
      return;
    }
    const hasStorageVariants = safeVariants.some((v) => Number.isFinite(getVariantStorageValue(v)));
    const sorted = hasStorageVariants
      ? [...safeVariants].sort((a, b) => {
          const sA = getVariantStorageValue(a), sB = getVariantStorageValue(b);
          const hA = Number.isFinite(sA), hB = Number.isFinite(sB);
          if (hA && hB) return sA !== sB ? sA - sB : (a?.price || 0) - (b?.price || 0);
          if (hA) return -1; if (hB) return 1; return 0;
        })
      : safeVariants;

    let v = sorted.find((v) => v.stock > 0 && isUsableVariant(v, product.baseSlug))
      || sorted.find((v) => isUsableVariant(v, product.baseSlug))
      || sorted.find((v) => v.sku)
      || sorted[0];

    setSelectedVariant(v);
    setIsVariantReady(!!(v?.sku && (v?.slug || product.baseSlug)));
  }, [product.baseSlug, safeVariants, keyField]);

  // Derived display values
  const current = selectedVariant || {};
  const displayPrice = current.price || product.price || 0;
  const displayOriginalPrice = current.originalPrice || product.originalPrice || 0;
  const discountPercent = displayOriginalPrice > displayPrice
    ? Math.round(((displayOriginalPrice - displayPrice) / displayOriginalPrice) * 100)
    : 0;
  const displayImage =
    current?.images?.[0] ||
    (Array.isArray(product.images) ? product.images[0] : null) ||
    product.image || "/placeholder.png";
  const totalStock = safeVariants.reduce((sum, v) => sum + (v?.stock || 0), 0);
  const installmentText =
    product.installmentBadge && product.installmentBadge.toLowerCase() !== "none"
      ? product.installmentBadge
      : null;

  const variantKeyOptions = Array.from(
    new Set(safeVariants.filter((v) => v && v[keyField]).map((v) => v[keyField]))
  ).sort((a, b) => {
    const sA = normalizeStorageValue(a), sB = normalizeStorageValue(b);
    const hA = Number.isFinite(sA), hB = Number.isFinite(sB);
    if (hA && hB) return sA - sB;
    if (hA) return -1; if (hB) return 1;
    return String(a).localeCompare(String(b), "vi");
  });

  // Handlers
  const handleVariantKeyClick = (e, keyValue) => {
    e.stopPropagation();
    const variant =
      safeVariants.find((v) => v[keyField] === keyValue && v.stock > 0 && isUsableVariant(v, product.baseSlug))
      || safeVariants.find((v) => v[keyField] === keyValue && isUsableVariant(v, product.baseSlug))
      || safeVariants.find((v) => v[keyField] === keyValue && v.sku);
    if (variant) {
      setSelectedVariant(variant);
      setIsVariantReady(!!(variant.sku && (variant.slug || product.baseSlug)));
    }
  };

  const handleAddToCart = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isAuthenticated || !canManageCart) { navigate("/login"); return; }
    if (!selectedVariant) { toast.error("Vui lòng chọn phiên bản"); return; }
    if (selectedVariant.stock <= 0) { toast.error("Sản phẩm tạm hết hàng"); return; }
    setIsAdding(true);
    try {
      const productType = CATEGORY_TO_TYPE_MAP[product.category] || product.category;
      const result = await addToCart(selectedVariant._id, 1, productType);
      if (result?.success) {
        toast.success("Đã thêm vào giỏ hàng", {
          description: `${product.name} • ${current[keyField] || ""}`,
        });
      }
    } catch {
      toast.error("Không thể thêm vào giỏ hàng");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCardClick = () => {
    let url = "";
    const isUniversal = product.isUniversal || (product.productType && !["iPhone", "iPad", "Mac", "AirPods", "AppleWatch", "Accessories"].includes(product.category));
    if (isUniversal) {
      const categoryPath = PRODUCT_TYPE_TO_CATEGORY[product.productType?.slug] || "products";
      const baseSlug = product.baseSlug || product.slug;
      let storageSuffix = "";
      if (selectedVariant?.variantName) {
        const match = selectedVariant.variantName.match(/^([\d]+(?:GB|TB))/);
        storageSuffix = match ? `-${match[1].toLowerCase()}` : "";
      }
      url = selectedVariant?.sku
        ? `/${categoryPath}/${baseSlug}${storageSuffix}?sku=${selectedVariant.sku}`
        : `/${categoryPath}/${baseSlug}`;
    } else {
      const categoryPath = { iPhone: "dien-thoai", iPad: "may-tinh-bang", Mac: "macbook", AppleWatch: "apple-watch", AirPods: "tai-nghe", Accessories: "phu-kien" }[product.category];
      if (!categoryPath) return;
      if (selectedVariant?.sku && selectedVariant?.slug) url = `/${categoryPath}/${selectedVariant.slug}?sku=${selectedVariant.sku}`;
      else if (product.baseSlug) url = `/${categoryPath}/${product.baseSlug}`;
      else { toast.error("Không thể xem chi tiết sản phẩm"); return; }
    }
    if (onClick) { onClick(product); return; }
    if (openInNewTab) { window.open(url, "_blank"); return; }
    navigate(url);
  };

  return (
    <>
      <div
        className="product-card-wrapper"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={isVariantReady ? handleCardClick : undefined}
        style={{ cursor: isVariantReady ? "pointer" : "default" }}
      >
        {/* Loading overlay */}
        {!isVariantReady && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50 rounded-2xl">
            <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Admin debug */}
        {canShowAdminActions && (
          <div className="absolute top-12 left-3 z-10 bg-black/80 text-white text-[7px] px-2 py-1 rounded font-mono space-y-0.5 max-w-[190px] opacity-75">
            <div className="truncate">Base: <code className="text-sky-400">{product.baseSlug || "NULL"}</code></div>
            <div className="truncate">Var: <code className="text-emerald-400">{selectedVariant?.slug || "NULL"}</code></div>
            <div className="truncate">SKU: <code className="text-amber-400">{selectedVariant?.sku || "NULL"}</code></div>
          </div>
        )}

        {/* ── IMAGE SECTION ── */}
        <div className="product-card-image-area">
          <img
            src={displayImage}
            alt={product.name}
            className={`product-card-img ${isHovered ? "scale-108" : "scale-100"}`}
          />

          {/* Badges */}
          {discountPercent > 0 && (
            <div className="badge-discount">-{discountPercent}%</div>
          )}
          {isTopNew && <div className="badge-top badge-new">Mới</div>}
          {isTopSeller && !isTopNew && <div className="badge-top badge-seller">Bán chạy</div>}

          {/* Add to cart hover button */}
          {!canManageProducts && isAuthenticated && canManageCart && totalStock > 0 && (
            <button
              onClick={handleAddToCart}
              disabled={isAdding}
              className={`cart-hover-btn ${isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {isAdding ? "Đang thêm…" : "Thêm vào giỏ"}
            </button>
          )}

          {/* Admin actions */}
          {canShowAdminActions && (
            <div className={`admin-actions ${isHovered ? "opacity-100" : "opacity-0"}`}>
              <button className="admin-btn edit" onClick={(e) => { e.stopPropagation(); onEdit?.(product); }}>
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button className="admin-btn delete" onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── INFO SECTION ── */}
        {/*
          Chiều cao bằng nhau: mỗi vùng có thể "trống" đều được giữ chỗ
          bằng min-height cố định hoặc placeholder invisible.
          Các vùng cố định:
            1. Tên sản phẩm       → luôn 2 dòng (min-height)
            2. Rating + stock      → luôn 1 dòng (min-height)
            3. Giá gốc             → luôn 1 dòng (invisible nếu không có)
            4. Giá hiện tại        → luôn 1 dòng
            5. Installment badge   → luôn 1 dòng (invisible nếu không có)
            6. Variant pills       → luôn 1 dòng (invisible nếu không có)
        */}
        <div className="product-card-info">

          {/* 1. Tên sản phẩm — luôn 2 dòng */}
          <h3 className="product-card-name">{product.name}</h3>

          {/* 2. Rating + stock — luôn 1 dòng, min-height đảm bảo */}
          <div className="row-fixed flex items-center justify-between mt-2">
            <StarRating rating={product.averageRating || 0} reviewCount={product.totalReviews || 0} />
            {totalStock === 0 ? (
              <span className="stock-badge out">Hết hàng</span>
            ) : totalStock <= 5 ? (
              <span className="stock-badge low">Còn {totalStock}</span>
            ) : (
              <span className="invisible text-[10px]">·</span>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 my-2" />

          {/* 3. Giá gốc — luôn 1 dòng, ẩn bằng invisible nếu không có */}
          <div className="row-fixed flex items-center">
            {displayOriginalPrice > displayPrice ? (
              <span className="price-original">{formatPrice(displayOriginalPrice)}</span>
            ) : (
              <span className="invisible price-original">0đ</span>
            )}
          </div>

          {/* 4. Giá hiện tại — luôn hiển thị */}
          <div className="row-fixed flex items-center">
            <span className="price-current">{formatPrice(displayPrice)}</span>
          </div>

          {/* 5. Installment badge — luôn 1 dòng */}
          <div className="row-fixed flex items-center mt-1">
            {installmentText ? (
              <div className="installment-badge">{installmentText}</div>
            ) : (
              <span className="invisible installment-badge">·</span>
            )}
          </div>

          {/* 6. Variant pills — luôn 1 dòng */}
          <div className="row-fixed mt-1">
            {variantKeyOptions.length > 0 ? (
              <VariantPills
                options={variantKeyOptions}
                selectedKey={current[keyField]}
                onSelect={handleVariantKeyClick}
              />
            ) : (
              <div className="invisible" style={{ height: "26px" }}>·</div>
            )}
          </div>

        </div>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa sản phẩm</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa <strong>{product.name}</strong>?{" "}
              <span className="text-red-600 font-medium">Hành động này không thể hoàn tác.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete?.(product._id); setShowDeleteDialog(false); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Xóa vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`
        /* ── Card wrapper ── */
        .product-card-wrapper {
          position: relative;
          width: 100%;
          max-width: 240px;
          margin: 0 auto;
          background: #fff;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04);
          transition: box-shadow 0.25s ease, transform 0.25s ease;
          /* CHIỀU CAO BẰNG NHAU: dùng flex column + info chiếm phần còn lại */
          display: flex;
          flex-direction: column;
          height: 100%; /* Khi đặt trong grid/flex có height đồng đều */
        }
        .product-card-wrapper:hover {
          box-shadow: 0 8px 28px rgba(0,0,0,0.12), 0 0 0 1px rgba(220,38,38,0.15);
          transform: translateY(-3px);
        }

        /* ── Image area ── */
        .product-card-image-area {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          background: #f8f8f8;
          overflow: hidden;
          flex-shrink: 0; /* Không bị co lại */
        }
        .product-card-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 16px;
          transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        .scale-108 { transform: scale(1.08); }
        .scale-100 { transform: scale(1.00); }

        /* ── Badges ── */
        .badge-discount {
          position: absolute;
          top: 10px; left: 10px;
          background: #dc2626; color: #fff;
          font-size: 10px; font-weight: 700;
          padding: 2px 7px; border-radius: 20px;
          letter-spacing: 0.3px;
          box-shadow: 0 2px 6px rgba(220,38,38,0.35);
        }
        .badge-top {
          position: absolute;
          top: 10px; right: 10px;
          font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 20px;
        }
        .badge-new    { background: #16a34a; color: #fff; }
        .badge-seller { background: #0ea5e9; color: #fff; }

        /* ── Cart hover button ── */
        .cart-hover-btn {
          position: absolute;
          bottom: 10px; left: 50%;
          transform: translateX(-50%);
          display: flex; align-items: center; gap: 5px;
          background: rgba(255,255,255,0.95); color: #111;
          font-size: 11px; font-weight: 600;
          padding: 6px 14px; border-radius: 20px;
          border: 1px solid rgba(0,0,0,0.1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          white-space: nowrap;
          transition: opacity 0.2s ease, transform 0.2s ease;
          cursor: pointer;
          backdrop-filter: blur(6px);
        }
        .cart-hover-btn:hover { background: #fff; box-shadow: 0 6px 16px rgba(0,0,0,0.2); }

        /* ── Admin actions ── */
        .admin-actions {
          position: absolute; bottom: 10px; right: 10px;
          display: flex; gap: 5px;
          transition: opacity 0.2s ease;
        }
        .admin-btn {
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          border: none; cursor: pointer; transition: transform 0.15s;
        }
        .admin-btn:hover { transform: scale(1.1); }
        .admin-btn.edit   { background: #fff; color: #374151; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
        .admin-btn.delete { background: #ef4444; color: #fff; box-shadow: 0 2px 6px rgba(239,68,68,0.35); }

        /* ── Info section: flex-grow để lấp đầy chiều cao còn lại ── */
        .product-card-info {
          padding: 12px 14px 14px;
          flex: 1;             /* Lấp đầy chiều cao còn lại của card */
          display: flex;
          flex-direction: column;
        }

        /* ── Mỗi "hàng cố định" đều có min-height để giữ chỗ ── */
        .row-fixed {
          min-height: 22px;
          display: flex;
          align-items: center;
        }

        /* ── Tên sản phẩm: LUÔN đúng 2 dòng, không hơn không kém ── */
        .product-card-name {
          font-size: 13px;
          font-weight: 700;
          color: #111;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          /* Đặt cả min và max height = 2 dòng chính xác */
          min-height: calc(1.45em * 2);
          max-height: calc(1.45em * 2);
        }

        /* ── Stock badges ── */
        .stock-badge {
          font-size: 10px; font-weight: 600;
          padding: 1px 6px; border-radius: 4px;
        }
        .stock-badge.out { color: #ef4444; background: #fef2f2; }
        .stock-badge.low { color: #f97316; background: #fff7ed; }

        /* ── Giá gốc ── */
        .price-original {
          font-size: 12px;
          color: #9ca3af;
          text-decoration: line-through;
          line-height: 1.4;
        }

        /* ── Giá hiện tại ── */
        .price-current {
          font-size: 20px;
          font-weight: 800;
          color: #dc2626;
          letter-spacing: -0.5px;
          line-height: 1.3;
        }

        /* ── Installment badge ── */
        .installment-badge {
          display: inline-flex; align-items: center;
          font-size: 10px; font-weight: 600;
          color: #6b7280; background: #f3f4f6;
          padding: 2px 8px; border-radius: 20px;
          width: fit-content;
          height: 20px;
        }

        /* ── VariantPills: scrollable row + conditional arrows ── */
        .vp-root {
          display: flex;
          align-items: center;
          gap: 3px;
          width: 100%;
          position: relative;
        }
        .vp-scroll {
          display: flex;
          gap: 4px;
          overflow-x: auto;
          flex: 1;
          scroll-behavior: smooth;
          /* ẩn scrollbar hoàn toàn */
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .vp-scroll::-webkit-scrollbar { display: none; }

        .vp-pill {
          flex-shrink: 0;
          padding: 2px 9px;
          font-size: 10px;
          font-weight: 600;
          border-radius: 20px;
          border: 1.5px solid;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.15s ease;
          line-height: 1.5;
        }
        .vp-pill-active {
          background: #dc2626;
          color: #fff;
          border-color: #dc2626;
          box-shadow: 0 1px 4px rgba(220,38,38,0.3);
        }
        .vp-pill-idle {
          background: #fff;
          color: #4b5563;
          border-color: #e5e7eb;
        }
        .vp-pill-idle:hover {
          border-color: #fca5a5;
          color: #dc2626;
        }

        /* Mũi tên: luôn có trong DOM nhưng ẩn/hiện bằng opacity + pointer-events */
        .vp-arrow {
          flex-shrink: 0;
          width: 20px; height: 20px;
          border-radius: 50%;
          border: 1.5px solid #e5e7eb;
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: #9ca3af;
          transition: opacity 0.15s ease, border-color 0.15s, color 0.15s, transform 0.15s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.07);
        }
        .vp-arrow-visible {
          opacity: 1;
          pointer-events: auto;
        }
        .vp-arrow-hidden {
          opacity: 0;
          pointer-events: none;
          /* Giữ không gian để layout không nhảy */
        }
        .vp-arrow:hover {
          border-color: #dc2626;
          color: #dc2626;
          transform: scale(1.12);
        }

        /* ── Hide scrollbar ── */
        .product-card-info div::-webkit-scrollbar { display: none; }
      `}</style>
    </>
  );
};

export default ProductCard;
