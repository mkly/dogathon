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
      sponsor: {
        name: "Alex Rivera",
        email: "alex@example.com",
        phone: null,
        channel: "email" as const,
      },
    },
    {
      sponsor: {
        name: "Jordan Lee",
        email: "jordan@example.com",
        phone: "+14155550123",
        channel: "both" as const,
      },
    },
  ];

  for (const sponsorship of sponsorships) {
    const sponsor = await prisma.sponsor.upsert({
      where: { email: sponsorship.sponsor.email },
      update: sponsorship.sponsor,
      create: sponsorship.sponsor,
    });
    const existingSponsorship = await prisma.sponsorship.findFirst({
      where: {
        orgId: organization.id,
        residentId: biscuit.id,
        sponsorId: sponsor.id,
      },
    });
    const sponsorshipData = {
      orgId: organization.id,
      residentId: biscuit.id,
      sponsorId: sponsor.id,
      monthlyUsd: 25,
      status: "active" as const,
      endedReason: null,
    };
    if (existingSponsorship) {
      await prisma.sponsorship.update({
        where: { id: existingSponsorship.id },
        data: sponsorshipData,
      });
    } else {
      await prisma.sponsorship.create({
        data: {
          orgId: organization.id,
          residentId: biscuit.id,
          sponsorId: sponsor.id,
        },
      });
    }
  }

  const notes = [
    "Vet visit went well.",
    "Teeth cleaned.",
    "Ate a sock.",
  ] as const;

  for (const note of notes) {
    const existingNote = await prisma.volunteerNote.findFirst({
      where: { orgId: organization.id, residentId: biscuit.id, note },
    });
    const noteData = { orgId: organization.id, residentId: biscuit.id, note };
    if (existingNote) {
      await prisma.volunteerNote.update({
        where: { id: existingNote.id },
        data: { ...noteData, photoUrl: null },
      });
    } else {
      await prisma.volunteerNote.create({ data: noteData });
    }
  }

  await prisma.rescueSettings.upsert({
    where: { orgId: organization.id },
    update: {
      sourceUrl: "https://www.coppersdream.org/dogs-and-more-back-up",
      pinnedPostscript: "Come meet the companions at our next adoption fair!",
    },
    create: {
      orgId: organization.id,
      pinnedPostscript: "Come meet the companions at our next adoption fair!",
    },
  });

  const secondOrganization = await prisma.organization.upsert({
    where: { slug: "happy-tails" },
    update: { name: "Happy Tails Rescue" },
    create: {
      name: "Happy Tails Rescue",
      slug: "happy-tails",
      createdAt: new Date(),
    },
  });

  const juniper = await prisma.resident.upsert({
    where: { orgId_name: { orgId: secondOrganization.id, name: "Juniper" } },
    update: {
      breed: "Terrier mix",
      dobText: "2022",
      ageText: "Young adult",
      sex: "Female",
      weightText: "Small",
      personality: "Bright, bouncy, and happiest with a tennis ball.",
      careNotes: ["Prefers a quiet spot for meals."],
      photoUrls: [photoUrls[1] ?? photoUrls[0]],
      status: "available",
      adoptedAt: null,
    },
    create: {
      orgId: secondOrganization.id,
      name: "Juniper",
      breed: "Terrier mix",
      dobText: "2022",
      ageText: "Young adult",
      sex: "Female",
      weightText: "Small",
      personality: "Bright, bouncy, and happiest with a tennis ball.",
      careNotes: ["Prefers a quiet spot for meals."],
      photoUrls: [photoUrls[1] ?? photoUrls[0]],
    },
  });

  const sam = await prisma.sponsor.upsert({
    where: { email: "sam@example.com" },
    update: {
      name: "Sam Chen",
      phone: null,
      channel: "email",
    },
    create: {
      name: "Sam Chen",
      email: "sam@example.com",
      phone: null,
      channel: "email",
    },
  });

  const existingSecondSponsorship = await prisma.sponsorship.findFirst({
    where: {
      orgId: secondOrganization.id,
      residentId: juniper.id,
      sponsorId: sam.id,
    },
  });
  const secondSponsorshipData = {
    orgId: secondOrganization.id,
    residentId: juniper.id,
    sponsorId: sam.id,
    monthlyUsd: 25,
    status: "active" as const,
    endedReason: null,
  };
  if (existingSecondSponsorship) {
    await prisma.sponsorship.update({
      where: { id: existingSecondSponsorship.id },
      data: secondSponsorshipData,
    });
  } else {
    await prisma.sponsorship.create({
      data: {
        orgId: secondOrganization.id,
        residentId: juniper.id,
        sponsorId: sam.id,
      },
    });
  }

  const secondNoteText = "Learned to bring the tennis ball back.";
  const existingSecondNote = await prisma.volunteerNote.findFirst({
    where: {
      orgId: secondOrganization.id,
      residentId: juniper.id,
      note: secondNoteText,
    },
  });
  const secondNoteData = {
    orgId: secondOrganization.id,
    residentId: juniper.id,
    note: secondNoteText,
  };
  if (existingSecondNote) {
    await prisma.volunteerNote.update({
      where: { id: existingSecondNote.id },
      data: { ...secondNoteData, photoUrl: null },
    });
  } else {
    await prisma.volunteerNote.create({ data: secondNoteData });
  }

  await prisma.rescueSettings.upsert({
    where: { orgId: secondOrganization.id },
    update: {
      sourceUrl: "seed/dogs-page-A.html",
      pinnedPostscript: "Happy Tails adoption hours are Saturday afternoons.",
    },
    create: {
      orgId: secondOrganization.id,
      sourceUrl: "seed/dogs-page-A.html",
      pinnedPostscript: "Happy Tails adoption hours are Saturday afternoons.",
    },
  });

  console.log("Seeded two organizations with distinct rosters, care history, sponsorships, and settings.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
