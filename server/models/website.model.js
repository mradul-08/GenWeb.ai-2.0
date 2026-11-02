import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["ai", "user"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const websiteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      default: "Untitled Website",
    },

    latestCode: {
      type: String,
      required: true,
    },

    conversation: [messageSchema],

    // Current version in project_versions (services/versions.js). Null for
    // websites created before version history until they are first changed.
    headVersion: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    deployed: {
      type: Boolean,
      default: false,
    },

    deployUrl: {
      type: String,
    },

    slug: {
      type: String,
      unique: true,
    },

    // ── Thumbnail meta — extracted at generation time, zero API cost ──
    thumbnailBg: {
      type: String,
      default: "#0a0a0f",
    },
    thumbnailAccent: {
      type: String,
      default: "#818cf8",
    },
    thumbnailTitle: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Serves the project list queries: find({ user }).sort({ createdAt: -1 }).
websiteSchema.index({ user: 1, createdAt: -1 });

const Website = mongoose.model("Website", websiteSchema);

export default Website;