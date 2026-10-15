import { prisma } from "./client.js";

export async function saveMessage(userId: string, roomId: string, content: string) {
  await prisma.chatMessage.create({ data: { userId, roomId, content } });
}

export async function getRecentMessages(
  roomId: string,
  options: { beforeId?: string; limit?: number } = {},
) {
  const { beforeId, limit = 50 } = options;
  // id는 BigInt autoincrement PK라 "id가 작다" = "더 과거". createdAt tie-break도 겸함.
  const msgs = await prisma.chatMessage.findMany({
    where: {
      roomId,
      ...(beforeId ? { id: { lt: BigInt(beforeId) } } : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { id: "desc" },
    take: limit,
  });
  return msgs.reverse().map((m) => ({
    id: m.id.toString(),
    userId: m.userId,
    name: m.user.name,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
}
