import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import User from "../modules/auth/User.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function listUsers() {
  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
  const users = await User.find({ role: "CUSTOMER" }).limit(5).select("+password");
  users.forEach(u => {
    console.log(`Phone: ${u.phoneNumber}, PW length: ${u.password ? u.password.length : 'none'}, PW prefix: ${u.password ? u.password.substring(0, 7) : ''}`);
  });
  await mongoose.disconnect();
}
listUsers();
