import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };
const photoQuerySchema = z.object({ org: uuidSchema });

/**
 * Serves a volunteer note's photo from the database. Public on purpose:
 * these photos are embedded in sponsor emails, which cannot authenticate.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const query = photoQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!uuidSchema.safeParse(id).success || !query.success) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }
  const orgId = query.data.org;
  const note = await prisma.volunteerNote.findFirst({
    where: { id, orgId },
    select: { photoData: true, photoMime: true },
  });

  if (!note?.photoData || !note.photoMime) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(note.photoData), {
    headers: {
      "content-type": note.photoMime,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
