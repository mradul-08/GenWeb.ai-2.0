import express from "express"
import { firebaseAuth, logout, logoutAll } from "../controllers/auth.controller.js"
import isAuth from "../middlewares/isAuth.js"
import { rateLimit } from "../middlewares/rateLimit.js"

const authRouter = express.Router()

const signInLimit = rateLimit({ name: "signin", windowMs: 15 * 60 * 1000, max: 30 })

// Both expect { idToken } from Firebase; kept as two paths for client clarity.
authRouter.post("/google",     signInLimit, firebaseAuth)
authRouter.post("/email",      signInLimit, firebaseAuth)
authRouter.post("/logout",     logout)
authRouter.post("/logout-all", isAuth, logoutAll)

export default authRouter
