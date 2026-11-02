import mongoose from "mongoose"

const releaseSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Website", required: true },
  version: { type: mongoose.Schema.Types.ObjectId, ref: "ProjectVersion", required: true },
  slug: { type: String, required: true },
  status: { type: String, enum: ["live", "superseded", "rolled_back"], required: true, default: "live" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false })

releaseSchema.index({ project: 1, createdAt: -1 })
releaseSchema.index({ project: 1, status: 1 })
releaseSchema.index({ version: 1 })

const Release = mongoose.model("Release", releaseSchema, "releases")
export default Release
