import { getInterviewRouteContext, parseInterviewRouteRequest } from "../route-utils";
import { summarizeInterview } from "@/lib/volunteer-interview";

export async function POST(request: Request) {
  const parsed = await parseInterviewRouteRequest(request);
  if (!parsed.ok) return parsed.response;

  const route = await getInterviewRouteContext(request, parsed.input);
  if (!route.ok) return route.response;

  try {
    return Response.json(await summarizeInterview(route.context));
  } catch (error) {
    console.error("Volunteer interview summary failed", error);
    return Response.json({ error: "The summary could not be created. Please try again." }, { status: 502 });
  }
}
