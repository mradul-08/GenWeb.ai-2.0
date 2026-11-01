import express from "express"
import isAuth from "../middlewares/isAuth.js"
import requireAdmin from "../middlewares/requireAdmin.js"
import { getConfig, putConfig, getProviders, getUsage } from "../controllers/admin.controller.js"

const adminRouter = express.Router()

adminRouter.use(isAuth, requireAdmin)
adminRouter.get("/ai/config",    getConfig)
adminRouter.put("/ai/config",    putConfig)
adminRouter.get("/ai/providers", getProviders)
adminRouter.get("/ai/usage",     getUsage)

export default adminRouter
