import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Serves a volunteer note's photo from the database. Public on purpose:
 * these photos are embedded in sponsor emails, which cannot authenticate.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const orgId = new URL(request.url).searchParams.get("org");
  if (!orgId) return Response.json({ error: "Photo not found" }, { status: 404 });
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
