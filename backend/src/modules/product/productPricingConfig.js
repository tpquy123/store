export const PRODUCT_STATUSES = Object.freeze({
  COMING_SOON: "COMING_SOON",
  IN_STOCK: "IN_STOCK",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  DISCONTINUED: "DISCONTINUED",
  PRE_ORDER: "PRE_ORDER",
});

export const PRODUCT_STATUS_VALUES = Object.freeze(Object.values(PRODUCT_STATUSES));

export const AUTO_MANAGED_PRODUCT_STATUSES = new Set([
  PRODUCT_STATUSES.COMING_SOON,
  PRODUCT_STATUSES.IN_STOCK,
  PRODUCT_STATUSES.OUT_OF_STOCK,
]);

export const MANUAL_PRODUCT_STATUSES = new Set([
  PRODUCT_STATUSES.DISCONTINUED,
  PRODUCT_STATUSES.PRE_ORDER,
]);

const LEGACY_PRODUCT_STATUS_MAP = Object.freeze({
  AVAILABLE: PRODUCT_STATUSES.IN_STOCK,
  ACTIVE: PRODUCT_STATUSES.IN_STOCK,
});

export const normalizeProductStatus = (
  status,
  fallback = PRODUCT_STATUSES.OUT_OF_STOCK
) => {
  const normalized = String(status || "")
    .trim()
    .toUpperCase();

  if (!normalized) return fallback;
  if (PRODUCT_STATUS_VALUES.includes(normalized)) return normalized;
  if (LEGACY_PRODUCT_STATUS_MAP[normalized]) {
    return LEGACY_PRODUCT_STATUS_MAP[normalized];
  }

  return fallback;
};

export const isManualProductStatus = (status) =>
  MANUAL_PRODUCT_STATUSES.has(normalizeProductStatus(status));

export const canPurchaseForProductStatus = (status) =>
  normalizeProductStatus(status) === PRODUCT_STATUSES.IN_STOCK;
