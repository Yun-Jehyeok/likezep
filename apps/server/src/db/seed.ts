import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plaza = await prisma.room.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "광장",
      type: "public",
      mapKey: "plaza",
    },
  });

  const meeting = await prisma.room.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "회의실",
      type: "public",
      mapKey: "meeting",
    },
  });

  console.log(`Seeded: ${plaza.name} (${plaza.id}), ${meeting.name} (${meeting.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
