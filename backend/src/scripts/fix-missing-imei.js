import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

import Order from "../modules/order/Order.js";
import UniversalProduct from "../modules/product/UniversalProduct.js";
import "../modules/productType/ProductType.js";
import { mergeAfterSalesConfig, IDENTIFIER_POLICIES, ensureIdentifierPolicySatisfied } from "../modules/device/afterSalesConfig.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logRoot = path.resolve(
  __dirname,
  "../../backups/fix-imei-logs",
  new Date().toISOString().replace(/[:.]/g, "-")
);

const APPLY = process.argv.includes("--apply");

const generateFakeImei = () => {
  let imei = "99";
  for (let i = 0; i < 13; i++) {
    imei += Math.floor(Math.random() * 10).toString();
  }
  return imei;
};

const generateFakeSerial = () => {
  return "SN" + Date.now().toString().slice(-6) + Math.random().toString(36).substring(2, 6).toUpperCase();
};

const main = async () => {
  if (!process.env.MONGODB_CONNECTIONSTRING) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING");
  }

  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
  console.log("Connected to MongoDB for IMEI/Serial fix script...");

  const TARGET_STATUSES = ["COMPLETED", "DELIVERED"];

  const orders = await Order.find(
    { status: { $in: TARGET_STATUSES } },
    null,
    { skipBranchIsolation: true }
  )
    .populate({
      path: "items.productId",
      select: "condition name productType afterSalesConfig",
      populate: { path: "productType", select: "name afterSalesDefaults" }
    })
    .lean();

  let totalOrdersScanned = orders.length;
  let itemsFixedCount = 0;
  let itemsSkippedCount = 0;
  let sampleIdentifiers = [];
  const logData = [];

  const updatePromises = [];

  for (const order of orders) {
    let orderChanged = false;
    const updatedItems = [];

    for (const item of (order.items || [])) {
      const product = item.productId;
      const condition = product?.condition;

      if (condition === "LIKE_NEW" || condition === "USED") {
        const resolvedConfig = mergeAfterSalesConfig({ 
          product: product || {}, 
          productType: product?.productType || {} 
        });
        const policy = resolvedConfig.identifierPolicy;
        
        const errorMessage = ensureIdentifierPolicySatisfied({ identifierPolicy: policy }, item);
        const isMissing = Boolean(errorMessage);

        if (isMissing) {
          let assignedData = "";
          
          if (policy === IDENTIFIER_POLICIES.IMEI) {
            item.imei = item.imei || generateFakeImei();
            assignedData = `IMEI: ${item.imei}`;
          } else if (policy === IDENTIFIER_POLICIES.SERIAL) {
            item.serialNumber = item.serialNumber || generateFakeSerial();
            assignedData = `SERIAL: ${item.serialNumber}`;
          } else {
            item.imei = item.imei || generateFakeImei();
            item.serialNumber = item.serialNumber || generateFakeSerial();
            assignedData = `IMEI: ${item.imei}, SERIAL: ${item.serialNumber}`;
          }
          
          orderChanged = true;
          itemsFixedCount++;
          
          if (sampleIdentifiers.length < 10) {
            sampleIdentifiers.push(assignedData);
          }

          logData.push({
            orderNumber: order.orderNumber,
            productName: item.name || item.productName || product?.name || "Unknown Product",
            condition: condition,
            policy: policy,
            missingReason: errorMessage,
            assignedData: assignedData,
            action: APPLY ? "UPDATED" : "DRY-RUN",
          });
        } else {
          itemsSkippedCount++;
        }
      } else {
        // Hàng BRAND (NEW) hoặc các loại không có điều kiện phù hợp -> Skip
        itemsSkippedCount++;
      }
      
      updatedItems.push(item);
    }

    // Nếu có sự thay đổi và đang chạy ở chế độ APPLY mode
    if (orderChanged && APPLY) {
      const leanItemsForSave = updatedItems.map(item => {
        const cleanItem = { ...item };
        if (cleanItem.productId && cleanItem.productId._id) {
          cleanItem.productId = cleanItem.productId._id;
        }
        return cleanItem;
      });

      updatePromises.push(
        Order.updateOne(
          { _id: order._id },
          { $set: { items: leanItemsForSave } },
          { skipBranchIsolation: true }
        )
      );
    }
  }

  // Thực thi update DB
  if (APPLY && updatePromises.length > 0) {
    console.log(`Applying updates to ${updatePromises.length} orders...`);
    await Promise.all(updatePromises);
  }

  // Xuất output Summary
  console.log("\n================ SUMMARY ================");
  console.log(`Trạng Thái Chạy: ${APPLY ? "APPLY (Ghi thật vào DB)" : "DRY-RUN (Chưa ghi dữ liệu mới)"}`);
  console.log(`Tổng số Order đã scan: ${totalOrdersScanned}`);
  console.log(`Số Items được fix (Gán Identifier giả): ${itemsFixedCount}`);
  console.log(`Số Items bị skip (Là hàng BRAND hoặc đã có IMEI/Serial): ${itemsSkippedCount}`);
  
  if (sampleIdentifiers.length > 0) {
    console.log(`\nDanh sách các mã định danh giả tượng trưng (Sample):`);
    sampleIdentifiers.forEach(id => console.log(`  - ${id}`));
  }
  
  if (itemsFixedCount > 0) {
    await fs.mkdir(logRoot, { recursive: true });
    const logFilePath = path.join(logRoot, "fix-missing-identifiers-log.json");
    await fs.writeFile(logFilePath, JSON.stringify(logData, null, 2), "utf8");
    console.log(`\n[!] Chi tiết log các items đã được xử lý lưu tại: ${logFilePath}`);
  }
  console.log("=========================================\n");

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Lỗi khi chạy script:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
