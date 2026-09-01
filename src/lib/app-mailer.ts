import {
  sendSmtpEmail,
  validateEmailHeaders,
  type DescribedSend,
  type EmailInput,
  type SmtpConfiguration,
  type TransportFactory,
} from "./email-connectors.ts";

type AppMailerEnvironment = {
  [key: string]: string | undefined;
  APP_SMTP_HOST?: string;
  APP_SMTP_PORT?: string;
  APP_SMTP_SECURE?: string;
  APP_SMTP_USER?: string;
  APP_SMTP_PASSWORD?: string;
  APP_EMAIL_FROM?: string;
};

type AppMailerDependencies = {
  env?: AppMailerEnvironment;
  transportFactory?: TransportFactory;
};

function smtpSecure(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || ["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  throw new Error("APP_SMTP_SECURE must be a boolean");
}

function smtpPort(value: string | undefined, secure: boolean): number {
  const normalized = value?.trim();
  if (!normalized) return secure ? 465 : 587;

  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("APP_SMTP_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function configuration(env: AppMailerEnvironment): SmtpConfiguration | null {
  const host = env.APP_SMTP_HOST?.trim() ?? "";
  const user = env.APP_SMTP_USER?.trim() ?? "";
  const password = env.APP_SMTP_PASSWORD ?? "";
  const fromEmail = env.APP_EMAIL_FROM?.trim() ?? "";
  if (!host || !user || !password.trim() || !fromEmail) return null;

  const secure = smtpSecure(env.APP_SMTP_SECURE);
  return {
    host,
    port: smtpPort(env.APP_SMTP_PORT, secure),
    secure,
    user,
    password,
    fromEmail,
  };
}

/** Sends platform-owned mail, or describes it when platform SMTP is unconfigured. */
export async function sendAppEmail(
  input: EmailInput,
  dependencies: AppMailerDependencies = {},
): Promise<DescribedSend | null> {
  const env = dependencies.env ?? process.env;
  const from = env.APP_EMAIL_FROM?.trim() ?? "";
  validateEmailHeaders(input, from);

  const config = configuration(env);
  if (!config) {
    return {
      dryRun: true,
      connector: "smtp",
      from,
      to: input.to,
      subject: input.subject,
      body: input.body,
      contentType: input.contentType === "html" ? "html" : "plain",
    };
  }

  await sendSmtpEmail(config, input, dependencies.transportFactory);
  return null;
}
