import test from "node:test";
import assert from "node:assert/strict";

import {
  hasStock,
  haversineDistanceKm,
  readStaticBranchRoutingData,
  selectBranch,
} from "../services/selectBranch.js";

const { branches } = readStaticBranchRoutingData();
const hcmBranch = branches.find((branch) => branch.id === "branch-hcm");

test("haversineDistanceKm returns zero for identical coordinates", () => {
  const distance = haversineDistanceKm(
    { lat: 10.776889, lng: 106.700806 },
    { lat: 10.776889, lng: 106.700806 },
  );

  assert.equal(distance, 0);
});

test("hasStock returns true when branch inventory covers all requested items", () => {
  const result = hasStock(
    hcmBranch,
    [
      { productId: "iphone-15-128-black", quantity: 2 },
      { productId: "airpods-pro-2", quantity: 1 },
    ],
  );

  assert.equal(result, true);
});

test("selectBranch picks the nearest branch with full stock", () => {
  const result = selectBranch("Đồng Nai", [
    { productId: "macbook-air-m3-13", quantity: 4 },
  ]);

  assert.equal(result.selectionType, "FULL_STOCK");
  assert.equal(result.canFulfill, true);
  assert.equal(result.selectedBranch.branch.id, "branch-hcm");
});

test("selectBranch supports province aliases and central city naming variants", () => {
  const result = selectBranch("Thành phố Hồ Chí Minh", [
    { productId: "iphone-15-256-blue", quantity: 1 },
  ]);

  assert.equal(result.selectionType, "FULL_STOCK");
  assert.equal(result.selectedBranch.branch.id, "branch-hcm");
});

test("selectBranch supports legacy province names used by frontend forms", () => {
  const hueResult = selectBranch("Huế", [
    { productId: "iphone-15-128-black", quantity: 1 },
  ]);
  const hcmResult = selectBranch("TP. Hồ Chí Minh", [
    { productId: "iphone-15-128-black", quantity: 1 },
  ]);

  assert.equal(hueResult.selectedBranch.branch.id, "branch-hanoi");
  assert.equal(hcmResult.selectedBranch.branch.id, "branch-hcm");
});

test("selectBranch falls back to the nearest branch with the best stock score when no branch can fully fulfill", () => {
  const result = selectBranch("Hà Tĩnh", [
    { productId: "macbook-air-m3-13", quantity: 15 },
  ]);

  assert.equal(result.selectionType, "PARTIAL_STOCK_FALLBACK");
  assert.equal(result.canFulfill, false);
  assert.equal(result.selectedBranch.branch.id, "branch-hanoi");
  assert.equal(result.selectedBranch.stockSummary.missingQuantity, 1);
});

test("selectBranch falls back to the default branch when no branch has any stock", () => {
  const result = selectBranch("Sóc Trăng", [
    { productId: "unknown-sku", quantity: 1 },
  ]);

  assert.equal(result.selectionType, "DEFAULT_BRANCH_FALLBACK");
  assert.equal(result.canFulfill, false);
  assert.equal(result.selectedBranch.branch.id, "branch-hcm");
  assert.equal(result.selectedBranch.stockSummary.totalAvailableQuantity, 0);
});

test("selectBranch throws for unsupported provinces", () => {
  assert.throws(
    () =>
      selectBranch("Atlantis", [
        { productId: "iphone-15-128-black", quantity: 1 },
      ]),
    /Unsupported province/,
  );
});
