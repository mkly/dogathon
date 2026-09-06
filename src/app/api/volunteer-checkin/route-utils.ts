import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import {
  interviewRequestSchema,
  type InterviewRequest,
} from "@/lib/volunteer-interview-request";

export type InterviewRouteContext = {
  companion: {
    name: string;
    breed: string;
    sex: string;
    ageText: string;
  };
  messages: InterviewRequest["messages"];
  orgName: string;
};

type InterviewRouteDependencies = {
  findCompanion: (orgId: string, residentId: string) => Promise<InterviewRouteContext["companion"] | null>;
  getAccess: typeof getOrganizationAccessBySlug;
};

const interviewRouteDependencies: InterviewRouteDependencies = {
  async findCompanion(orgId, residentId) {
    return prisma.resident.findFirst({
      where: {
        id: residentId,
        orgId,
        status: "available",
        sponsorships: { some: { status: "active" } },
      },
      select: { name: true, breed: true, sex: true, ageText: true },
    });
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
        { error: "orgSlug, residentId, and 1–40 valid messages are required" },
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

    const companion = await dependencies.findCompanion(access.context.orgId, input.residentId);
    if (!companion) {
      return { ok: false, response: Response.json({ error: "Companion not found" }, { status: 404 }) };
    }

    return {
      ok: true,
      context: { companion, messages: input.messages, orgName: access.organization.name },
    };
  };
}

export const getInterviewRouteContext = createGetInterviewRouteContext(interviewRouteDependencies);
