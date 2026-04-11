import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data/branch-routing");

const EARTH_RADIUS_KM = 6371;
const FALLBACK_MISSING_UNIT_PENALTY = 200;
const FALLBACK_MISSING_PRODUCT_PENALTY = 80;
const FALLBACK_CROSS_REGION_PENALTY = 50;
const DEFAULT_BRANCH_BONUS = 25;

const PROVINCE_ALIASES = new Map([
  ["ha noi", "ha noi"],
  ["thanh pho ha noi", "ha noi"],
  ["hanoi", "ha noi"],
  ["ho chi minh", "tp.hcm"],
  ["thanh pho ho chi minh", "tp.hcm"],
  ["tp. ho chi minh", "tp.hcm"],
  ["tp.ho chi minh", "tp.hcm"],
  ["tp ho chi minh", "tp.hcm"],
  ["tphcm", "tp.hcm"],
  ["tp. hcm", "tp.hcm"],
  ["tp.hcm", "tp.hcm"],
  ["tp hcm", "tp.hcm"],
  ["hcm", "tp.hcm"],
  ["sai gon", "tp.hcm"],
  ["saigon", "tp.hcm"],
  ["hue", "thua thien hue"],
  ["thua thien hue", "thua thien hue"],
  ["thua thien-hue", "thua thien hue"],
  ["thua thien - hue", "thua thien hue"],
  ["thanh pho can tho", "can tho"],
  ["thanh pho da nang", "da nang"],
  ["da nang", "da nang"],
  ["can tho", "can tho"],
  ["ba ria vung tau", "ba ria vung tau"],
  ["ba ria-vung tau", "ba ria vung tau"],
  ["ba ria - vung tau", "ba ria vung tau"],
]);

const loadJsonFile = (fileName) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));

const defaultProvinces = loadJsonFile("provinces.json");
const defaultBranches = loadJsonFile("branches.json");
const defaultInventory = loadJsonFile("inventory.json");

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/\b(tinh|thanh pho)\b/gi, " ")
    .replace(/[^a-zA-Z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

const normalizeProvinceName = (value) => {
  const normalized = normalizeText(value);
  return PROVINCE_ALIASES.get(normalized) || normalized;
};

const toFiniteNumber = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${fieldName} must be a finite number`);
  }
  return parsed;
};

const toPositiveInteger = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer`);
  }
  return parsed;
};

const resolveInventoryKey = (item = {}) => {
  const productId = String(item.productId || "").trim();
  const variantSku = String(item.variantSku || "").trim();

  if (!productId && !variantSku) {
    throw new TypeError("Each order item must include productId or variantSku");
  }

  return `${productId || variantSku}::${variantSku}`;
};

const resolveBranchId = (branch) => {
  if (!branch) {
    throw new TypeError("Branch is required");
  }

  if (typeof branch === "string") {
    return branch.trim();
  }

  const branchId = String(
    branch.id || branch.branchId || branch._id || branch.storeId || branch.toString?.() || "",
  ).trim();
  if (!branchId) {
    throw new TypeError("Branch must include id, branchId, or _id");
  }

  return branchId;
};

const assertCoordinates = (entity, label) => {
  const lat = toFiniteNumber(entity?.lat, `${label}.lat`);
  const lng = toFiniteNumber(entity?.lng, `${label}.lng`);
  return { lat, lng };
};

const getRegionFromLatitude = (lat) => {
  if (lat >= 18) return "north";
  if (lat >= 14) return "central";
  return "south";
};

const buildProvinceIndex = (provinces = defaultProvinces) => {
  if (!Array.isArray(provinces) || provinces.length === 0) {
    throw new TypeError("Provinces dataset must be a non-empty array");
  }

  return provinces.reduce((index, province) => {
    const name = String(province?.name || "").trim();
    if (!name) {
      throw new TypeError("Province record must include name");
    }

    index.set(normalizeProvinceName(name), {
      name,
      ...assertCoordinates(province, `province(${name})`),
    });

    return index;
  }, new Map());
};

