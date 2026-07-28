import { Router, type Router as ExpressRouter } from "express";
import { matchMaker } from "@colyseus/core";
import type { Role } from "@prisma/client";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { findAllRooms, createRoom } from "../db/roomRepository.js";
import { findAllUsers, updateUser } from "../db/userRepository.js";
import { findAllGroups, createGroup } from "../db/groupRepository.js";
import { getActiveOccupants, getRecentLogs } from "../db/accessLogRepository.js";

const router: ExpressRouter = Router();

// GET /api/admin/status — 룸별 실시간 접속 현황
router.get("/status", requireAuth, requireAdmin, async (_req, res) => {
  const [rooms, activeRooms] = await Promise.all([
    findAllRooms(),
    matchMaker.query({ name: "mentoring-room" }),
  ]);

  const activeRoomIds = new Set<string>();
  for (const r of activeRooms) {
    const dbRoomId = (r.metadata as { roomId?: string } | null)?.roomId;
    if (dbRoomId) activeRoomIds.add(dbRoomId);
  }

  const statusList = await Promise.all(
    rooms.map(async (room) => ({
      id: room.id,
      name: room.name,
      type: room.type,
      occupants: activeRoomIds.has(room.id) ? await getActiveOccupants(room.id) : [],
    }))
  );

  res.json(statusList);
});

// GET /api/admin/users — 전체 유저 목록
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await findAllUsers();
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      groupId: u.groupId,
      groupName: u.group?.name ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    }))
  );
});

// PATCH /api/admin/users/:id — 역할/그룹 변경
router.patch("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { role, groupId } = req.body as { role?: Role; groupId?: string | null };
  const data: { role?: Role; groupId?: string | null } = {};
  if (role !== undefined) data.role = role;
  if (groupId !== undefined) data.groupId = groupId === "" ? null : groupId;

  const user = await updateUser(req.params.id, data);
  res.json({ id: user.id, role: user.role, groupId: user.groupId });
});

// GET /api/admin/groups — 전체 그룹 목록
router.get("/groups", requireAuth, requireAdmin, async (_req, res) => {
  const groups = await findAllGroups();
  res.json(groups.map((g) => ({ id: g.id, name: g.name })));
});

// POST /api/admin/groups — 그룹 생성 + 프라이빗 룸 자동 생성
router.post("/groups", requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "name required" } });
    return;
  }

  const trimmed = name.trim();
  const group = await createGroup(trimmed);
  const room = await createRoom({ name: `${trimmed} 룸`, type: "private", groupId: group.id });
  res.status(201).json({ group: { id: group.id, name: group.name }, room: { id: room.id, name: room.name } });
});

// GET /api/admin/logs — 접속 로그 (최근 100개)
router.get("/logs", requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const logs = await getRecentLogs(limit);
  res.json(logs);
});

export { router as adminRouter };
