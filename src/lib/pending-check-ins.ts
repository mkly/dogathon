import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "./prisma.ts";

export function pendingCheckInsWhere(residentId?: string): Prisma.CheckInWhereInput {
  return {
    ...(residentId ? { residentId } : {}),
    sponsorUpdateId: null,
    status: "completed",
  };
}

export function countPendingCheckIns(residentId: string): Promise<number> {
  return prisma.checkIn.count({ where: pendingCheckInsWhere(residentId) });
}
