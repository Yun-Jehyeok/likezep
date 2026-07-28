import { prisma } from "./client.js";

export async function findAllGroups() {
  return prisma.group.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createGroup(name: string) {
  return prisma.group.create({ data: { name } });
}
