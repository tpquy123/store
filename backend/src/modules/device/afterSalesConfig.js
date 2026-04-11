export const TRACKING_MODES = Object.freeze({
  NONE: "NONE",
  SERIALIZED: "SERIALIZED",
});

export const WARRANTY_PROVIDERS = Object.freeze({
  BRAND: "BRAND",
  STORE: "STORE",
});

export const IDENTIFIER_POLICIES = Object.freeze({
  NONE: "NONE",
  IMEI: "IMEI",
  SERIAL: "SERIAL",
  IMEI_OR_SERIAL: "IMEI_OR_SERIAL",
  IMEI_AND_SERIAL: "IMEI_AND_SERIAL",
});

export const INVENTORY_STATES = Object.freeze({
  IN_STOCK: "IN_STOCK",
  RESERVED: "RESERVED",
  SOLD: "SOLD",
  RETURNED: "RETURNED",
  SCRAPPED: "SCRAPPED",
});

export const SERVICE_STATES = Object.freeze({
  NONE: "NONE",
  UNDER_WARRANTY: "UNDER_WARRANTY",
  UNDER_REPAIR: "UNDER_REPAIR",
  REPAIRED: "REPAIRED",
  WARRANTY_VOID: "WARRANTY_VOID",
});

export const WARRANTY_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  VOID: "VOID",
  REPLACED: "REPLACED",
});

export const DEFAULT_AFTER_SALES_BY_PRODUCT_TYPE = Object.freeze({
  SMARTPHONE: {
    trackingMode: TRACKING_MODES.SERIALIZED,
    identifierPolicy: IDENTIFIER_POLICIES.IMEI,
    warrantyMonths: 12,
  },
  TABLET: {
    trackingMode: TRACKING_MODES.SERIALIZED,
    identifierPolicy: IDENTIFIER_POLICIES.SERIAL,
    warrantyMonths: 12,
  },
  LAPTOP: {
    trackingMode: TRACKING_MODES.SERIALIZED,
    identifierPolicy: IDENTIFIER_POLICIES.SERIAL,
    warrantyMonths: 12,
  },
  SMARTWATCH: {
    trackingMode: TRACKING_MODES.SERIALIZED,
    identifierPolicy: IDENTIFIER_POLICIES.SERIAL,
    warrantyMonths: 12,
  },
  HEADPHONE: {
    trackingMode: TRACKING_MODES.NONE,
    identifierPolicy: IDENTIFIER_POLICIES.NONE,
    warrantyMonths: 12,
  },
  ACCESSORIES: {
    trackingMode: TRACKING_MODES.NONE,
    identifierPolicy: IDENTIFIER_POLICIES.NONE,
    warrantyMonths: 0,
  },
});

const normalizeKey = (value) => String(value || "").trim().toUpperCase();

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
};

export const resolveDefaultWarrantyProvider = (condition = "") =>
  normalizeKey(condition) === "NEW"
    ? WARRANTY_PROVIDERS.BRAND
    : WARRANTY_PROVIDERS.STORE;

export const normalizeAfterSalesInput = (input = {}, { allowUndefined = true } = {}) => {
  const source = input && typeof input === "object" ? input : {};
  const warrantyProvider = normalizeKey(source.warrantyProvider);
  const trackingMode = normalizeKey(source.trackingMode);
  const identifierPolicy = normalizeKey(source.identifierPolicy);
  const warrantyMonths = toOptionalNumber(source.warrantyMonths);
  const warrantyTerms = String(source.warrantyTerms || "").trim();

  const result = {};

  if (warrantyProvider && Object.values(WARRANTY_PROVIDERS).includes(warrantyProvider)) {
    result.warrantyProvider = warrantyProvider;
  }

  if (trackingMode && Object.values(TRACKING_MODES).includes(trackingMode)) {
    result.trackingMode = trackingMode;
  } else if (!allowUndefined && source.trackingMode !== undefined) {
    result.trackingMode = TRACKING_MODES.NONE;
  }

  if (identifierPolicy && Object.values(IDENTIFIER_POLICIES).includes(identifierPolicy)) {
    result.identifierPolicy = identifierPolicy;
  } else if (!allowUndefined && source.identifierPolicy !== undefined) {
    result.identifierPolicy = IDENTIFIER_POLICIES.NONE;
  }

  if (warrantyMonths !== undefined) {
    result.warrantyMonths = warrantyMonths;
  }

  if (warrantyTerms || source.warrantyTerms !== undefined) {
    result.warrantyTerms = warrantyTerms;
  }

  return result;
};

const getDefaultConfigFromProductType = (productType = {}) => {
  const namedDefault = DEFAULT_AFTER_SALES_BY_PRODUCT_TYPE[normalizeKey(productType?.name)];
  const typeDefaults = normalizeAfterSalesInput(productType?.afterSalesDefaults || {});

  return {
    warrantyProvider: undefined,
    trackingMode: TRACKING_MODES.NONE,
    identifierPolicy: IDENTIFIER_POLICIES.NONE,
    warrantyMonths: 0,
    warrantyTerms: "",
    ...(namedDefault || {}),
    ...typeDefaults,
  };
};

