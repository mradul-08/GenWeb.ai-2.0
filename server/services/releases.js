import mongoose from "mongoose"
import Website from "../models/website.model.js"
import Release from "../models/release.model.js"
import { ProjectVersion } from "../models/version.models.js"
import { inTransaction } from "./credits.js"

const releaseUrl = (slug, kind) => {
  const base = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3002}`
  return `${base}/s/${slug}${kind === "static" ? "/" : ""}`
}

export async function publishRelease(websiteId, { userId, slug }) {
  return inTransaction(async (session) => {
    const website = await Website.findOne({ _id: websiteId, user: userId }).session(session).lean()
    if (!website || !website.headVersion) return null
    const version = await ProjectVersion.findOne({ _id: website.headVersion, project: websiteId }).session(session).lean()
    if (!version) throw new Error("Current project version is missing")
    await Release.updateMany({ project: websiteId, status: "live" }, { $set: { status: "superseded" } }, { session })
    const [release] = await Release.create([{ project: websiteId, version: version._id, slug, status: "live", createdBy: userId }], { session })
    const deployUrl = releaseUrl(slug, website.kind)
    await Website.updateOne({ _id: websiteId }, { $set: { deployed: true, liveRelease: release._id, deployUrl } }, { session })
    return { release, deployUrl }
  })
}

export async function listReleases(websiteId, userId) {
  const own = await Website.exists({ _id: websiteId, user: userId })
  if (!own) return null
  return Release.find({ project: websiteId }).sort({ createdAt: -1 }).select("version slug status createdAt").lean()
}

export async function rollbackRelease(websiteId, releaseId, userId) {
  if (!mongoose.isValidObjectId(releaseId)) return null
  return inTransaction(async (session) => {
    const website = await Website.findOne({ _id: websiteId, user: userId }).session(session).lean()
    if (!website) return null
    const target = await Release.findOne({ _id: releaseId, project: websiteId }).session(session).lean()
    if (!target) return null
    if (String(website.liveRelease) === String(target._id)) return { release: target, deployUrl: website.deployUrl, changed: false }
    await Release.updateMany({ project: websiteId, status: "live" }, { $set: { status: "rolled_back" } }, { session })
    const updated = await Release.findOneAndUpdate({ _id: target._id, project: websiteId }, { $set: { status: "live" } }, { returnDocument: "after", session }).lean()
    const deployUrl = releaseUrl(updated.slug, website.kind)
    await Website.updateOne({ _id: websiteId }, { $set: { deployed: true, liveRelease: updated._id, deployUrl } }, { session })
    return { release: updated, deployUrl, changed: true }
  })
}

export async function undeployRelease(websiteId, userId) {
  return inTransaction(async (session) => {
    const website = await Website.findOne({ _id: websiteId, user: userId }).session(session).lean()
    if (!website) return null
    await Website.updateOne({ _id: websiteId }, { $set: { deployed: false, deployUrl: "", liveRelease: null } }, { session })
    return true
  })
}

export async function deleteReleases(websiteId) {
  await Release.deleteMany({ project: websiteId })
}
