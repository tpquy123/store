/**
 * Script: create-test-employees.js
 * Tạo nhiều nhân viên test với các bộ quyền khác nhau để kiểm tra hệ thống phân quyền.
 *
 * Chạy: node src/scripts/create-test-employees.js
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import User from "../modules/auth/User.js";
import Permission from "../modules/auth/Permission.js";
import UserPermission from "../modules/auth/UserPermission.js";
import Store from "../modules/store/Store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

// =====================================================
// Cấu hình các nhân viên test
// =====================================================
const TEST_EMPLOYEES = [
  {
    name: "Test - Nhân viên Analytics",
    phone: "0900000001",
    email: "test.analytics@store.com",
    role: "SHIPPER",
    passwordText: "Test@12345",
    // Chỉ có quyền xem số liệu & thông tin cá nhân
    permissions: [
      { key: "analytics.read.assigned", scopeType: "BRANCH" },
      { key: "analytics.read.personal", scopeType: "SELF" },
      { key: "task.read", scopeType: "SELF" },
      { key: "task.update", scopeType: "SELF" },
    ],
  },
  {
    name: "Test - Quản lý kho",
    phone: "0900000002",
    email: "test.warehouse@store.com",
    role: "WAREHOUSE_MANAGER",
    passwordText: "Test@12345",
    // Quyền kho + inventory + transfer
    permissions: [
      { key: "inventory.read", scopeType: "BRANCH" },
      { key: "inventory.write", scopeType: "BRANCH" },
      { key: "warehouse.read", scopeType: "BRANCH" },
      { key: "warehouse.write", scopeType: "BRANCH" },
      { key: "transfer.create", scopeType: "BRANCH" },
      { key: "transfer.approve", scopeType: "BRANCH" },
      { key: "transfer.ship", scopeType: "BRANCH" },
      { key: "transfer.receive", scopeType: "BRANCH" },
      { key: "transfer.read", scopeType: "BRANCH" },
    ],
  },
  {
    name: "Test - Nhân viên bán hàng",
    phone: "0900000003",
    email: "test.sales@store.com",
    role: "POS_STAFF",
    passwordText: "Test@12345",
    // Quyền sản phẩm, đơn hàng, bảo hành
    permissions: [
      { key: "product.read", scopeType: "BRANCH" },
      { key: "orders.read", scopeType: "BRANCH" },
      { key: "orders.write", scopeType: "BRANCH" },
      { key: "warranty.read", scopeType: "BRANCH" },
      { key: "device.read", scopeType: "BRANCH" },
      { key: "analytics.read.personal", scopeType: "SELF" },
    ],
  },
  {
    name: "Test - Quản lý chi nhánh",
    phone: "0900000004",
    email: "test.branch.manager@store.com",
    role: "ADMIN",
    passwordText: "Test@12345",
    // Quyền toàn diện trong chi nhánh
    permissions: [
      { key: "analytics.read.branch", scopeType: "BRANCH" },
      { key: "analytics.read.assigned", scopeType: "BRANCH" },
      { key: "inventory.read", scopeType: "BRANCH" },
      { key: "inventory.write", scopeType: "BRANCH" },
      { key: "product.read", scopeType: "BRANCH" },
      { key: "product.create", scopeType: "BRANCH" },
      { key: "product.update", scopeType: "BRANCH" },
      { key: "orders.read", scopeType: "BRANCH" },
      { key: "orders.write", scopeType: "BRANCH" },
      { key: "users.read.branch", scopeType: "BRANCH" },
      { key: "users.manage.branch", scopeType: "BRANCH" },
      { key: "warranty.read", scopeType: "BRANCH" },
      { key: "warranty.write", scopeType: "BRANCH" },
      { key: "device.read", scopeType: "BRANCH" },
      { key: "store.manage", scopeType: "BRANCH" },
    ],
  },
];

// =====================================================
// Helpers
// =====================================================
const normalize = (v) => String(v || "").trim();

const removeIfExists = async (phone) => {
  const existing = await User.findOne({ phoneNumber: phone });
  if (existing) {
    await UserPermission.deleteMany({ userId: existing._id });
    await User.deleteOne({ _id: existing._id });
    return true;
  }
  return false;
};

// =====================================================
// Main
// =====================================================
const run = async () => {
  await connectDB();

  // Tải toàn bộ catalog permissions vào map để tìm nhanh
  const allPerms = await Permission.find({ isActive: true }).select("_id key scopeType").lean();
  const catalogMap = new Map(allPerms.map((p) => [normalize(p.key), p]));
  console.log(`Loaded ${catalogMap.size} active permissions from catalog.\n`);

  // Lấy 1 chi nhánh làm mẫu để gán scope branch
  const sampleStore = await Store.findOne({ status: "ACTIVE" }).select("_id name").lean();
  const branchId = sampleStore ? String(sampleStore._id) : "";
  console.log(`Sample branch: ${sampleStore?.name || "(none)"} [${branchId}]\n`);

  const results = [];

  for (const emp of TEST_EMPLOYEES) {
    console.log(`\n--- Đang tạo: ${emp.name} (${emp.phone}) ---`);

    // Xóa user cũ nếu có trùng SĐT
    const removed = await removeIfExists(emp.phone);
    if (removed) console.log("  Đã xóa user cũ.");

    // Tạo user mới
    const user = await User.create({
      fullName: emp.name,
      phoneNumber: emp.phone,
      email: emp.email,
      password: emp.passwordText,
      role: emp.role,
      province: "Hà Nội",
      status: "ACTIVE",
      permissionMode: "EXPLICIT",
      permissionsVersion: 1,
    });
    console.log(`  User tạo - ID: ${user._id}`);

    // Xây dựng grant rows
    const grantRows = [];
    const missing = [];

    for (const { key, scopeType } of emp.permissions) {
      const perm = catalogMap.get(normalize(key));
      if (!perm) {
        missing.push(key);
        continue;
      }

      let scopeId = "";
      if (scopeType === "BRANCH") scopeId = branchId;
      else if (scopeType === "SELF") scopeId = String(user._id);

      grantRows.push({
        userId: user._id,
        permissionId: perm._id,
        scopeType,
        scopeId,
        status: "ACTIVE",
        grantedBy: null,
        grantedAt: new Date(),
        metadata: { source: "TEST_SCRIPT" },
      });
    }

    if (grantRows.length > 0) {
      await UserPermission.insertMany(grantRows);
      console.log(`  Gán ${grantRows.length} quyền thành công.`);
    }
    if (missing.length > 0) {
      console.log(`  ⚠️  Không tìm thấy trong catalog: ${missing.join(", ")}`);
    }

    results.push({
      name: emp.name,
      phone: emp.phone,
      password: emp.passwordText,
      role: emp.role,
      permissions: grantRows.length,
    });
  }

  // Tổng kết
  console.log("\n\n========== KẾT QUẢ ==========");
  for (const r of results) {
    console.log(`✅ ${r.name}`);
    console.log(`   SĐT: ${r.phone} | MK: ${r.password} | Vai trò: ${r.role} | Số quyền: ${r.permissions}`);
  }
  console.log("==============================\n");

  process.exit(0);
};

run().catch((e) => {
  console.error("Script lỗi:", e);
  process.exit(1);
});
