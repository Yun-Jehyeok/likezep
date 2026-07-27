import { prisma } from "./client.js";

export async function saveMessage(userId: string, roomId: string, content: string) {
  await prisma.chatMessage.create({ data: { userId, roomId, content } });
}

export async function getRecentMessages(roomId: string, limit = 50) {
  const msgs = await prisma.chatMessage.findMany({
    where: { roomId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return msgs.reverse().map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
}
