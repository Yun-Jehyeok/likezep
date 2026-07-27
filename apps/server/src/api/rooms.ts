import { Router, type Router as ExpressRouter } from "express";
import { matchMaker } from "@colyseus/core";
import { requireAuth } from "./middleware/auth.js";
import { findAllRooms, findPublicRooms, findRoomsForMentee } from "../db/roomRepository.js";
import { getRecentMessages } from "../db/chatRepository.js";

const router: ExpressRouter = Router();

router.get("/", requireAuth, async (req, res) => {
  const { role, groupId } = req.auth!;

  const [rooms, activeRooms] = await Promise.all([
    role === "mentee" && groupId
      ? findRoomsForMentee(groupId)
      : role === "mentee"
      ? findPublicRooms()
      : findAllRooms(),
    matchMaker.query({ name: "mentoring-room" }),
  ]);

  const occupantMap = new Map<string, number>();
  for (const r of activeRooms) {
    const dbRoomId = (r.metadata as { roomId?: string } | null)?.roomId;
    if (dbRoomId) occupantMap.set(dbRoomId, r.clients);
  }

  res.json(rooms.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    groupId: r.groupId,
    occupants: occupantMap.get(r.id) ?? 0,
  })));
});

router.get("/:roomId/chat", requireAuth, async (req, res) => {
  const messages = await getRecentMessages(req.params.roomId);
  res.json(messages);
});

export { router as roomsRouter };
