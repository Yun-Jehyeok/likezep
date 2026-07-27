import { prisma } from "./client.js";

export async function logAccess(userId: string, roomId: string, event: "join" | "leave") {
  await prisma.accessLog.create({ data: { userId, roomId, event } });
}
