import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { issueToken, type AuthPayload } from "./auth.js";
import { config } from "../../config.js";

describe("issueToken", () => {
  const base: AuthPayload = { userId: "u-1", role: "mentee", groupId: null };

  it("검증된 토큰 payload(iat/exp 포함)를 그대로 넘겨도 재서명된다", () => {
    const decoded = jwt.verify(issueToken(base), config.JWT_SECRET) as AuthPayload & { iat: number; exp: number };
    expect(decoded.exp).toBeDefined();

    // /api/auth/refresh가 예전에 하던 방식 — 이전에는 'Bad "options.expiresIn"' 에러가 났다
    expect(() => issueToken(decoded)).not.toThrow();
  });

  it("userId/role/groupId만 서명하고 만료는 7일이다", () => {
    const decoded = jwt.verify(issueToken({ ...base, groupId: "g-1" }), config.JWT_SECRET) as Record<string, unknown>;

    expect(Object.keys(decoded).sort()).toEqual(["exp", "groupId", "iat", "role", "userId"]);
    expect(decoded.groupId).toBe("g-1");
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(7 * 24 * 60 * 60);
  });
});
