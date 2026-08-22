import Arcade from "@arcadeai/arcadejs";

const TOOLS = {
  gmailSend: "Gmail.SendEmail",
  twilioSendSms: "Twilio.SendSms",
  firecrawlScrape: "Firecrawl.ScrapeUrl",
} as const;

export type DryRunCall = {
  dryRun: true;
  operation: "authorize" | "execute";
  toolName: (typeof TOOLS)[keyof typeof TOOLS];
  userId: string;
  input: Record<string, unknown>;
};

export type EmailInput = {
  to: string;
  subject: string;
  body: string;
};

export type SmsInput = {
  to: string;
  body: string;
};

function userId(user?: string): string {
  return user ?? process.env.ARCADE_USER_ID ?? "dry-run-user";
}

function dryRun(
  operation: DryRunCall["operation"],
  toolName: DryRunCall["toolName"],
  input: Record<string, unknown>,
  user?: string,
): DryRunCall {
  const call = {
    dryRun: true,
    operation,
    toolName,
    userId: userId(user),
    input,
  } as const;

  console.info("Arcade dry run", call);
  return call;
}

function client(): Arcade | null {
  const apiKey = process.env.ARCADE_API_KEY;
  return apiKey ? new Arcade({ apiKey }) : null;
}

function liveUserId(user?: string): string {
  const resolved = user ?? process.env.ARCADE_USER_ID;
  if (!resolved) {
    throw new Error("ARCADE_USER_ID is required when ARCADE_API_KEY is configured");
  }
  return resolved;
}

export async function scrapeUrl(url: string, user?: string) {
  const input = { url, formats: ["markdown"] };
  const arcade = client();
  if (!arcade) {
    return dryRun("execute", TOOLS.firecrawlScrape, input, user);
  }

  return arcade.tools.execute({
    tool_name: TOOLS.firecrawlScrape,
    input,
    user_id: liveUserId(user),
  });
}

export async function sendEmail({ to, subject, body }: EmailInput, user?: string) {
  const input = { recipient: to, subject, body };
  const arcade = client();
  if (!arcade) {
    return dryRun("execute", TOOLS.gmailSend, input, user);
  }

  return arcade.tools.execute({
    tool_name: TOOLS.gmailSend,
    input,
    user_id: liveUserId(user),
  });
}

export async function sendSms({ to, body }: SmsInput, user?: string) {
  const input = { to, body };
  const arcade = client();
  if (!arcade) {
    return dryRun("execute", TOOLS.twilioSendSms, input, user);
  }

  return arcade.tools.execute({
    tool_name: TOOLS.twilioSendSms,
    input,
    user_id: liveUserId(user),
  });
}

export async function gmailAuthorizeUrl(user?: string) {
  const arcade = client();
  if (!arcade) {
    return dryRun("authorize", TOOLS.gmailSend, {}, user);
  }

  const response = await arcade.tools.authorize({
    tool_name: TOOLS.gmailSend,
    user_id: liveUserId(user),
  });
  return response.url ?? null;
}

export async function gmailAuthStatus(user?: string) {
  const arcade = client();
  if (!arcade) {
    return dryRun("authorize", TOOLS.gmailSend, {}, user);
  }

  const response = await arcade.tools.authorize({
    tool_name: TOOLS.gmailSend,
    user_id: liveUserId(user),
  });
  return {
    authorized: response.status === "completed",
    status: response.status,
    url: response.url ?? null,
  };
}
