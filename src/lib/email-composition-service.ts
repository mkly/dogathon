import { enqueueEmailComposition } from "./email-composition-queue.ts";
import { prisma } from "./prisma.ts";

export async function enqueueRegularComposition(input: {
  orgId: string;
  requestedByUserId: string;
  residentId: string;
}) {
  const resident = await prisma.resident.findFirst({
    where: { id: input.residentId, orgId: input.orgId },
    select: {
      available: true,
      _count: {
        select: {
          checkIns: { where: { status: "completed", sponsorUpdateId: null } },
        },
      },
    },
  });
  if (!resident) return "not-found" as const;
  if (!resident.available) return "not-available" as const;
  if (resident._count.checkIns === 0) return "no-pending-chats" as const;
  return enqueueEmailComposition({
    orgId: input.orgId,
    requestedByUserId: input.requestedByUserId,
    kind: "regular",
    targetId: input.residentId,
  });
}

export async function enqueueGraduationComposition(input: {
  orgId: string;
  requestedByUserId: string;
  updateId: string;
}) {
  const draft = await prisma.sponsorUpdate.findFirst({
    where: {
      id: input.updateId,
      orgId: input.orgId,
      status: "draft",
      type: "graduation",
    },
    select: {
      resident: {
        select: {
          unavailabilityReason: true,
          _count: {
            select: {
              checkIns: {
                where: { status: "completed", sponsorUpdateId: null },
              },
            },
          },
        },
      },
    },
  });
  if (!draft) return "not-found" as const;
  if (draft.resident.unavailabilityReason !== "adopted")
    return "not-adopted" as const;
  if (draft.resident._count.checkIns === 0) return "no-pending-chats" as const;
  return enqueueEmailComposition({
    orgId: input.orgId,
    requestedByUserId: input.requestedByUserId,
    kind: "graduation",
    targetId: input.updateId,
  });
}
