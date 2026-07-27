import { prisma } from "./client.js";

export async function findRoomById(id: string) {
  return prisma.room.findUnique({ where: { id } });
}

export async function findAllRooms() {
  return prisma.room.findMany({ orderBy: { createdAt: "asc" } });
}

export async function findPublicRooms() {
  return prisma.room.findMany({ where: { type: "public" }, orderBy: { createdAt: "asc" } });
}

export async function findRoomsForMentee(groupId: string) {
  return prisma.room.findMany({
    where: { OR: [{ type: "public" }, { groupId }] },
    orderBy: { createdAt: "asc" },
  });
}
