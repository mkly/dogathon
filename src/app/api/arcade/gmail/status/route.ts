import { gmailAuthStatus } from "@/lib/arcade";
import { requireApiOrganization } from "@/lib/organization-access";

export async function GET(request: Request) {
  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;

  if (!process.env.ARCADE_API_KEY) {
    return Response.json({ connected: false, status: "not_configured" });
  }

  try {
    const status = await gmailAuthStatus();
    const email = status.authorized && process.env.ARCADE_USER_ID?.includes("@")
      ? process.env.ARCADE_USER_ID
      : undefined;

    return Response.json({
      connected: status.authorized,
      status: status.status,
      ...(email ? { email } : {}),
    });
  } catch (error) {
    console.error("Gmail status check failed", error);
    const message = error instanceof Error ? error.message : "Gmail status check failed";
    const status = message.includes("ARCADE_USER_ID is required") ? 503 : 502;
    return Response.json({ connected: false, error: message }, { status });
  }
}
