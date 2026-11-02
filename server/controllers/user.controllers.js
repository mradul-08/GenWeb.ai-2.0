import Website from "../models/website.model.js"
import { userFromSessionToken } from "../utils/session.js"

export const getCurrentUser = async (req, res) => {
  try {
    const user = await userFromSessionToken(req.cookies?.token)
    return res.json({ user: user || null })
  } catch (error) {
    console.error("[getCurrentUser]", error)
    return res.json({ user: null })
  }
}

export const getUserWebsites = async (req, res) => {
  try {
    // latestCode is omitted — the dashboard doesn't use it and it is the bulk of each document.
    const websites = await Website.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select('title deployed deployUrl slug kind files.path createdAt updatedAt thumbnailBg thumbnailAccent thumbnailTitle')
    return res.json({ websites })
  } catch (error) {
    console.error("[getUserWebsites]", error)
    return res.status(500).json({ message: "Could not load projects" })
  }
}
