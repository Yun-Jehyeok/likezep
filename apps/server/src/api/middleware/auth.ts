import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config.js";

export interface AuthPayload {
  userId: string;
  role: "admin" | "mentor" | "mentee";
  groupId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare global { namespace Express { interface Request { auth?: AuthPayload } } }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Token required" } });
    return;
  }
  try {
    req.auth = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin only" } });
    return;
  }
  next();
}

export function issueToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "24h" });
}
