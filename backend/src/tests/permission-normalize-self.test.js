import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { normalizeRequestedPermissionAssignments } from "../authz/userPermissionService.js";

let mongoServer;

before(
  async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "permission-normalize-self-test",
    });
  },
  { timeout: 120000 }
);

after(
  async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  },
  { timeout: 120000 }
);

test("SELF scope prefers targetUserId over provided scopeId", async () => {
  const targetUserId = new mongoose.Types.ObjectId().toString();

  const { assignments, errors } = await normalizeRequestedPermissionAssignments({
    targetUserId,
    permissions: [
      {
        key: "analytics.read.personal",
        scopeType: "SELF",
        scopeId: "new-user-preview",
      },
    ],
  });

  assert.equal(errors.length, 0);
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].scopeType, "SELF");
  assert.equal(assignments[0].scopeId, targetUserId);
});
