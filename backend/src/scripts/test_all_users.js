import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../modules/auth/User.js";
import { resolveEffectiveAccessContext } from "../authz/authorizationService.js";
import { normalizeUserAccess } from "../authz/userAccessResolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testAll() {
  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
  const users = await User.find({ role: "CUSTOMER" }).select("+password");
  let failed = 0;
  for (const user of users) {
    try {
      const normalized = normalizeUserAccess(user);
      const effective = await resolveEffectiveAccessContext({
        user,
        normalizedAccess: normalized,
        activeBranchId: normalized.activeBranchId || normalized.defaultBranchId || "",
      });
    } catch (err) {
      console.log(`Failed for user ${user._id} / ${user.phoneNumber}: ${err.message}`);
      failed++;
    }
  }
  console.log(`Tested ${users.length} users, ${failed} failed.`);
  await mongoose.disconnect();
}
testAll();
