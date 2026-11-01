// Must run after isAuth. The role comes from the database user loaded by
// isAuth, never from the client.
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" })
  }
  next()
}

export default requireAdmin