const buildBranchMap = (branches = defaultBranches) => {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new TypeError("Branches dataset must be a non-empty array");
  }

  return branches.reduce((index, branch) => {
    const id = resolveBranchId(branch);
    const branchRecord = {
      ...branch,
      id,
      ...assertCoordinates(branch, `branch(${id})`),
    };

    index.set(id, branchRecord);
    return index;
  }, new Map());
};

const buildInventoryIndex = (inventory = defaultInventory) => {
  if (!Array.isArray(inventory)) {
    throw new TypeError("Inventory dataset must be an array");
  }

  return inventory.reduce((index, row) => {
    const branchId = resolveBranchId(row.branchId || row.branch || row.storeId);
    const key = resolveInventoryKey(row);
    const quantity = Math.max(0, Number(row.quantity) || 0);

    if (!index.has(branchId)) {
      index.set(branchId, new Map());
    }

    index.get(branchId).set(key, quantity);
    return index;
  }, new Map());
};

const normalizeOrderItems = (orderItems = []) => {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    throw new TypeError("orderItems must be a non-empty array");
  }

  return orderItems.map((item, index) => {
    const quantity = toPositiveInteger(item?.quantity, `orderItems[${index}].quantity`);
    const productId = String(item?.productId || "").trim();
    const variantSku = String(item?.variantSku || "").trim();

    if (!productId && !variantSku) {
      throw new TypeError(`orderItems[${index}] must include productId or variantSku`);
    }

    return {
      productId,
      variantSku,
      quantity,
      key: resolveInventoryKey({ productId, variantSku }),
    };
  });
};

const getProvinceRecord = (customerProvince, provinces = defaultProvinces) => {
  const provinceName = String(customerProvince || "").trim();
  if (!provinceName) {
    throw new TypeError("customerProvince is required");
  }

  const provinceIndex = buildProvinceIndex(provinces);
  const province = provinceIndex.get(normalizeProvinceName(provinceName));

  if (!province) {
    throw new Error(`Unsupported province: ${provinceName}`);
  }

  return province;
};

const sortAlternatives = (candidates = []) =>
  candidates.sort((left, right) => {
    if (left.distanceKm !== right.distanceKm) {
      return left.distanceKm - right.distanceKm;
    }

    return left.branch.name.localeCompare(right.branch.name, "vi");
  });

