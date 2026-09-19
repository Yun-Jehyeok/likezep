/**
 * JWT 인증 미들웨어
 *
 * Express 미들웨어 패턴: (req, res, next) => void
 * - 인증 성공: req.auth에 payload를 달고 next() 호출 → 다음 핸들러로 진행
 * - 인증 실패: res.status(401).json(...) 후 next를 호출하지 않음 → 요청 종료
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";

/** JWT payload에 담기는 사용자 정보 */
export interface AuthPayload {
  userId: string;
  role: "admin" | "mentor" | "mentee";
  groupId: string | null;
}

// Express의 Request 타입을 전역으로 확장해 req.auth를 타입 안전하게 사용할 수 있게 한다
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global { namespace Express { interface Request { auth?: AuthPayload } } }

/**
 * Bearer 토큰을 검증하고 req.auth에 payload를 저장하는 미들웨어.
 * 보호가 필요한 라우트에 체이닝해서 사용: router.get("/me", requireAuth, handler)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Authorization: Bearer <token> 헤더에서 토큰 추출
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Token required" } });
    return;
  }
  try {
    // jwt.verify는 서명 검증 + 만료 시간 검사를 동시에 수행한다
    req.auth = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
    next();
  } catch {
    // 서명 불일치 또는 만료된 토큰
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}

/**
 * admin 역할만 허용하는 미들웨어.
 * requireAuth 다음에 체이닝해서 사용: router.get("/admin", requireAuth, requireAdmin, handler)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin only" } });
    return;
  }
  next();
}

/** 주어진 payload로 JWT를 생성해 반환한다. 유효기간 24시간. */
export function issueToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "24h" });
}
