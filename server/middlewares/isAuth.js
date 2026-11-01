import { userFromSessionToken } from "../utils/session.js";

const isAuth = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: "Token not found" });
  }

  try {
    const user = await userFromSessionToken(token);
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired session" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("[isAuth]", error);
    return res.status(500).json({ message: "Authentication error" });
  }
};

export default isAuth;
