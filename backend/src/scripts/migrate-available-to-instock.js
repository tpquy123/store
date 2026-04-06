import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const uri = process.env.MONGODB_CONNECTIONSTRING;

if (!uri) {
  console.error("[migrate] Missing MONGODB_CONNECTIONSTRING in env.");
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection("universalproducts");

  const before = await col.countDocuments({ status: "AVAILABLE" });
  const result = await col.updateMany(
    { status: "AVAILABLE" },
    { $set: { status: "IN_STOCK" } }
  );
  const after = await col.countDocuments({ status: "AVAILABLE" });

  console.log("[migrate] universalproducts status AVAILABLE -> IN_STOCK", {
    before,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    after,
  });

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
