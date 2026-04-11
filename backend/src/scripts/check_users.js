import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../modules/auth/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function check() {
  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
  
  const total = await User.countDocuments({ role: "CUSTOMER" });
  const withoutPassword = await User.countDocuments({ role: "CUSTOMER", password: { $exists: false } });
  const locked = await User.countDocuments({ role: "CUSTOMER", status: "LOCKED" });

  console.log(`Total CUSTOMER: ${total}`);
  console.log(`CUSTOMER without password: ${withoutPassword}`);
  console.log(`CUSTOMER locked: ${locked}`);

  await mongoose.disconnect();
}

check();
