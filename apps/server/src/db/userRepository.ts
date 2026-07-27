import { Role } from "@prisma/client";
import { prisma } from "./client.js";

export async function findUserByGoogleId(googleId: string) {
  return prisma.user.findUnique({ where: { googleId } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
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
