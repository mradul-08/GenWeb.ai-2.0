import express from "express"
import {
  generateWebsite,
  enhancePrompt,
  planWebsite,
  getApiStatus,
  getUserWebsites,
  getWebsite,
  updateWebsite,
  saveWebsiteCode,
  deleteWebsite,
  deployWebsite,
  undeployWebsite,
  getWebsiteVersions,
  getWebsiteVersion,
  restoreWebsiteVersion,
} from "../controllers/website.controller.js"
import { getLibrary, getDesign, applyDesign } from "../controllers/design.controller.js"
import isAuth from "../middlewares/isAuth.js"
import { rateLimit } from "../middlewares/rateLimit.js"

const websiteRouter = express.Router()

// Per-user limits (rate limiters run after isAuth so they key on the user).
const aiLimit      = rateLimit({ name: "ai",      windowMs: 10 * 60 * 1000, max: 20 })
const enhanceLimit = rateLimit({ name: "enhance", windowMs: 10 * 60 * 1000, max: 30 })
const saveLimit    = rateLimit({ name: "save",    windowMs: 60 * 1000,      max: 60 })

// Public
websiteRouter.get("/status", getApiStatus)

// Protected
websiteRouter.post("/generate",        isAuth, aiLimit, generateWebsite)
websiteRouter.post("/enhance-prompt",  isAuth, enhanceLimit, enhancePrompt)
websiteRouter.post("/plan",            isAuth, enhanceLimit, planWebsite)
websiteRouter.get("/",                 isAuth, getUserWebsites)
// Before "/:id" so "library" is not read as a website id.
websiteRouter.get("/library",          isAuth, getLibrary)
websiteRouter.get("/:id",              isAuth, getWebsite)
websiteRouter.put("/:id",              isAuth, aiLimit, updateWebsite)
websiteRouter.patch("/:id/code",       isAuth, saveLimit, saveWebsiteCode)
websiteRouter.delete("/:id",           isAuth, deleteWebsite)
websiteRouter.post("/:id/deploy",      isAuth, deployWebsite)
websiteRouter.post("/:id/undeploy",    isAuth, undeployWebsite)
websiteRouter.get("/:id/versions",                       isAuth, getWebsiteVersions)
websiteRouter.get("/:id/versions/:versionId",            isAuth, getWebsiteVersion)
websiteRouter.post("/:id/versions/:versionId/restore",   isAuth, saveLimit, restoreWebsiteVersion)
// No-AI design editor (theme, layout, sections, text) — no credits.
websiteRouter.get("/:id/design",       isAuth, getDesign)
websiteRouter.put("/:id/design",       isAuth, saveLimit, applyDesign)

export default websiteRouter
