import { Router, type Router as ExpressRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";
import {
  findUserByGoogleId,
  findUserById,
  createUser,
  updateUserLastLogin,
} from "../db/userRepository.js";
import { requireAuth, issueToken } from "./middleware/auth.js";

const router: ExpressRouter = Router();

function getGoogleClient() {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }
  return new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, "postmessage");
}

// POST /api/auth/google  — Google authorization code → JWT
router.post("/google", async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "code required" } });
    return;
  }

  try {
    const googleClient = getGoogleClient();
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;
    const { sub: googleId, email, name } = payload;

    let user = await findUserByGoogleId(googleId!);
    if (!user) {
      const role = email === config.ADMIN_EMAIL ? "admin" : "mentee";
      user = await createUser({ googleId: googleId!, email: email!, name: name!, role });
    }

    await updateUserLastLogin(user.id);

    const token = issueToken({ userId: user.id, role: user.role, groupId: user.groupId });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, groupId: user.groupId },
    });
  } catch (err) {
    console.error("[auth/google]", err);
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Google auth failed" } });
  }
});

// GET /api/me  — 현재 유저 정보 (배정 대기 폴링용)
router.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.auth!.userId);
  if (!user) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    return;
  }
  res.json({ id: user.id, name: user.name, role: user.role, groupId: user.groupId });
});

export { router as authRouter };
