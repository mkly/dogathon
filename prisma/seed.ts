import "dotenv/config";

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
  // Seed residents share the bundled mascot so the demo never depends on a
  // third-party photo host.
  const photoUrls = ["/mascot/felt-pup-2.png"];

  const organization = await prisma.organization.upsert({
    where: { slug: "maple-street" },
    update: { name: "Maple Street Rescue" },
    create: {
      name: "Maple Street Rescue",
      slug: "maple-street",
      createdAt: new Date(),
    },
  });

  const biscuit = await prisma.resident.upsert({
    where: { orgId_name: { orgId: organization.id, name: "Biscuit" } },
    update: {
      sourceUrl: "",
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
      sourceUrl: "",
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
      },
    },
    {
      sponsor: {
        name: "Jordan Lee",
        email: "jordan@example.com",
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
      monthlyCents: 2500,
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
        data: sponsorshipData,
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
      sourceUrl: "seed/dogs-page-B.html",
      pinnedPostscript: "Come meet the companions at our next adoption fair!",
      allowedOrigins: ["https://example-rescue.org"],
    },
    create: {
      orgId: organization.id,
      sourceUrl: "seed/dogs-page-B.html",
      pinnedPostscript: "Come meet the companions at our next adoption fair!",
      allowedOrigins: ["https://example-rescue.org"],
    },
  });
  await prisma.sponsorshipTier.deleteMany({ where: { orgId: organization.id } });
  await prisma.sponsorshipTier.create({
    data: { orgId: organization.id, monthlyCents: 2500, description: "", position: 0 },
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
      sourceUrl: "",
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
      sourceUrl: "",
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
    },
    create: {
      name: "Sam Chen",
      email: "sam@example.com",
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
    monthlyCents: 3000,
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
      data: secondSponsorshipData,
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
      allowedOrigins: ["https://happy-tails.example"],
    },
    create: {
      orgId: secondOrganization.id,
      sourceUrl: "seed/dogs-page-A.html",
      pinnedPostscript: "Happy Tails adoption hours are Saturday afternoons.",
      allowedOrigins: ["https://happy-tails.example"],
    },
  });
  await prisma.sponsorshipTier.deleteMany({ where: { orgId: secondOrganization.id } });
  await prisma.sponsorshipTier.create({
    data: { orgId: secondOrganization.id, monthlyCents: 3000, description: "", position: 0 },
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
