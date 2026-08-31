import "dotenv/config";

import { readFile } from "node:fs/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const photoUrls = JSON.parse(
    await readFile(new URL("../seed/photo-urls.json", import.meta.url), "utf8"),
  ) as string[];

  if (!photoUrls[0]) {
    throw new Error("seed/photo-urls.json must contain at least one photo URL");
  }

  const organization = await prisma.organization.upsert({
    where: { slug: "coppers-dream" },
    update: { name: "Copper's Dream Rescue" },
    create: {
      id: "demo-org-coppers-dream",
      name: "Copper's Dream Rescue",
      slug: "coppers-dream",
      createdAt: new Date(),
    },
  });

  const biscuit = await prisma.resident.upsert({
    where: { orgId_name: { orgId: organization.id, name: "Biscuit" } },
    update: {
      breed: "Mixed breed",
      dobText: "Unknown",
      ageText: "Adult",
      sex: "Male",
      weightText: "Medium",
      personality: "Sweet, curious, and always ready for a new friend.",
      careNotes: ["Keep snacks safely out of reach."],
      photoUrls: [photoUrls[0]],
      status: "available",
      adoptedAt: null,
    },
    create: {
      id: "demo-resident-biscuit",
      orgId: organization.id,
      name: "Biscuit",
      breed: "Mixed breed",
      dobText: "Unknown",
      ageText: "Adult",
      sex: "Male",
      weightText: "Medium",
      personality: "Sweet, curious, and always ready for a new friend.",
      careNotes: ["Keep snacks safely out of reach."],
      photoUrls: [photoUrls[0]],
    },
  });

  const sponsorships = [
    {
      id: "demo-sponsorship-email",
      sponsorName: "Alex Rivera",
      sponsorEmail: "alex@example.com",
      sponsorPhone: null,
      channel: "email" as const,
    },
    {
      id: "demo-sponsorship-both",
      sponsorName: "Jordan Lee",
      sponsorEmail: "jordan@example.com",
      sponsorPhone: "+14155550123",
      channel: "both" as const,
    },
  ];

  for (const sponsorship of sponsorships) {
    await prisma.sponsorship.upsert({
      where: {
        id_orgId: { id: sponsorship.id, orgId: organization.id },
      },
      update: {
        orgId: organization.id,
        residentId: biscuit.id,
        ...sponsorship,
        monthlyUsd: 25,
        status: "active",
        endedReason: null,
      },
      create: {
        orgId: organization.id,
        residentId: biscuit.id,
        ...sponsorship,
      },
    });
  }

  const notes = [
    ["demo-note-vet", "Vet visit went well."],
    ["demo-note-teeth", "Teeth cleaned."],
    ["demo-note-sock", "Ate a sock."],
  ] as const;

  for (const [id, note] of notes) {
    await prisma.volunteerNote.upsert({
      where: { id_orgId: { id, orgId: organization.id } },
      update: { orgId: organization.id, residentId: biscuit.id, note, photoUrl: null },
      create: { id, orgId: organization.id, residentId: biscuit.id, note },
    });
  }

  await prisma.rescueSettings.upsert({
    where: { orgId: organization.id },
    update: {
      sourceUrl: "https://www.coppersdream.org/dogs-and-more-back-up",
      pinnedPostscript: "Come meet the dogs at our next adoption fair!",
    },
    create: {
      orgId: organization.id,
      pinnedPostscript: "Come meet the dogs at our next adoption fair!",
    },
  });

  console.log("Seeded Copper's Dream, Biscuit, care history, sponsorships, and settings.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
