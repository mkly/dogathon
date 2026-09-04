import {
  sendSmtpEmail,
  validateEmailHeaders,
  type DescribedSend,
  type EmailInput,
  type SmtpConfiguration,
  type TransportFactory,
} from "./email-connectors.ts";
import { env as appEnv } from "./env.ts";
import type { AppEnvironment } from "./env.ts";

export type AppMailerEnvironment = Pick<
  AppEnvironment,
  | "APP_SMTP_HOST"
  | "APP_SMTP_PORT"
  | "APP_SMTP_SECURE"
  | "APP_SMTP_USER"
  | "APP_SMTP_PASSWORD"
  | "APP_EMAIL_FROM"
  | "features"
>;

export type AppMailerDependencies = {
  env?: AppMailerEnvironment;
  transportFactory?: TransportFactory;
};

function configuration(env: AppMailerEnvironment): SmtpConfiguration | null {
  if (!env.features.platformSmtp) return null;
  return {
    host: env.APP_SMTP_HOST!,
    port: env.APP_SMTP_PORT!,
    secure: env.APP_SMTP_SECURE ?? false,
    user: env.APP_SMTP_USER,
    password: env.APP_SMTP_PASSWORD,
    fromEmail: env.APP_EMAIL_FROM!,
  };
}

/** Sends platform-owned mail, or describes it when platform SMTP is unconfigured. */
export async function sendAppEmail(
  input: EmailInput,
  dependencies: AppMailerDependencies = {},
): Promise<DescribedSend | null> {
  const environment = dependencies.env ?? appEnv;
  const from = environment.APP_EMAIL_FROM ?? "";
  validateEmailHeaders(input, from);

  const config = configuration(environment);
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
