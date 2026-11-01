// Opens the credit ledger for users created before it existed by writing one
// opening_balance row per user. Balances (users.credits) are never changed.
//
//   node scripts/migrate-credit-ledger.js --uri <MONGODB_URI>            dry run (default)
//   node scripts/migrate-credit-ledger.js --uri <MONGODB_URI> --apply    write rows
//   node scripts/migrate-credit-ledger.js --uri <MONGODB_URI> --rollback delete opening rows
//
// The URI must be passed explicitly — this script never reads .env, so it
// cannot hit production by accident. Run against a restored test copy first.
//
// Opening amount = credits − sum(ledger rows the user already has), so users
// who already spent or bought through the ledger after the v2 deploy still
// reconcile. Each user is handled in a transaction that also writes the user
// document, so a concurrent spend forces a retry instead of a skewed opening.
import path from "path"
import { fileURLToPath } from "url"
import mongoose from "mongoose"
import { assertSafeDatabaseTarget } from "../config/dbGuard.js"
import User from "../models/user.model.js"
import CreditTransaction from "../models/creditTransaction.model.js"
import { ensureIndexes } from "../config/db.js"
import { inTransaction, isDuplicateKeyError } from "../services/credits.js"

export async function migrateCreditLedger({ apply = false, log = console.log } = {}) {
  const stats = { users: 0, alreadyOpen: 0, opened: 0, wouldOpen: 0 }
  const cursor = User.find({}, { _id: 1 }).lean().cursor()

  for await (const { _id: userId } of cursor) {
    stats.users++
    const work = async (session) => {
      const user = await User.findById(userId).session(session)
      if (!user) return "gone"
      const hasOpening = await CreditTransaction.exists({
        user: userId, type: { $in: ["opening_balance", "signup_bonus"] },
      }).session(session)
      if (hasOpening) return "open"

      const [agg] = await CreditTransaction.aggregate([
        { $match: { user: user._id } },
        { $group: { _id: null, sum: { $sum: "$amount" } } },
      ]).session(session)
      const opening = (user.credits ?? 0) - (agg?.sum ?? 0)
      if (!apply) return { dry: opening }

      await CreditTransaction.create([{
        user: userId, type: "opening_balance", amount: opening, balanceAfter: user.credits,
        idempotencyKey: `opening:${userId}`, note: "ledger migration",
      }], { session })
      await User.updateOne({ _id: userId }, { $set: { ledgerOpenedAt: new Date() } }, { session })
      return { applied: opening }
    }

    let result
    try {
      result = apply ? await inTransaction(work) : await work(null)
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e
      result = "open"
    }
    if (result === "open") stats.alreadyOpen++
    else if (result?.applied !== undefined) stats.opened++
    else if (result?.dry !== undefined) { stats.wouldOpen++; log(`  would open ${userId}: ${result.dry}`) }
  }
  return stats
}

export async function rollbackCreditLedger() {
  const openedUsers = await CreditTransaction.distinct("user", { type: "opening_balance" })
  const { deletedCount } = await CreditTransaction.deleteMany({ type: "opening_balance" })
  // Users opened by the migration lose the marker; signup-ledgered users keep it.
  const signupUsers = await CreditTransaction.distinct("user", { type: "signup_bonus" })
  await User.updateMany(
    { _id: { $in: openedUsers, $nin: signupUsers } },
    { $unset: { ledgerOpenedAt: "" } }
  )
  return { deletedOpeningRows: deletedCount }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const args = process.argv.slice(2)
  const uri  = args[args.indexOf("--uri") + 1]
  if (!args.includes("--uri") || !uri || uri.startsWith("--")) {
    console.error("Usage: node scripts/migrate-credit-ledger.js --uri <MONGODB_URI> [--apply | --rollback]")
    process.exit(2)
  }
  mongoose.set("autoIndex", false)
  try { assertSafeDatabaseTarget(uri) } catch (e) { console.error(e.message); process.exit(2) }
  await mongoose.connect(uri)
  console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`)
  try {
    if (args.includes("--rollback")) {
      console.log(await rollbackCreditLedger())
    } else {
      await ensureIndexes()
      const apply = args.includes("--apply")
      console.log(apply ? "APPLY mode" : "DRY RUN (no writes) — add --apply to write")
      console.log(await migrateCreditLedger({ apply }))
    }
  } finally {
    await mongoose.disconnect()
  }
}
