import express, { type Router } from "express";

export const internalRouter: Router = express.Router();

internalRouter.post("/webrtc-stats", (req, res) => {
  console.log(JSON.stringify({ type: "webrtc-stats", ...req.body }));
  res.json({ ok: true });
});
