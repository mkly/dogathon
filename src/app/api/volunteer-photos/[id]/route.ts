import { z } from "zod";

import { env } from "@/lib/env";
import { getPhoto } from "@/lib/photo-storage";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };
const photoQuerySchema = z.object({
  org: uuidSchema,
  variant: z.literal("web").optional(),
});

/**
 * Serves a volunteer photo from storage. Public on purpose:
 * these photos are embedded in sponsor emails, which cannot authenticate.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const query = photoQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!uuidSchema.safeParse(id).success || !query.success) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }
  const orgId = query.data.org;
  const photo = await prisma.volunteerPhoto.findFirst({
    where: { id, orgId },
    select: { storageKey: true, url: true, webStorageKey: true, webUrl: true },
  });

  if (!photo) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }

  const storageKey =
    query.data.variant === "web" ? photo.webStorageKey : photo.storageKey;
  const url = query.data.variant === "web" ? photo.webUrl : photo.url;
  if (!storageKey || !url) {
    return Response.json({ error: "Photo not found" }, { status: 404 });
  }

  // Photos written before S3 was configured keep a same-origin URL; redirecting
  // to one would throw, so only an absolute stored URL is worth a redirect.
  if (env.features.s3 && URL.canParse(url)) return Response.redirect(url, 308);

  const stored = await getPhoto(storageKey);
  if (!stored)
    return Response.json({ error: "Photo not found" }, { status: 404 });

  return new Response(Uint8Array.from(stored.data).buffer, {
    headers: {
      "content-type": stored.mime,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
