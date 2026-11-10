import { prisma } from "./client.js";

export async function upsertStudyLog(userId: string, date: string, totalSeconds: number) {
  return prisma.studyLog.upsert({
    where: { userId_date: { userId, date } },
    update: { totalSeconds },
    create: { userId, date, totalSeconds },
  });
}

export async function findStudyLogsByUserIds(userIds: string[], fromDate: string, toDate: string) {
  return prisma.studyLog.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: fromDate, lte: toDate },
    },
    orderBy: [{ userId: "asc" }, { date: "asc" }],
  });
}
