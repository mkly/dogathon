import { composePupdate } from "@/lib/composer";
import { dogPageUrl } from "@/lib/pupdate-delivery";
import { prisma } from "@/lib/prisma";

type ComposeRequest = {
  residentId?: unknown;
  type?: unknown;
};

export async function POST(request: Request) {
  let input: ComposeRequest;
  try {
    input = (await request.json()) as ComposeRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (typeof input.residentId !== "string" || !input.residentId.trim()) {
    return Response.json({ error: "residentId is required" }, { status: 400 });
  }
  if (input.type !== undefined && input.type !== "regular" && input.type !== "graduation") {
    return Response.json({ error: "type must be regular or graduation" }, { status: 400 });
  }

  const resident = await prisma.resident.findUnique({
    where: { id: input.residentId },
    include: {
      volunteerNotes: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!resident) {
    return Response.json({ error: "Resident not found" }, { status: 404 });
  }

  const settings = await prisma.rescueSettings.findUnique({ where: { id: "default" } });
  const type = input.type ?? "regular";
  const composed = await composePupdate({
    dog: resident,
    notes: resident.volunteerNotes,
    pinnedPostscript: settings?.pinnedPostscript ?? "",
    type,
    dogPageUrl: dogPageUrl(request.url, resident.id),
  });
  const pupdate = await prisma.pupdate.create({
    data: {
      residentId: resident.id,
      type,
      ...composed,
    },
  });

  return Response.json({ pupdate }, { status: 201 });
}
