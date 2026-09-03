import {
  sendAppEmail,
  type AppMailerDependencies,
} from "./app-mailer.ts";

type MagicLinkEmail = {
  email: string;
  url: string;
};

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
    console.info(`Dogathon magic link for ${email}: ${url}`);
  }
}
