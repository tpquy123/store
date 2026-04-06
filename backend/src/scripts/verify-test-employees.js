import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import User from "../modules/auth/User.js";
import Permission from "../modules/auth/Permission.js";
import UserPermission from "../modules/auth/UserPermission.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const TEST_PHONES = ["0900000001", "0900000002", "0900000003", "0900000004"];

const run = async () => {
  await connectDB();

  // Load permission catalog for lookup
  const allPerms = await Permission.find({ isActive: true }).select("_id key scopeType").lean();
  const permById = new Map(allPerms.map((p) => [String(p._id), p]));

  for (const phone of TEST_PHONES) {
    const user = await User.findOne({ phoneNumber: phone })
      .select("fullName phoneNumber role status permissionMode")
      .lean();

    if (!user) {
      console.log(`\n❌ Không tìm thấy user ${phone}`);
      continue;
    }

    const grants = await UserPermission.find({ userId: user._id, status: "ACTIVE" }).lean();
    const userId = String(user._id);

    console.log(`\n✅ ${user.fullName}`);
    console.log(`   Vai trò: ${user.role} | Mode: ${user.permissionMode}`);
    console.log(`   SĐT: ${user.phoneNumber}`);
    console.log(`   Số quyền active: ${grants.length}`);

    for (const g of grants) {
      const perm = permById.get(String(g.permissionId));
      const key = perm?.key || String(g.permissionId);
      const scopeInfo = g.scopeType + (g.scopeId && g.scopeId !== userId ? ` (${g.scopeId.slice(0, 8)}...)` : g.scopeId === userId ? " (bản thân)" : "");
      console.log(`     - ${key} [${scopeInfo}]`);
    }
  }

  process.exit(0);
};

run().catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
