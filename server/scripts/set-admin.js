// Grants or revokes the admin role. Admin can only be set here (server-side),
// never through the API.
//
//   node scripts/set-admin.js --uri <MONGODB_URI> --email you@example.com
//   node scripts/set-admin.js --uri <MONGODB_URI> --email you@example.com --revoke
import path from "path"
import { fileURLToPath } from "url"
import mongoose from "mongoose"
import { assertSafeDatabaseTarget } from "../config/dbGuard.js"
import User from "../models/user.model.js"

const args = process.argv.slice(2)
const arg  = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined }
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  const uri = arg("--uri"), email = arg("--email")
  if (!uri || !email) {
    console.error("Usage: node scripts/set-admin.js --uri <MONGODB_URI> --email <email> [--revoke]")
    process.exit(2)
  }
  try { assertSafeDatabaseTarget(uri) } catch (e) { console.error(e.message); process.exit(2) }
  await mongoose.connect(uri)
  try {
    const role = args.includes("--revoke") ? "user" : "admin"
    const user = await User.findOneAndUpdate({ email }, { $set: { role } }, { returnDocument: "after" })
      .collation({ locale: "en", strength: 2 })
    if (!user) { console.error(`No user with email ${email}`); process.exitCode = 1 }
    else console.log(`${user.email} → role=${user.role}`)
  } finally {
    await mongoose.disconnect()
  }
}
