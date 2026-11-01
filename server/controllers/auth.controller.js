import User from "../models/user.model.js"
import { verifyFirebaseIdToken } from "../utils/verifyFirebaseToken.js"
import { COOKIE_OPTIONS, issueSessionCookie } from "../utils/session.js"
import { createUserWithSignupCredits, isDuplicateKeyError } from "../services/credits.js"

// v1 stored emails as typed; Firebase reports them lowercased. Matching must
// be case-insensitive or a v1 user would get a second, empty account.
const EMAIL_COLLATION = { locale: "en", strength: 2 }
const findByEmail = (email) => User.findOne({ email }).collation(EMAIL_COLLATION)

// Handles both Google and email/password sign-in. The client signs in with
// Firebase and sends the resulting ID token; identity comes only from the
// verified token, never from client-supplied fields.
export const firebaseAuth = async (req, res) => {
  try {
    const { idToken, name } = req.body;
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ message: "idToken is required" });
    }

    let claims;
    try {
      claims = await verifyFirebaseIdToken(idToken);
    } catch (error) {
      console.warn("[auth] token verification failed:", error.message);
      return res.status(401).json({ message: "Invalid or expired sign-in. Please try again." });
    }

    const email = claims.email;
    if (!email) return res.status(400).json({ message: "Account has no email address" });
    if (!claims.email_verified) {
      return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Please verify your email before signing in." });
    }

    let user = await User.findOne({ firebaseUid: claims.sub }) || await findByEmail(email);
    let isNewUser = false;

    if (!user) {
      try {
        user = await createUserWithSignupCredits({
          name:        claims.name || (typeof name === "string" && name.trim()) || email.split("@")[0],
          email,
          avatar:      claims.picture || "",
          firebaseUid: claims.sub,
        });
        isNewUser = true;
      } catch (error) {
        // Two first sign-ins raced; the other request created the account.
        if (!isDuplicateKeyError(error)) throw error;
        user = await User.findOne({ firebaseUid: claims.sub }) || await findByEmail(email);
        if (!user) throw error;
      }
    }

    if (user.firebaseUid && user.firebaseUid !== claims.sub) {
      return res.status(409).json({ message: "This email is linked to a different sign-in account." });
    }
    if (!user.firebaseUid) {
      // Existing account from v1 (no Firebase link yet) — link it now that the email is verified.
      user.firebaseUid = claims.sub;
      if (!user.avatar && claims.picture) user.avatar = claims.picture;
      await user.save();
    }

    issueSessionCookie(res, user);
    return res.status(200).json({ user, isNewUser });

  } catch (error) {
    console.error("[firebaseAuth]", error);
    return res.status(500).json({ message: "Sign-in failed. Please try again." });
  }
};

export const logout = async (req, res) => {
  return res
    .clearCookie("token", COOKIE_OPTIONS)
    .status(200)
    .json({ message: "logout success" });
};

// Revokes every session of the current user (all devices), including this one.
export const logoutAll = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    return res
      .clearCookie("token", COOKIE_OPTIONS)
      .status(200)
      .json({ message: "Logged out of all sessions" });
  } catch (error) {
    console.error("[logoutAll]", error);
    return res.status(500).json({ message: "Could not log out of all sessions" });
  }
};
