import { Role } from "@prisma/client";
import { prisma } from "./client.js";

export async function findUserByGoogleId(googleId: string) {
  return prisma.user.findUnique({ where: { googleId } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function findAllUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { group: { select: { id: true, name: true } } },
  });
}

export async function createUser(data: {
  googleId: string;
  email: string;
  name: string;
  role: Role;
}) {
  return prisma.user.create({ data });
}

export async function updateUserLastLogin(id: string) {
  return prisma.user.update({
    where: { id },
    data: { lastLoginAt: new Date() },
  });
}

export async function updateUser(id: string, data: { role?: Role; groupId?: string | null }) {
  return prisma.user.update({ where: { id }, data });
}

export async function upsertTestUser(data: {
  email: string;
  name: string;
  role: Role;
  groupId?: string | null;
}) {
  return prisma.user.upsert({
    where: { email: data.email },
    update: { role: data.role, groupId: data.groupId ?? null, name: data.name },
    create: {
      googleId: `e2e_${data.email}`,
      email: data.email,
      name: data.name,
      role: data.role,
      groupId: data.groupId ?? null,
    },
  });
}
