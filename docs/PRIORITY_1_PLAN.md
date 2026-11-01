# Priority 1 — Implementation Plan: security and financial correctness

Base: `websiteBuilder-v2`. Scope is Priority 1 only; Priority 2 (AI) and Priority 3 (multi-file) are not started.

## 1. Design decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Source of truth for balance | `users.credits` stays authoritative. Every change to it happens **in the same MongoDB transaction** as an append-only `credit_transactions` row. | Existing code and UI read `credits`; no data rewrite needed; the ledger adds history and idempotency. |
| Idempotency | Every ledger row has a globally unique `idempotencyKey` (`purchase:<orderId>`, `spend:<uuid>`, `refund:<uuid>`, `signup:<userId>`, `opening:<userId>`). A duplicate insert aborts the whole transaction, so the balance cannot move twice. | Covers verify + webhook races, client retries and replays. |
| Payment crediting | One function, `grantPurchaseForOrder`, is used by both `/verify` and the webhook. It inserts a `payments` row (unique `orderId` and `paymentId`) plus a ledger row and `$inc`s the user, all in one transaction. | Whichever path arrives first wins; the other is reported as "already processed". |
| Webhook | `POST /api/payment/webhook`, raw body, HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET` (constant-time compare). Handles `order.paid` and `payment.captured`. Pack, amount and user are taken from the server-created order (`notes`), never from the client. | Fixes "paid but tab closed → no credits" (SEC-8). |
| Transactions | `session.withTransaction()` (retries transient write conflicts). Needs a replica set. Atlas clusters, including M0, are replica sets [A — the cluster tier was not verified]. Tests use an in-memory replica set. | Atomic ledger + balance. |
| Indexes | Created explicitly at startup with `Model.createIndexes()` **before** the server starts listening; `autoIndex` off. No `syncIndexes` (it can drop indexes). | Unique indexes must exist before the first payment is processed. |
| Sessions | `users.tokenVersion` (default 0) is embedded in the JWT as `v`. `POST /api/auth/logout-all` increments it, which invalidates every existing session. Old JWTs without `v` count as version 0, so current users stay logged in. | SEC-10, without breaking existing sessions. |
| Email matching | Lookup by email uses a case-insensitive collation. Firebase lowercases emails; v1 accounts may not be lowercase [A]. | Prevents a duplicate account (and "lost" projects) for mixed-case v1 emails. |
| Rate limiting | Small in-memory fixed-window limiter (no new dependency), keyed by user id or IP, with `trust proxy` set for Render. | Single Render instance today; swap the store to Redis when scaling (documented). |
| Preview isolation | Editor and Generate previews switch from blob URL + `allow-same-origin` to `srcDoc` with an opaque-origin sandbox (no `allow-same-origin`), plus a storage shim. | SEC-11: generated code can no longer reach the app's origin, cookies-in-JS or Redux state. |
| Provider failures | 3 consecutive non-OK responses put a key on a 3-minute cooldown (it previously stayed in rotation forever). | Avoids hammering a failing key; real routing redesign is Priority 2. |
| Error hygiene | 5xx responses return generic messages; details go to server logs only. | BE-4: no internal or DB error text reaches clients. |

## 2. Files

**New**
- `server/app.js` — the Express app without `listen`, for tests.
- `server/models/creditTransaction.model.js`
- `server/services/credits.js` — `reserveCredits`, `refundCredits`, `grantSignupCredits`, `grantPurchaseForOrder`.
- `server/config/razorpay.js` — client factory; injectable for tests.
- `server/middlewares/rateLimit.js`
- `server/scripts/migrate-credit-ledger.js` — dry-run by default; `--apply`; `--rollback`.
- `server/scripts/reconcile-credits.js` — read-only report.
- `server/tests/*.test.js` — `node:test` + supertest + mongodb-memory-server.
- `server/.env.example`, `client/.env.example`.

**Modified**
- `server/index.js` — connect DB → create indexes → listen; `/health`.
- `server/config/db.js`
- `server/models/{user,payment,website}.model.js` — `tokenVersion`; `Payment.source`; `{user, createdAt}` indexes.
- `server/controllers/{payment,auth,website,user}.controllers.js`, `server/routes/{payment,auth}.router.js`
- `server/middlewares/isAuth.js` — `tokenVersion` check.
- `server/utils/verifyFirebaseToken.js` — injectable cert source for tests.
- `server/config/openRouter.js` — failure cooldown.
- `server/package.json` — test script, dev dependencies.
- `client/src/pages/Editor.jsx`, `client/src/pages/Generate.jsx` — isolated preview.
- `client/src/utils/previewDoc.js` (new).

## 3. Database changes (all additive)

| Collection | Change |
| --- | --- |
| `credit_transactions` (new) | `{ user, type, amount, balanceAfter, idempotencyKey (unique), ref{orderId,paymentId,websiteId}, note, createdAt }`, index `{user:1, createdAt:-1}` |
| `payments` | + `source` ('verify' / 'webhook'), + index `{user:1, createdAt:-1}` (unique `orderId` and `paymentId` already exist) |
| `users` | + `tokenVersion` (default 0, absent counts as 0), + `ledgerOpenedAt`. Existing unique `email` and sparse unique `firebaseUid` unchanged. |
| `websites` | + index `{user:1, createdAt:-1}`. Matches the only list queries: `find({user}).sort({createdAt:-1})` in `user.controllers.js` and `website.controller.js`. |

No existing field is renamed, removed or rewritten.

## 4. API changes

- **New:** `POST /api/payment/webhook` (Razorpay only, signature required), `POST /api/auth/logout-all`, `GET /health`.
- **Unchanged contracts:** `/api/payment/verify` and `/create-order` (verify ignores `packId` from the body, as already in v2), plus all website and auth routes.
- **New error status:** `429 Too Many Requests` with `Retry-After` when rate limits are hit.

## 5. Security implications

- The webhook endpoint is public but useless without the secret. Without `RAZORPAY_WEBHOOK_SECRET` it answers 503 and processes nothing.
- The webhook is mounted before the JSON parser, auth and CSRF middleware. It is protected by its signature, not by cookies or origin.
- The ledger makes the credit math auditable. `reconcile-credits.js` detects drift between the ledger and balances.

## 6. Migration strategy

1. Deploy code. Indexes are created on startup (additive). New activity is ledgered from then on.
2. Take a backup (`mongodump` or an Atlas snapshot).
3. Restore the backup into a **separate test database**, then run `node scripts/migrate-credit-ledger.js --uri <TEST_URI>` (dry run), then `--apply`, then `reconcile-credits.js`.
4. Only after that succeeds, run it against production. The script requires an explicit `--uri`; it never reads `.env`.
5. The opening balance for each user is `credits − sum(existing ledger rows)`. It is written in a transaction that also touches the user document, so a concurrent spend forces a retry. The script is idempotent (`opening:<userId>`).

## 7. Rollback plan

- **Code:** redeploy the previous build. v1/v2 code ignores the new collections and fields.
- **Ledger data:** `migrate-credit-ledger.js --rollback --uri …` deletes only `type: "opening_balance"` rows. Balances never change during migration or rollback.
- **Indexes:** harmless if left; they can be dropped by name if needed.

## 8. Test cases

| # | Test |
| --- | --- |
| T1 | Forged, expired, wrong-audience and unverified-email Firebase tokens are rejected; a valid token creates a user + signup ledger row |
| T2 | Mixed-case v1 email account is matched, not duplicated |
| T3 | `logout-all` invalidates old JWTs; a JWT without `v` still works for `tokenVersion` 0 |
| T4 | User A cannot read, edit, deploy or delete user B's website (404) |
| T5 | `/verify`: bad signature 400; other user's order 403; amount/pack mismatch 400; success grants once |
| T6 | `/verify` called twice → credits granted once |
| T7 | `/verify` and webhook **concurrently** for the same order → exactly one grant |
| T8 | Webhook: bad signature 401; missing secret 503; replayed event → one grant; unrelated event 200 ignored |
| T9 | Credit reserve: 10 concurrent reserves with a balance for only 2 → exactly 2 succeed, balance never negative, ledger sums match |
| T10 | Refund is idempotent (calling twice refunds once) |
| T11 | Rate limiter returns 429 after the limit and resets after the window |
| T12 | CSRF origin check still blocks foreign origins; the webhook works without an Origin header |
| T13 | Migration dry-run changes nothing; apply makes the ledger reconcile; second apply is a no-op; rollback removes only opening rows |
