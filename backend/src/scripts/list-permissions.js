import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import Permission from "../modules/auth/Permission.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const run = async () => {
  await connectDB();
  const all = await Permission.find({ isActive: true })
    .select("key scopeType isSensitive module")
    .lean();

  console.log(`\nTotal active permissions: ${all.length}\n`);
  const grouped = {};
  for (const p of all) {
    const mod = p.module || "general";
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(p);
  }
  for (const [mod, perms] of Object.entries(grouped)) {
    console.log(`\n=== ${mod.toUpperCase()} ===`);
    for (const p of perms) {
      console.log(`  - ${p.key} [${p.scopeType}]${p.isSensitive ? " ⚠️ SENSITIVE" : ""}`);
    }
  }
  process.exit(0);
};

run().catch(e => { console.error(e); process.exit(1); });
