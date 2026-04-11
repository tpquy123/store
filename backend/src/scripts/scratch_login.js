import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../modules/auth/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function test() {
  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
  console.log("Connected to DB");

  const users = await User.find({ role: "CUSTOMER" }).limit(1).select("+password");
  if (!users.length) {
    console.log("No CUSTOMER users found.");
  } else {
    const user = users[0];
    console.log("Testing auth login for user:", user.phoneNumber);

    const valid = await user.comparePassword("password123"); 
    // it doesn't matter if it's the correct password for test, it should not throw.
    console.log("Password valid?", valid);
    
    // Test the buildEffectivePermissionsPayload
    const { resolveEffectiveAccessContext } = await import("../authz/authorizationService.js");
    const { normalizeUserAccess } = await import("../authz/userAccessResolver.js");
    const { ensurePermissionTemplatesSeeded } = await import("../authz/permissionTemplateService.js");

    console.log("Calling normalizeUserAccess");
    const normalized = normalizeUserAccess(user);
    console.log("Normalized access:", normalized);

    console.log("Calling resolveEffectiveAccessContext");
    const resolvedContext = await resolveEffectiveAccessContext({
        user,
        normalizedAccess: normalized,
        activeBranchId: normalized.activeBranchId || normalized.defaultBranchId || "",
    });
    console.log("Context is resolved!");
  }
  await mongoose.disconnect();
}

test().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
