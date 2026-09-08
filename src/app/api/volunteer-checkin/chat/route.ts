import { getInterviewRouteContext, parseInterviewRouteRequest } from "../route-utils";
import { interviewTurn } from "@/lib/volunteer-interview";
import { checkRateLimit, getRateLimitIdentity, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { getPhoto } from "@/lib/photo-storage";
import { interviewTranscriptSchema, textOnlyTranscript } from "@/lib/volunteer-interview-request";

export async function POST(request: Request) {
  const parsed = await parseInterviewRouteRequest(request);
  if (!parsed.ok) return parsed.response;

  const route = await getInterviewRouteContext(request, parsed.input);
  if (!route.ok) return route.response;

  const rateLimit = await checkRateLimit({ ...RATE_LIMITS.volunteerCheckIn, identity: await getRateLimitIdentity(request.headers), scope: "volunteer-checkin-chat" });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  try {
    let photo;
    if (route.context.messages.length === 0 && route.context.photoStorageKey) {
      try {
        photo = await getPhoto(route.context.photoStorageKey) ?? undefined;
      } catch (error) {
        console.error("Volunteer interview photo could not be read; opening without it", error);
      }
    }
    return await interviewTurn({ ...route.context, photo }, {
      async onFinish(messages) {
        const parsed = interviewTranscriptSchema.safeParse(messages);
        if (!parsed.success) throw new Error("Generated check-in transcript was invalid");
        await prisma.checkIn.updateMany({
          where: {
            id: route.context.checkInId,
            orgId: route.context.orgId,
            status: "in_progress",
            userId: route.context.userId,
          },
          data: { transcript: textOnlyTranscript(parsed.data) },
        });
      },
    });
  } catch (error) {
    console.error("Volunteer interview failed", error);
    return Response.json({ error: "The interviewer is unavailable. Please try again." }, { status: 502 });
  }
}
