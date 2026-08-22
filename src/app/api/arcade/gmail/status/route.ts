import { gmailAuthStatus } from "@/lib/arcade";

export async function GET() {
  const status = await gmailAuthStatus();
  const email = status.authorized && process.env.ARCADE_USER_ID?.includes("@")
    ? process.env.ARCADE_USER_ID
    : undefined;

  return Response.json({ connected: status.authorized, ...(email ? { email } : {}) });
}
