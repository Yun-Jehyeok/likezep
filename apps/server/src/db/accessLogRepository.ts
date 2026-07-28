import { prisma } from "./client.js";

export async function logAccess(userId: string, roomId: string, event: "join" | "leave") {
  await prisma.accessLog.create({ data: { userId, roomId, event } });
}

export async function getActiveOccupants(roomId: string) {
  // userId별 가장 최근 이벤트 조회 후 join인 유저만 반환
  const latest = await prisma.accessLog.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    distinct: ["userId"],
    select: { event: true, user: { select: { name: true } } },
  });
  return latest.filter((r) => r.event === "join").map((r) => ({ name: r.user.name }));
}

export async function getRecentLogs(limit = 50) {
  const logs = await prisma.accessLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      event: true,
      createdAt: true,
      user: { select: { name: true } },
      room: { select: { name: true } },
    },
  });
  return logs.map((l) => ({
    userName: l.user.name,
    roomName: l.room.name,
    event: l.event as string,
    createdAt: l.createdAt.toISOString(),
  }));
}
