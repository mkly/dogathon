import { composePupdate } from "@/lib/composer";
import { requireApiOrganization } from "@/lib/organization-access";
import { dogPageUrl } from "@/lib/pupdate-delivery";
import { prisma } from "@/lib/prisma";

type ComposeRequest = {
  residentId?: unknown;
  type?: unknown;
};

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;
  const { orgId } = access.context;

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

  const resident = await prisma.resident.findFirst({
    where: { id: input.residentId, orgId },
    include: {
      volunteerNotes: {
        orderBy: { createdAt: "desc" },
        take: 10,
        // never pull photoData bytes into the compose payload
        select: { note: true, photoUrl: true, createdAt: true },
      },
    },
  });
  if (!resident) {
    return Response.json({ error: "Resident not found" }, { status: 404 });
  }

  const settings = await prisma.rescueSettings.findUnique({ where: { orgId } });
  const type = input.type ?? "regular";
  let composed;
  try {
    composed = await composePupdate({
      dog: {
        name: resident.name,
        breed: resident.breed,
        sex: resident.sex,
        ageText: resident.ageText,
      },
      notes: resident.volunteerNotes,
      pinnedPostscript: settings?.pinnedPostscript ?? "",
      type,
      dogPageUrl: dogPageUrl(request.url, resident.id),
    });
  } catch (error) {
    console.error("Pupdate composition failed", error);
    return Response.json({ error: "Drafting the pupdate failed. Please try again." }, { status: 502 });
  }
  const pupdate = await prisma.pupdate.create({
    data: {
      orgId,
      residentId: resident.id,
      type,
      // pin the picture from the notes this draft was written from: the roster
      // profile shot is the dog, but the update is about the day
      photoUrl: resident.volunteerNotes.find((note) => note.photoUrl)?.photoUrl ?? null,
      // Kept only until the sibling delivery task removes the legacy column.
      smsText: "",
      ...composed,
    },
  });

  return Response.json({ pupdate }, { status: 201 });
}