export const mergeAfterSalesConfig = ({ product = {}, productType = {} } = {}) => {
  const base = getDefaultConfigFromProductType(productType);
  const override = normalizeAfterSalesInput(product?.afterSalesConfig || {});
  const warrantyProvider =
    override.warrantyProvider ||
    base.warrantyProvider ||
    resolveDefaultWarrantyProvider(product?.condition);

  return {
    warrantyProvider,
    trackingMode:
      warrantyProvider === WARRANTY_PROVIDERS.STORE
        ? override.trackingMode || base.trackingMode || TRACKING_MODES.NONE
        : TRACKING_MODES.NONE,
    identifierPolicy:
      warrantyProvider === WARRANTY_PROVIDERS.STORE
        ? override.identifierPolicy || base.identifierPolicy || IDENTIFIER_POLICIES.NONE
        : IDENTIFIER_POLICIES.NONE,
    warrantyMonths:
      override.warrantyMonths !== undefined ? override.warrantyMonths : base.warrantyMonths,
    warrantyTerms:
      override.warrantyTerms !== undefined ? override.warrantyTerms : base.warrantyTerms,
  };
};

export const isStoreWarrantyConfig = (config = {}) =>
  String(config?.warrantyProvider || "").toUpperCase() === WARRANTY_PROVIDERS.STORE;

export const isSerializedConfig = (config = {}) =>
  isStoreWarrantyConfig(config) &&
  String(config?.trackingMode || "").toUpperCase() === TRACKING_MODES.SERIALIZED;

export const normalizeImei = (value) => String(value || "").replace(/\D+/g, "");

export const normalizeSerialNumber = (value) =>
  String(value || "").trim().toUpperCase().replace(/\s+/g, "");

export const getNormalizedLookupKeys = ({ imei, serialNumber } = {}) => {
  const keys = new Set();
  const normalizedImei = normalizeImei(imei);
  const normalizedSerial = normalizeSerialNumber(serialNumber);

  if (normalizedImei) keys.add(normalizedImei);
  if (normalizedSerial) keys.add(normalizedSerial);

  return Array.from(keys);
};

export const ensureIdentifierPolicySatisfied = (config = {}, { imei, serialNumber } = {}) => {
  const normalizedImei = normalizeImei(imei);
  const normalizedSerial = normalizeSerialNumber(serialNumber);
  const policy = String(config?.identifierPolicy || IDENTIFIER_POLICIES.NONE).toUpperCase();

  if (policy === IDENTIFIER_POLICIES.NONE) {
    return "";
  }

  if (policy === IDENTIFIER_POLICIES.IMEI && !normalizedImei) {
    return "IMEI is required for this product";
  }

  if (policy === IDENTIFIER_POLICIES.SERIAL && !normalizedSerial) {
    return "Serial number is required for this product";
  }

  if (policy === IDENTIFIER_POLICIES.IMEI_OR_SERIAL && !normalizedImei && !normalizedSerial) {
    return "IMEI or serial number is required for this product";
  }

  if (policy === IDENTIFIER_POLICIES.IMEI_AND_SERIAL && (!normalizedImei || !normalizedSerial)) {
    return "Both IMEI and serial number are required for this product";
  }

  return "";
};

const SERIAL_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9./_-]{2,63}$/;

export const validateIdentifierFormat = ({ imei, serialNumber } = {}) => {
  const normalizedImei = normalizeImei(imei);
  const normalizedSerial = normalizeSerialNumber(serialNumber);

  if (normalizedImei && !/^\d{15}$/.test(normalizedImei)) {
    return "IMEI must contain exactly 15 digits";
  }

  if (normalizedSerial && !SERIAL_NUMBER_PATTERN.test(normalizedSerial)) {
    return "Serial number format is invalid";
  }

  return "";
};

export const addMonthsToDate = (dateValue, months) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const normalizedMonths = Math.max(0, Number(months) || 0);
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + normalizedMonths);
  return nextDate;
};

export const resolveAfterSalesConfigByProductId = async ({ productId, session = null } = {}) => {
  if (!productId) {
    return null;
  }

  const [{ default: UniversalProduct }, { default: ProductType }] = await Promise.all([
    import("../product/UniversalProduct.js"),
    import("../productType/ProductType.js"),
  ]);

  const productQuery = UniversalProduct.findById(productId)
    .select("name condition productType afterSalesConfig")
    .populate("productType", "name afterSalesDefaults");

  if (session) {
    productQuery.session(session);
  }

  const product = await productQuery;
  if (!product) {
    return null;
  }

  let productType = product.productType;
  if (product.productType && !product.productType?.name) {
    const typeQuery = ProductType.findById(product.productType).select("name afterSalesDefaults");
    if (session) {
      typeQuery.session(session);
    }
    productType = await typeQuery;
  }

  const resolvedConfig = mergeAfterSalesConfig({ product, productType });
  return {
    product,
    productType,
    config: resolvedConfig,
  };
};
