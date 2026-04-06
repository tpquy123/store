import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import Role from "../modules/auth/Role.js";
import { ensurePermissionCatalogSeeded } from "../authz/permissionCatalog.js";
import { ensurePermissionTemplatesSeeded } from "../authz/permissionTemplateService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const run = async () => {
  await connectDB();
  await ensurePermissionCatalogSeeded();
  await ensurePermissionTemplatesSeeded();

  const roles = await Role.find({ isActive: true })
    .select("key name scopeType permissions")
    .sort({ key: 1 })
    .lean();

  console.log(`Seeded ${roles.length} canonical roles`);
  for (const role of roles) {
    console.log(
      `${role.key} [${role.scopeType}] -> ${Array.isArray(role.permissions) ? role.permissions.length : 0} permissions`,
    );
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Seed canonical roles failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
