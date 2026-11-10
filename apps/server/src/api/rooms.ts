import * as Sentry from "@sentry/node";
import { Router, type Router as ExpressRouter } from "express";
import { matchMaker } from "@colyseus/core";
import { requireAuth } from "./middleware/auth.js";
import { findAllRooms, findPublicRooms, findRoomsForMentee, findRoomById } from "../db/roomRepository.js";
import { getRecentMessages } from "../db/chatRepository.js";
import { findUsersByGroupId } from "../db/userRepository.js";
import { findStudyLogsByUserIds } from "../db/studyLogRepository.js";
import { getCurrentTotalSeconds, kstDayKey } from "../services/studyTimer.js";

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
  try {
    const raw = req.query.before;
    const beforeId = typeof raw === "string" && /^\d+$/.test(raw) ? raw : undefined;
    const messages = await getRecentMessages(req.params.roomId, { beforeId });
    res.json(messages);
  } catch (err) {
    Sentry.captureException(err);
    console.error("[chat] getRecentMessages error:", err);
    res.status(500).json({ error: { message: "Failed to load chat history" } });
  }
});

router.get("/:roomId/study-stats", requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const daysParam = typeof req.query.days === "string" ? parseInt(req.query.days, 10) : 30;
    const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

    const room = await findRoomById(roomId);
    if (!room) return res.status(404).json({ error: { message: "Room not found" } });

    const groupId = room.groupId;
    if (!groupId) return res.json({ users: [], logs: [] });

    const users = await findUsersByGroupId(groupId);
    const userIds = users.map((u) => u.id);

    const today = kstDayKey();
    const fromDate = kstDayKey(Date.now() - (days - 1) * 86400_000);

    const dbLogs = await findStudyLogsByUserIds(userIds, fromDate, today);

    // DB 로그를 Map으로 변환: `${userId}:${date}` → totalSeconds
    const logMap = new Map<string, number>();
    for (const log of dbLogs) {
      logMap.set(`${log.userId}:${log.date}`, log.totalSeconds);
    }

    // 오늘 치는 메모리 값(running 포함)으로 덮어씌우기
    for (const userId of userIds) {
      const memSec = getCurrentTotalSeconds(userId);
      if (memSec > 0) {
        const key = `${userId}:${today}`;
        const dbSec = logMap.get(key) ?? 0;
        logMap.set(key, Math.max(dbSec, memSec));
      }
    }

    // 날짜 목록 생성
    const dateList: string[] = [];
    for (let i = 0; i < days; i++) {
      dateList.push(kstDayKey(Date.now() - i * 86400_000));
    }
    dateList.reverse();

    const logs = dateList.flatMap((date) =>
      userIds.map((userId) => ({
        userId,
        date,
        totalSeconds: logMap.get(`${userId}:${date}`) ?? 0,
      }))
    ).filter((l) => l.totalSeconds > 0);

    res.json({ users, logs });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[study-stats] error:", err);
    res.status(500).json({ error: { message: "Failed to load study stats" } });
  }
});

export { router as roomsRouter };
