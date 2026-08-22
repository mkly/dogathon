import { gmailAuthStatus } from "@/lib/arcade";
import { requireApiSession } from "@/lib/auth-session";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession(request.headers);
  if (unauthorized) return unauthorized;

  const status = await gmailAuthStatus();
  const email = status.authorized && process.env.ARCADE_USER_ID?.includes("@")
    ? process.env.ARCADE_USER_ID
    : undefined;

  return Response.json({ connected: status.authorized, ...(email ? { email } : {}) });
}
