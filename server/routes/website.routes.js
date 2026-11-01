import express from "express"
import {
  generateWebsite,
  enhancePrompt,
  getApiStatus,
  getUserWebsites,
  getWebsite,
  updateWebsite,
  saveWebsiteCode,
  deleteWebsite,
  deployWebsite,
  undeployWebsite,
} from "../controllers/website.controller.js"
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
websiteRouter.get("/",                 isAuth, getUserWebsites)
websiteRouter.get("/:id",              isAuth, getWebsite)
websiteRouter.put("/:id",              isAuth, aiLimit, updateWebsite)
websiteRouter.patch("/:id/code",       isAuth, saveLimit, saveWebsiteCode)
websiteRouter.delete("/:id",           isAuth, deleteWebsite)
websiteRouter.post("/:id/deploy",      isAuth, deployWebsite)
websiteRouter.post("/:id/undeploy",    isAuth, undeployWebsite)

export default websiteRouter
