import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// File contents, gzip-compressed and addressed by project + sha256 of the raw
// content, so an unchanged file is stored once per project no matter how many
// versions reference it. Scoped per project (not global) so deleting a
// project deletes its content.
const blobSchema = new mongoose.Schema({
  _id:     { type: String },                      // "<projectId>:<sha256 hex>"
  project: { type: ObjectId, ref: "Website", required: true },
  size:    { type: Number, required: true },      // raw bytes
  data:    { type: Buffer, required: true },      // gzip
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
blobSchema.index({ project: 1 })

// An immutable snapshot of a project: which content each file had. Versions
// are only ever inserted; restoring an old one inserts a new version.
export const VERSION_SOURCES = ["migration", "generate", "ai_edit", "manual_save", "deploy", "restore"]

const versionSchema = new mongoose.Schema({
  project: { type: ObjectId, ref: "Website", required: true },
  seq:     { type: Number, required: true },      // 1, 2, 3… per project
  parent:  { type: ObjectId, default: null },
  files:   [{ _id: false, path: { type: String, required: true }, blob: { type: String, required: true }, size: { type: Number, required: true } }],
  source:  { type: String, enum: VERSION_SOURCES, required: true },
  label:   { type: String, default: "" },         // short human description shown in the history
  createdBy: { type: ObjectId, ref: "User", default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
// Unique: two concurrent writers cannot both create version N.
versionSchema.index({ project: 1, seq: -1 }, { unique: true })

export const Blob           = mongoose.model("Blob", blobSchema, "blobs")
export const ProjectVersion = mongoose.model("ProjectVersion", versionSchema, "project_versions")
