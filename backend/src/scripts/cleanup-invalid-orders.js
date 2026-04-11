import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

import Order from "../modules/order/Order.js";
import UniversalProduct from "../modules/product/UniversalProduct.js";
import "../modules/productType/ProductType.js";
import WarrantyRecord from "../modules/warranty/WarrantyRecord.js";
import { mergeAfterSalesConfig, isSerializedConfig } from "../modules/device/afterSalesConfig.js";

dotenv.config();

const main = async () => {
  if (!process.env.MONGODB_CONNECTIONSTRING) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING");
  }

  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);

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

  let deletedOrdersCount = 0;
  const deletedOrderNumbers = [];

  for (const order of orders) {
    let orderHasInvalidItem = false;

    for (const item of (order.items || [])) {
      const product = item.productId;
      if (!product) continue;
      
      const condition = product.condition;

      if (condition === "LIKE_NEW" || condition === "USED") {
        const resolvedConfig = mergeAfterSalesConfig({ 
          product: product || {}, 
          productType: product?.productType || {} 
        });
        
        // This is exactly what causes the warrantyService.js to crash!
        // isSerializedConfig = true AND quantity > 1 AND empty deviceAssignments
        const assignments = Array.isArray(item.deviceAssignments) ? item.deviceAssignments : [];
        if (isSerializedConfig(resolvedConfig)) {
          if (assignments.length === 0 && Number(item.quantity || 0) > 1) {
            orderHasInvalidItem = true;
          }
           // Also, if the item didn't get properly assigned an imei/serial at all
           // (if my fix script somehow missed it, or if it failed ensure policy)
           if (assignments.length === 0 && Number(item.quantity || 0) === 1 && !item.imei && !item.serialNumber) {
               orderHasInvalidItem = true;
           }
        }
      }
    }

    if (orderHasInvalidItem) {
      // Xóa vĩnh viễn dữ liệu order rác, không hợp lệ theo yêu cầu User
      await Order.deleteOne({ _id: order._id }, { skipBranchIsolation: true });
      await WarrantyRecord.deleteMany({ orderId: order._id }, { skipBranchIsolation: true });
      
      deletedOrdersCount++;
      deletedOrderNumbers.push(order.orderNumber);
    }
  }

  console.log("=== CLEANUP REPORT ===");
  console.log(JSON.stringify({
    deletedOrdersCount,
    deletedOrderNumbers
  }, null, 2));

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Cleanup script error:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
