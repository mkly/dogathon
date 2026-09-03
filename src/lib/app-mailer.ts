import { z } from "zod";

import {
  sendSmtpEmail,
  validateEmailHeaders,
  type DescribedSend,
  type EmailInput,
  type SmtpConfiguration,
  type TransportFactory,
} from "./email-connectors.ts";
import { env as appEnv } from "./env.ts";

export type AppMailerEnvironment = {
  [key: string]: string | number | boolean | undefined;
  APP_SMTP_HOST?: string;
  APP_SMTP_PORT?: string | number;
  APP_SMTP_SECURE?: string | boolean;
  APP_SMTP_USER?: string;
  APP_SMTP_PASSWORD?: string;
  APP_EMAIL_FROM?: string;
};

export type AppMailerDependencies = {
  env?: AppMailerEnvironment;
  transportFactory?: TransportFactory;
};

const smtpCredentialsSchema = z.object({
  APP_SMTP_HOST: z.string().trim().min(1),
  APP_SMTP_USER: z.string().trim().min(1),
  APP_SMTP_PASSWORD: z.string().refine((value) => Boolean(value.trim())),
  APP_EMAIL_FROM: z.string().trim().min(1),
});
// The typed env module hands these through already coerced, so both schemas
// accept the parsed value as well as the raw string a caller-supplied
// environment still carries.
const smtpSecureSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim() || undefined : value,
  z.union([z.boolean(), z.stringbool()]).optional().default(false),
);
const smtpPortSchema = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.coerce.number().int().min(1).max(65_535).optional(),
);

function configuration(env: AppMailerEnvironment): SmtpConfiguration | null {
  const credentials = smtpCredentialsSchema.safeParse(env);
  if (!credentials.success) return null;
  const secureResult = smtpSecureSchema.safeParse(env.APP_SMTP_SECURE);
  if (!secureResult.success) throw new Error("APP_SMTP_SECURE must be a boolean");
  const portResult = smtpPortSchema.safeParse(env.APP_SMTP_PORT);
  if (!portResult.success) {
    throw new Error("APP_SMTP_PORT must be an integer between 1 and 65535");
  }
  const secure = secureResult.data;
  const { APP_SMTP_HOST: host, APP_SMTP_USER: user, APP_SMTP_PASSWORD: password,
    APP_EMAIL_FROM: fromEmail } = credentials.data;
  return {
    host,
    port: portResult.data ?? (secure ? 465 : 587),
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
  const environment = dependencies.env ?? appEnv;
  const from = environment.APP_EMAIL_FROM?.trim() ?? "";
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
