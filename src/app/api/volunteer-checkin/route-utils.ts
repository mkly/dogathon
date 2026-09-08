import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import {
  interviewRequestSchema,
  interviewTranscriptSchema,
  textOnlyTranscript,
  type InterviewRequest,
} from "@/lib/volunteer-interview-request";

export type InterviewRouteContext = {
  checkInId: string;
  companion: {
    name: string;
    breed: string;
    sex: string;
    ageText: string;
  };
  messages: InterviewRequest["messages"];
  orgId: string;
  orgName: string;
  userId: string;
};

type InterviewRouteDependencies = {
  findCheckIn: (orgId: string, userId: string, checkInId: string) => Promise<{
    companion: InterviewRouteContext["companion"];
    transcript: unknown;
  } | null>;
  getAccess: typeof getOrganizationAccessBySlug;
};

const interviewRouteDependencies: InterviewRouteDependencies = {
  async findCheckIn(orgId, userId, checkInId) {
    const checkIn = await prisma.checkIn.findFirst({
      where: {
        id: checkInId,
        orgId,
        userId,
        status: "in_progress",
      },
      select: {
        resident: { select: { name: true, breed: true, sex: true, ageText: true } },
        transcript: true,
      },
    });
    return checkIn ? { companion: checkIn.resident, transcript: checkIn.transcript } : null;
  },
  getAccess: getOrganizationAccessBySlug,
};

export async function parseInterviewRouteRequest(
  request: Request,
): Promise<{ ok: false; response: Response } | { ok: true; input: InterviewRequest }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Request body must be valid JSON" }, { status: 400 }),
    };
  }

  const parsed = interviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        { error: "orgSlug, checkInId, and 1–40 valid messages are required" },
        { status: 400 },
      ),
    };
  }

  return { ok: true, input: parsed.data };
}

export function createGetInterviewRouteContext(dependencies: InterviewRouteDependencies) {
  return async function getRouteContext(
    request: Request,
    input: InterviewRequest,
  ): Promise<{ ok: false; response: Response } | { ok: true; context: InterviewRouteContext }> {
    const access = await dependencies.getAccess(request.headers, input.orgSlug, {
      roster: ["contribute"],
    });
    if (!access) {
      return { ok: false, response: Response.json({ error: "Organization not found" }, { status: 404 }) };
    }
    if (!access.context) {
      return {
        ok: false,
        response: Response.json(
          { error: access.authenticated ? "Organization membership required" : "Sign-in required" },
          { status: access.authenticated ? 403 : 401 },
        ),
      };
    }

    const checkIn = await dependencies.findCheckIn(
      access.context.orgId,
      access.context.userId,
      input.checkInId,
    );
    if (!checkIn) {
      return { ok: false, response: Response.json({ error: "Check-in not found" }, { status: 404 }) };
    }
    const stored = interviewTranscriptSchema.safeParse(checkIn.transcript);
    const incoming = textOnlyTranscript(input.messages);
    const expectedPrefix = incoming.slice(0, -1);
    const nextMessage = incoming.at(-1);
    if (
      !stored.success
      || nextMessage?.role !== "user"
      || JSON.stringify(textOnlyTranscript(stored.data)) !== JSON.stringify(expectedPrefix)
    ) {
      return {
        ok: false,
        response: Response.json({ error: "Check-in transcript is out of date" }, { status: 409 }),
      };
    }

    return {
      ok: true,
      context: {
        checkInId: input.checkInId,
        companion: checkIn.companion,
        messages: incoming,
        orgId: access.context.orgId,
        orgName: access.organization.name,
        userId: access.context.userId,
      },
    };
  };
}

export const getInterviewRouteContext = createGetInterviewRouteContext(interviewRouteDependencies);
