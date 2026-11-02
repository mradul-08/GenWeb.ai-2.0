// Server-side version history. Every change to a website's code goes through
// commitCode, which in ONE transaction:
//   1. stores the content (gzip blob, deduplicated per project),
//   2. inserts an immutable version (skipped when the code did not change),
//   3. updates the website (latestCode, headVersion and any extra fields).
// Websites created before version history get a "migration" version holding
// their previous code the first time anything touches them, so the state
// before the first tracked change can always be restored.
import crypto from "crypto"
import zlib from "zlib"
import Website from "../models/website.model.js"
import { Blob, ProjectVersion } from "../models/version.models.js"
import { inTransaction, isDuplicateKeyError } from "./credits.js"

// Single-HTML projects have one file. Multi-file projects (roadmap R2) will
// store more paths in the same manifest.
export const MAIN_FILE = "index.html"
const MAX_LIST = 100
const MAX_LABEL = 120

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex")
const cleanLabel = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL)

async function putBlob(projectId, content, session) {
  const raw = Buffer.from(content, "utf8")
  const _id = `${projectId}:${sha256(raw)}`
  await Blob.updateOne(
    { _id },
    { $setOnInsert: { project: projectId, size: raw.length, data: zlib.gzipSync(raw) } },
    { upsert: true, session }
  )
  return { blob: _id, size: raw.length }
}

export async function readBlob(blobId, session) {
  const b = await Blob.findById(blobId).session(session ?? null).lean()
  if (!b) throw new Error(`blob missing: ${blobId}`)
  return zlib.gunzipSync(b.data.buffer ?? b.data).toString("utf8")
}

async function insertVersion({ projectId, head, content, source, label, userId, session }) {
  const { blob, size } = await putBlob(projectId, content, session)
  if (head && head.files.length === 1 && head.files[0].blob === blob) return { version: head, created: false }
  const [version] = await ProjectVersion.create([{
    project: projectId,
    seq: (head?.seq ?? 0) + 1,
    parent: head?._id ?? null,
    files: [{ path: MAIN_FILE, blob, size }],
    source,
    label: cleanLabel(label),
    createdBy: userId ?? null,
  }], { session })
  return { version, created: true }
}

// Saves code as the website's current state and records it as a version.
// set/push: extra website fields to write in the same transaction (e.g.
// thumbnail fields, conversation messages). Returns the head version summary.
export async function commitCode(websiteId, code, { source, label = "", userId = null, set = {}, push = null }) {
  // Two writers racing for the same seq hit the unique index; the loser
  // re-reads the new head and tries again (rare, so a few attempts suffice).
  for (let attempt = 1; ; attempt++) {
    try {
      return await inTransaction(async (session) => {
        const website = await Website.findById(websiteId).select("latestCode headVersion").session(session).lean()
        if (!website) throw new Error(`website missing: ${websiteId}`)

        let head = website.headVersion ? await ProjectVersion.findById(website.headVersion).session(session).lean() : null
        if (!head && website.latestCode && website.latestCode !== code) {
          ;({ version: head } = await insertVersion({ projectId: websiteId, head: null, content: website.latestCode, source: "migration", label: "Before version history", userId, session }))
        }
        const { version, created } = await insertVersion({ projectId: websiteId, head, content: code, source, label, userId, session })

        const update = { $set: { ...set, latestCode: code, headVersion: version._id } }
        if (push) update.$push = push
        await Website.updateOne({ _id: websiteId }, update, { session })
        return { id: version._id, seq: version.seq, created }
      })
    } catch (e) {
      if (attempt >= 3 || !isDuplicateKeyError(e)) throw e
    }
  }
}

// Gives a website created before version history its first version, so the
// history is never empty. Idempotent.
export async function ensureVersioned(website) {
  if (website.headVersion) return
  await commitCode(website._id, website.latestCode, { source: "migration", label: "Before version history" })
}

export async function listVersions(websiteId) {
  return ProjectVersion.find({ project: websiteId })
    .sort({ seq: -1 })
    .limit(MAX_LIST)
    .select("seq source label files.size createdAt")
    .lean()
}

// Returns { version, code } for a version of this website, or null.
export async function getVersionCode(websiteId, versionId) {
  const version = await ProjectVersion.findOne({ _id: versionId, project: websiteId }).lean()
  if (!version) return null
  const file = version.files.find(f => f.path === MAIN_FILE)
  return { version, code: await readBlob(file.blob) }
}

export async function deleteHistory(websiteId) {
  await ProjectVersion.deleteMany({ project: websiteId })
  await Blob.deleteMany({ project: websiteId })
}
