import { gmailAuthStatus } from "@/lib/arcade";

export async function GET() {
  if (!process.env.ARCADE_API_KEY) {
    return Response.json({ connected: false });
  }

  try {
    const status = await gmailAuthStatus();
    const email = status.authorized && process.env.ARCADE_USER_ID?.includes("@")
      ? process.env.ARCADE_USER_ID
      : undefined;

    return Response.json({ connected: status.authorized, ...(email ? { email } : {}) });
  } catch (error) {
    console.error("Gmail status check failed", error);
    const message = error instanceof Error ? error.message : "Gmail status check failed";
    const status = message.includes("ARCADE_USER_ID is required") ? 503 : 502;
    return Response.json({ connected: false, error: message }, { status });
  }
}
