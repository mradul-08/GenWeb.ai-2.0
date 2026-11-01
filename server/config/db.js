import mongoose from "mongoose";
import { assertSafeDatabaseTarget } from "./dbGuard.js";

// Indexes are created explicitly (see ensureIndexes) instead of lazily in the
// background, so unique indexes that payment idempotency relies on exist
// before the server accepts requests.
mongoose.set("autoIndex", false);

// Creates missing indexes for every registered model. Additive only — unlike
// syncIndexes() it never drops indexes.
export async function ensureIndexes() {
  for (const model of Object.values(mongoose.models)) {
    await model.createIndexes();
  }
}

const connectDb = async (uri = process.env.MONGODB_URI || process.env.MONGODB_URL) => {
  // MONGODB_URI is the documented name; MONGODB_URL kept for existing .env files.
  // Throws before any connection if the URI does not fit APP_ENV (see dbGuard.js).
  const target = assertSafeDatabaseTarget(uri);
  console.log(`DB target allowed: ${target.reason}`);
  await mongoose.connect(uri);
  console.log("DB connected");
  await ensureIndexes();
  console.log("DB indexes ensured");
};

export default connectDb;
