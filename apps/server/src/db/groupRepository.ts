import { prisma } from "./client.js";

export async function findAllGroups() {
  return prisma.group.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createGroup(name: string) {
  return prisma.group.create({ data: { name } });
}

export async function updateGroup(id: string, name: string) {
  return prisma.group.update({ where: { id }, data: { name } });
}

export async function deleteGroup(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { groupId: id }, data: { groupId: null } });
    const room = await tx.room.findFirst({ where: { groupId: id } });
    if (room) {
      await tx.chatMessage.deleteMany({ where: { roomId: room.id } });
      await tx.accessLog.deleteMany({ where: { roomId: room.id } });
      await tx.room.delete({ where: { id: room.id } });
    }
    await tx.group.delete({ where: { id } });
  });
}
