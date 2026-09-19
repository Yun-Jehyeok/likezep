/**
 * 인증 API 라우터
 *
 * Google OAuth 2.0 Authorization Code Flow:
 * 1. 클라이언트(브라우저)가 Google 로그인 팝업을 열고 authorization code를 받는다
 * 2. 그 code를 POST /api/auth/google 으로 서버에 보낸다
 * 3. 서버가 code를 Google에 보내 id_token(JWT)을 받는다
 * 4. id_token에서 구글 고유 ID(sub), 이메일, 이름을 꺼낸다
 * 5. DB에서 해당 구글 ID의 유저를 찾거나 없으면 신규 생성
 * 6. 우리 서비스의 JWT를 발급해 클라이언트에게 반환
 *
 * "postmessage"는 redirect_uri 대신 팝업 postMessage를 사용하는 방식이다
 */
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

/** Google OAuth 클라이언트를 요청마다 생성 (설정이 없으면 명시적 에러) */
function getGoogleClient() {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }
  return new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, "postmessage");
}

// POST /api/auth/google  — Google authorization code → 서비스 JWT 발급
router.post("/google", async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "code required" } });
    return;
  }

  try {
    const googleClient = getGoogleClient();

    // code → Google access/id token 교환
    const { tokens } = await googleClient.getToken(code);

    // id_token의 서명을 Google 공개키로 검증하고 payload 추출
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;
    const { sub: googleId, email, name } = payload;

    // 기존 유저 조회 또는 신규 생성
    let user = await findUserByGoogleId(googleId!);
    if (!user) {
      // 어드민 이메일이면 admin 역할 부여, 그 외는 mentee로 시작
      const role = email === config.ADMIN_EMAIL ? "admin" : "mentee";
      user = await createUser({ googleId: googleId!, email: email!, name: name!, role });
    }

    await updateUserLastLogin(user.id);

    // 우리 서비스 JWT 발급 — 이후 모든 API/WebSocket 인증에 사용
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

// GET /api/me  — 현재 유저 정보 반환 (그룹 배정 대기 중 폴링에 사용)
// 멘티가 로그인 후 groupId가 배정됐는지 주기적으로 확인할 때 이 엔드포인트를 호출한다
router.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.auth!.userId);
  if (!user) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    return;
  }
  res.json({ id: user.id, name: user.name, role: user.role, groupId: user.groupId });
});

export { router as authRouter };
