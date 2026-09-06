import {
  sendAppEmail,
  type AppMailerDependencies,
} from "./app-mailer.ts";
import { env } from "./env.ts";

type MagicLinkEmail = {
  email: string;
  url: string;
};

export function redactEmailLink(url: string) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, "[redacted]");
    return parsed.toString();
  } catch {
    return "[redacted invalid URL]";
  }
}

export async function sendMagicLinkEmail(
  { email, url }: MagicLinkEmail,
  dependencies?: AppMailerDependencies,
) {
  const describedSend = await sendAppEmail({
    to: email,
    subject: "Sign in to your Dogathon sponsor account",
    body: [
      "Use this secure link to sign in to your Dogathon sponsor account:",
      "",
      url,
      "",
      "This link expires in 5 minutes and can only be used once.",
    ].join("\n"),
  }, dependencies);

  if (describedSend) {
    const loggedUrl = env.NODE_ENV === "production" ? redactEmailLink(url) : url;
    console.info(`Dogathon magic link for ${email}: ${loggedUrl}`);
  }
}