export const haversineDistanceKm = (origin, destination) => {
  const from = assertCoordinates(origin, "origin");
  const to = assertCoordinates(destination, "destination");

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const startLat = toRadians(from.lat);
  const endLat = toRadians(to.lat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return Number((2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
};

export const getBranchStockSummary = (
  branch,
  orderItems,
  options = {},
) => {
  const inventoryIndex =
    options.inventoryIndex || buildInventoryIndex(options.inventory || defaultInventory);
  const branchId = resolveBranchId(branch);
  const normalizedItems = normalizeOrderItems(orderItems);
  const branchInventory = inventoryIndex.get(branchId) || new Map();

  let totalRequestedQuantity = 0;
  let totalAvailableQuantity = 0;
  let missingQuantity = 0;
  let fulfilledItems = 0;

  const missingItems = normalizedItems.reduce((items, item) => {
    const availableQuantity = Number(branchInventory.get(item.key) || 0);
    const missingQty = Math.max(0, item.quantity - availableQuantity);

    totalRequestedQuantity += item.quantity;
    totalAvailableQuantity += Math.min(item.quantity, availableQuantity);
    missingQuantity += missingQty;

    if (missingQty === 0) {
      fulfilledItems += 1;
      return items;
    }

    items.push({
      productId: item.productId || undefined,
      variantSku: item.variantSku || undefined,
      requestedQuantity: item.quantity,
      availableQuantity,
      missingQuantity: missingQty,
    });

    return items;
  }, []);

  return {
    branchId,
    isFullStock: missingItems.length === 0,
    totalRequestedQuantity,
    totalAvailableQuantity,
    missingQuantity,
    fulfilledItems,
    totalItems: normalizedItems.length,
    missingItems,
    availabilityRatio:
      totalRequestedQuantity > 0
        ? Number((totalAvailableQuantity / totalRequestedQuantity).toFixed(4))
        : 0,
  };
};

export const hasStock = (branch, orderItems, options = {}) =>
  getBranchStockSummary(branch, orderItems, options).isFullStock;

const sanitizeCandidate = (candidate) => ({
  branch: candidate.branch,
  distanceKm: candidate.distanceKm,
  score: candidate.score,
  stockSummary: candidate.stockSummary,
  sameRegion: candidate.sameRegion,
});

export const readStaticBranchRoutingData = () => ({
  provinces: defaultProvinces,
  branches: defaultBranches,
  inventory: defaultInventory,
});

export const selectBranch = (customerProvince, orderItems, options = {}) => {
  const provinces = options.provinces || defaultProvinces;
  const branches = options.branches || defaultBranches;
  const inventory = options.inventory || defaultInventory;

  const province = getProvinceRecord(customerProvince, provinces);
  const branchMap = buildBranchMap(branches);
  const inventoryIndex = buildInventoryIndex(inventory);
  const normalizedItems = normalizeOrderItems(orderItems);

  const customerRegion = getRegionFromLatitude(province.lat);
  const branchCandidates = Array.from(branchMap.values()).map((branch) => {
    const stockSummary = getBranchStockSummary(branch, normalizedItems, { inventoryIndex });
    const distanceKm = haversineDistanceKm(province, branch);
    const branchRegion = branch.region || getRegionFromLatitude(branch.lat);
    const sameRegion = branchRegion === customerRegion;
    const score =
      distanceKm +
      stockSummary.missingQuantity * FALLBACK_MISSING_UNIT_PENALTY +
      stockSummary.missingItems.length * FALLBACK_MISSING_PRODUCT_PENALTY +
      (sameRegion ? 0 : FALLBACK_CROSS_REGION_PENALTY);

    return {
      branch: branchMap.get(branch.id),
      distanceKm,
      score,
      stockSummary,
      sameRegion,
    };
  });

  const defaultBranch =
    branchCandidates.find((candidate) => candidate.branch.isDefault) || branchCandidates[0];

  const fullStockCandidates = sortAlternatives(
    branchCandidates.filter((candidate) => candidate.stockSummary.isFullStock),
  );

  if (fullStockCandidates.length > 0) {
    const [selectedCandidate, ...otherCandidates] = fullStockCandidates;

    return {
      selectionType: "FULL_STOCK",
      reason: "nearest-branch-with-full-stock",
      canFulfill: true,
      customerProvince: province,
      selectedBranch: sanitizeCandidate(selectedCandidate),
      alternatives: otherCandidates.slice(0, 2).map(sanitizeCandidate),
    };
  }

  const fallbackCandidates = [...branchCandidates].sort((left, right) => {
    const leftScore =
      left.score - (left.branch.id === defaultBranch?.branch.id ? DEFAULT_BRANCH_BONUS : 0);
    const rightScore =
      right.score - (right.branch.id === defaultBranch?.branch.id ? DEFAULT_BRANCH_BONUS : 0);

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return left.distanceKm - right.distanceKm;
  });

  const bestFallback = fallbackCandidates[0];
  const selectedCandidate =
    bestFallback && bestFallback.stockSummary.totalAvailableQuantity > 0
      ? bestFallback
      : defaultBranch;

  if (!selectedCandidate) {
    throw new Error("No branch candidates available for selection");
  }

  const selectionType =
    selectedCandidate.stockSummary.totalAvailableQuantity > 0
      ? "PARTIAL_STOCK_FALLBACK"
      : "DEFAULT_BRANCH_FALLBACK";

  return {
    selectionType,
    reason:
      selectionType === "PARTIAL_STOCK_FALLBACK"
        ? "nearest-branch-with-best-stock-score"
        : "default-branch-fallback",
    canFulfill: false,
    customerProvince: province,
    selectedBranch: sanitizeCandidate(selectedCandidate),
    alternatives: fallbackCandidates
      .filter((candidate) => candidate.branch.id !== selectedCandidate.branch.id)
      .slice(0, 2)
      .map(sanitizeCandidate),
  };
};

export default {
  selectBranch,
  hasStock,
  getBranchStockSummary,
  haversineDistanceKm,
  readStaticBranchRoutingData,
};
