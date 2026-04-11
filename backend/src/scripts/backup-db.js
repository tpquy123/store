import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

import Order from "../modules/order/Order.js";
import UniversalProduct from "../modules/product/UniversalProduct.js";
import "../modules/productType/ProductType.js";
import WarrantyRecord from "../modules/warranty/WarrantyRecord.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupRoot = path.resolve(
  __dirname,
  "../../backups/full-backup",
  new Date().toISOString().replace(/[:.]/g, "-")
);

const main = async () => {
  if (!process.env.MONGODB_CONNECTIONSTRING) {
    throw new Error("Missing MONGODB_CONNECTIONSTRING");
  }

  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
  console.log("Connected to MongoDB for backup...");

  await fs.mkdir(backupRoot, { recursive: true });

  const models = [
    { name: "Orders", model: Order },
    { name: "UniversalProducts", model: UniversalProduct },
    { name: "WarrantyRecords", model: WarrantyRecord }
  ];

  for (const { name, model } of models) {
    console.log(`Backing up ${name}...`);
    const data = await model.find({}, null, { skipBranchIsolation: true }).lean();
    await fs.writeFile(
      path.join(backupRoot, `${name}.json`),
      JSON.stringify(data, null, 2),
      "utf8"
    );
    console.log(`${name} backup completed with ${data.length} records.`);
  }

  console.log(`Backup saved to ${backupRoot}`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
