import * as Sentry from "@sentry/node";
import express, { type Router } from "express";

export const internalRouter: Router = express.Router();

internalRouter.post("/webrtc-stats", (req, res) => {
  console.log(JSON.stringify({ type: "webrtc-stats", ...req.body }));
  res.json({ ok: true });
});

internalRouter.get("/sentry-test", (_req, res) => {
  Sentry.captureMessage("Sentry server test", "info");
  res.json({ ok: true, message: "Sentry event sent" });
});
