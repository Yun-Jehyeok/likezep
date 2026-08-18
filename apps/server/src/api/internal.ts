import * as Sentry from "@sentry/node";
import express, { type Router } from "express";
import type { Role } from "@prisma/client";
import { config } from "../config.js";
import { upsertTestUser } from "../db/userRepository.js";
import { issueToken } from "./middleware/auth.js";

export const internalRouter: Router = express.Router();

internalRouter.post("/webrtc-stats", (req, res) => {
  console.log(JSON.stringify({ type: "webrtc-stats", ...req.body }));
  res.json({ ok: true });
});

internalRouter.get("/sentry-test", (_req, res) => {
  Sentry.captureMessage("Sentry server test", "info");
  res.json({ ok: true, message: "Sentry event sent" });
});

// E2E 전용 — E2E_ENABLED=true 일 때만 활성화
internalRouter.post("/test-login", async (req, res) => {
  if (!config.E2E_ENABLED) {
    res.status(404).end();
    return;
  }
  const { email, name, role, groupId } = req.body as {
    email?: string;
    name?: string;
    role?: string;
    groupId?: string | null;
  };
  if (!email) {
    res.status(422).json({ error: "email required" });
    return;
  }
  try {
    const user = await upsertTestUser({
      email,
      name: name ?? email,
      role: (role as Role) ?? "mentor",
      groupId: groupId ?? null,
    });
    const token = issueToken({ userId: user.id, role: user.role, groupId: user.groupId });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, groupId: user.groupId },
    });
  } catch (err) {
    console.error("[test-login]", err);
    res.status(500).json({ error: "Internal error" });
  }
});
