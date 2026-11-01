// Read-only check that every ledgered user's users.credits equals the sum of
// their ledger rows. Exits with code 1 if any mismatch is found.
//
//   node scripts/reconcile-credits.js --uri <MONGODB_URI>
import path from "path"
import { fileURLToPath } from "url"
import mongoose from "mongoose"
import { assertSafeDatabaseTarget } from "../config/dbGuard.js"
import User from "../models/user.model.js"
import CreditTransaction from "../models/creditTransaction.model.js"

export async function reconcileCredits() {
  const sums = await CreditTransaction.aggregate([
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: "$user", sum: { $sum: "$amount" }, rows: { $sum: 1 } } },
  ])
  const byUser = new Map(sums.map(s => [String(s._id), s]))

  const report = { users: 0, ledgered: 0, notLedgered: 0, mismatches: [] }
  for await (const u of User.find({}, { credits: 1 }).lean().cursor()) {
    report.users++
    const s = byUser.get(String(u._id))
    if (!s) { report.notLedgered++; continue }
    report.ledgered++
    if (s.sum !== (u.credits ?? 0)) {
      report.mismatches.push({ user: String(u._id), credits: u.credits, ledgerSum: s.sum, rows: s.rows })
    }
  }
  return report
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const args = process.argv.slice(2)
  const uri  = args[args.indexOf("--uri") + 1]
  if (!args.includes("--uri") || !uri || uri.startsWith("--")) {
    console.error("Usage: node scripts/reconcile-credits.js --uri <MONGODB_URI>")
    process.exit(2)
  }
  try { assertSafeDatabaseTarget(uri) } catch (e) { console.error(e.message); process.exit(2) }
  await mongoose.connect(uri)
  try {
    const report = await reconcileCredits()
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.mismatches.length ? 1 : 0
  } finally {
    await mongoose.disconnect()
  }
}
