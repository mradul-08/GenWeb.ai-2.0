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

// The website's current files: multi-page ("static") sites keep them in
// website.files; single-page sites are one index.html held in latestCode.
export const currentFiles = (website) =>
  website.kind === "static" && website.files?.length
    ? website.files.map(f => ({ path: f.path, content: f.content }))
    : [{ path: MAIN_FILE, content: website.latestCode ?? "" }]

const sameManifest = (a, b) =>
  a.length === b.length && a.every((f, i) => f.path === b[i].path && f.blob === b[i].blob)

// Fingerprint of a complete file set (paths, order and content).
export const hashFiles = (files) => sha256(Buffer.from(JSON.stringify(files.map(f => [f.path, f.content])), "utf8"))

async function insertVersion({ projectId, head, files, source, label, userId, session, build }) {
  // File order is kept as given (it is the site's page order).
  const manifest = []
  for (const f of files) {
    const { blob, size } = await putBlob(projectId, f.content, session)
    manifest.push({ path: f.path, blob, size })
  }
  if (head && sameManifest(head.files, manifest)) return { version: head, created: false }
  const [version] = await ProjectVersion.create([{
    project: projectId,
    seq: (head?.seq ?? 0) + 1,
    parent: head?._id ?? null,
    files: manifest,
    source,
    label: cleanLabel(label),
    createdBy: userId ?? null,
    ...(build ? { build } : {}),
  }], { session })
  return { version, created: true }
}

// Core of every save. nextFiles(website) returns the complete new file set.
// In ONE transaction: content blobs, a new immutable version (skipped when
// nothing changed), and the website itself (files, latestCode = index.html,
// headVersion and any extra set/push fields). Websites created before
// version history first get their previous state as a "migration" version.
// build: the template build source when these files were produced by the
// assembler (stored on the version and on the site, with the files' hash).
// kind: switch the site between "single_html" and "static" (multi-page).
async function commit(websiteId, nextFiles, { source, label = "", userId = null, set = {}, push = null, build = null, kind = null, buildInSync = true }) {
  // Two writers racing for the same seq hit the unique index; the loser
  // re-reads the new head and tries again (rare, so a few attempts suffice).
  for (let attempt = 1; ; attempt++) {
    try {
      return await inTransaction(async (session) => {
        const website = await Website.findById(websiteId).select("latestCode headVersion kind files").session(session).lean()
        if (!website) throw new Error(`website missing: ${websiteId}`)
        const before = currentFiles(website)
        const files = nextFiles(website, before)

        let head = website.headVersion ? await ProjectVersion.findById(website.headVersion).session(session).lean() : null
        const unchanged = before.length === files.length && before.every((f, i) => f.path === files[i].path && f.content === files[i].content)
        if (!head && website.latestCode && !unchanged) {
          ;({ version: head } = await insertVersion({ projectId: websiteId, head: null, files: before, source: "migration", label: "Before version history", userId, session }))
        }
        const { version, created } = await insertVersion({ projectId: websiteId, head, files, source, label, userId, session, build })

        const index = files.find(f => f.path === MAIN_FILE) ?? files[0]
        const kindAfter = kind ?? website.kind ?? "single_html"
        const fields = { ...set, latestCode: index.content, headVersion: version._id }
        if (kind) fields.kind = kind
        // buildInSync=false: the files also contain edits the build cannot reproduce.
        if (build) fields.build = { ...build, filesHash: buildInSync ? hashFiles(files) : null }
        const update = { $set: fields }
        if (kindAfter === "static") fields.files = files
        else if (website.files) update.$unset = { files: "" }
        if (push) update.$push = push
        await Website.updateOne({ _id: websiteId }, update, { session })
        return { id: version._id, seq: version.seq, created }
      })
    } catch (e) {
      if (attempt >= 3 || !isDuplicateKeyError(e)) throw e
    }
  }
}

export class UnknownPageError extends Error {}

// Saves one file (default index.html). On a multi-page site only that page
// changes; the other pages are carried into the new version unchanged.
export function commitCode(websiteId, code, { path = MAIN_FILE, ...opts }) {
  return commit(websiteId, (website, before) => {
    if (!before.some(f => f.path === path)) throw new UnknownPageError(`No page "${path}" in this website`)
    return before.map(f => (f.path === path ? { path, content: code } : f))
  }, opts)
}

// Replaces the complete file set (generation, restore of a version).
export function commitFiles(websiteId, files, opts) {
  return commit(websiteId, () => files.map(f => ({ path: f.path, content: f.content })), opts)
}

// Derives the new file set from the CURRENT files inside the transaction, so
// changes that touch several pages never overwrite a concurrent save with a
// stale snapshot. transform(files) → files.
export function commitTransform(websiteId, transform, opts) {
  return commit(websiteId, (website, before) => transform(before), opts)
}

// Gives a website created before version history its first version, so the
// history is never empty. Idempotent.
export async function ensureVersioned(website) {
  if (website.headVersion) return
  await commitFiles(website._id, currentFiles(website), { source: "migration", label: "Before version history" })
}

export async function listVersions(websiteId) {
  return ProjectVersion.find({ project: websiteId })
    .sort({ seq: -1 })
    .limit(MAX_LIST)
    .select("seq source label pinned files.size createdAt")
    .lean()
}

// Returns { version, code, files } for a version of this website, or null.
// code = its index.html (what single-page callers and previews need).
export async function getVersionCode(websiteId, versionId) {
  const version = await ProjectVersion.findOne({ _id: versionId, project: websiteId }).lean()
  if (!version) return null
  const files = []
  for (const f of version.files) files.push({ path: f.path, content: await readBlob(f.blob) })
  return { version, code: (files.find(f => f.path === MAIN_FILE) ?? files[0]).content, files }
}

export async function updateVersionMeta(websiteId, versionId, { label, pinned }) {
  const set = {}
  if (label !== undefined) set.label = cleanLabel(label)
  if (pinned !== undefined) set.pinned = pinned
  return ProjectVersion.findOneAndUpdate(
    { _id: versionId, project: websiteId },
    { $set: set },
    { returnDocument: "after" }
  ).select("seq source label pinned createdAt").lean()
}

export async function deleteHistory(websiteId) {
  await ProjectVersion.deleteMany({ project: websiteId })
  await Blob.deleteMany({ project: websiteId })
}
