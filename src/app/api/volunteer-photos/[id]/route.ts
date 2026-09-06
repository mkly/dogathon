import { z } from "zod";

import { env } from "@/lib/env";
import { getPhoto } from "@/lib/photo-storage";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };
const photoQuerySchema = z.object({ org: uuidSchema });

/**
 * Serves a volunteer photo from storage. Public on purpose:
 * these photos are embedded in sponsor emails, which cannot authenticate.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const query = photoQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!uuidSchema.safeParse(id).success || !query.success) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }
  const orgId = query.data.org;
  const photo = await prisma.volunteerPhoto.findFirst({
    where: { id, orgId },
    select: { storageKey: true, url: true },
  });

  if (!photo) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }

  if (env.features.s3) return Response.redirect(photo.url, 308);

  const stored = await getPhoto(photo.storageKey);
  if (!stored) return Response.json({ error: "Photo not found" }, { status: 404 });

  return new Response(Uint8Array.from(stored.data).buffer, {
    headers: {
      "content-type": stored.mime,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
