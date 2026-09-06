import { getInterviewRouteContext, parseInterviewRouteRequest } from "../route-utils";
import { interviewTurn } from "@/lib/volunteer-interview";
import { checkRateLimit, getRateLimitIdentity, RATE_LIMITS, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const parsed = await parseInterviewRouteRequest(request);
  if (!parsed.ok) return parsed.response;

  const route = await getInterviewRouteContext(request, parsed.input);
  if (!route.ok) return route.response;

  const rateLimit = await checkRateLimit({ ...RATE_LIMITS.volunteerCheckIn, identity: await getRateLimitIdentity(request.headers), scope: "volunteer-checkin-chat" });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  try {
    return await interviewTurn(route.context);
  } catch (error) {
    console.error("Volunteer interview failed", error);
    return Response.json({ error: "The interviewer is unavailable. Please try again." }, { status: 502 });
  }
}
