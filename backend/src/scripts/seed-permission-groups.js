/**
 * seed-permission-groups.js — Seed các permission groups mặc định vào MongoDB.
 *
 * Usage: node src/scripts/seed-permission-groups.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import PermissionGroup from "../modules/auth/PermissionGroup.js";

const DEFAULT_PERMISSION_GROUPS = [
  {
    key: "ORDER_READONLY",
    name: "Xem đơn hàng (chỉ đọc)",
    description: "Cho phép xem danh sách và chi tiết đơn hàng mà không có quyền chỉnh sửa",
    permissions: ["orders.read", "order.view.self"],
    isSystem: true,
    sortOrder: 10,
  },
  {
    key: "ORDER_OPERATIONS",
    name: "Vận hành đơn hàng",
    description: "Quản lý trạng thái, phân công carrier và cửa hàng cho đơn hàng",
    permissions: [
      "order.status.manage",
      "order.assign.carrier",
      "order.assign.store",
      "order.audit.read",
    ],
    isSystem: true,
    sortOrder: 11,
  },
  {
    key: "PRODUCT_CATALOG_READ",
    name: "Xem danh mục sản phẩm (chỉ đọc)",
    description: "Cho phép xem sản phẩm và thương hiệu mà không có quyền chỉnh sửa",
    permissions: ["product.read", "brand.manage"],
    isSystem: true,
    sortOrder: 20,
  },
  {
    key: "INVENTORY_VIEW",
    name: "Xem kho hàng (chỉ đọc)",
    description: "Xem tồn kho, thông tin kho và phiếu điều chuyển mà không chỉnh sửa",
    permissions: ["inventory.read", "warehouse.read", "transfer.read"],
    isSystem: true,
    sortOrder: 30,
  },
  {
    key: "ANALYTICS_BRANCH",
    name: "Báo cáo chi nhánh",
    description: "Xem báo cáo và phân tích dữ liệu trong phạm vi chi nhánh được phân công",
    permissions: ["analytics.read.branch", "analytics.read.assigned"],
    isSystem: true,
    sortOrder: 40,
  },
  {
    key: "POS_BASIC",
    name: "Bán hàng tại quầy (cơ bản)",
    description: "Tạo và xem đơn hàng POS của nhân viên",
    permissions: ["pos.order.create", "pos.order.read.self"],
    isSystem: true,
    sortOrder: 50,
  },
  {
    key: "WAREHOUSE_OPERATIONS",
    name: "Vận hành kho",
    description: "Đọc và ghi thông tin kho, tạo và xác nhận phiếu điều chuyển",
    permissions: [
      "inventory.read",
      "inventory.write",
      "warehouse.read",
      "warehouse.write",
      "transfer.create",
      "transfer.ship",
      "transfer.receive",
      "transfer.read",
    ],
    isSystem: true,
    sortOrder: 31,
  },
  {
    key: "USER_MANAGEMENT_BRANCH",
    name: "Quản lý nhân viên chi nhánh",
    description: "Xem và quản lý tài khoản nhân viên trong chi nhánh",
    permissions: ["users.read.branch", "users.manage.branch"],
    isSystem: true,
    sortOrder: 60,
  },
];

async function seedPermissionGroups() {
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_CONNECTIONSTRING;
  if (!MONGO_URI) {
    throw new Error("MONGODB_URI environment variable is required");
  }

  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const group of DEFAULT_PERMISSION_GROUPS) {
    const existing = await PermissionGroup.findOne({ key: group.key });
    if (existing) {
      // Update nếu tên hoặc mô tả thay đổi nhưng giữ permissions nếu đã customize
      await PermissionGroup.updateOne(
        { key: group.key },
        {
          $set: {
            name: group.name,
            description: group.description,
            isSystem: true,
            sortOrder: group.sortOrder,
          },
          // Chỉ set permissions nếu group là system và chưa được customize
          ...(existing.isSystem ? { $set: { permissions: group.permissions } } : {}),
        }
      );
      updated++;
      console.log(`  🔄 Updated: ${group.key}`);
    } else {
      await PermissionGroup.create(group);
      created++;
      console.log(`  ✨ Created: ${group.key} — ${group.name}`);
    }
  }

  console.log(`\n📊 Seed complete: ${created} created, ${updated} updated, ${skipped} skipped`);
  await mongoose.disconnect();
}

seedPermissionGroups().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
