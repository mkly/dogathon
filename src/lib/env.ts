import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional(),
);

const optionalTrimmedString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

function urlWithDefault(fallback: string) {
  return z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.url().default(fallback),
  ).transform((value) => value.replace(/\/+$/u, ""));
}

const core = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ error: "is required and must be a valid URL" }),
};

// In development and tests, absent auth secrets permit local startup. Production rejects them.
const auth = {
  BETTER_AUTH_SECRET: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32, "must contain at least 32 characters").optional(),
  ),
  BETTER_AUTH_URL: urlWithDefault("http://localhost:3000"),
};

// Without an API key, AI calls are described or replaced with deterministic output.
const ai = {
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_BASE_URL: urlWithDefault("https://api.openai.com/v1"),
  OPENAI_MODEL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).default("gpt-4o-mini"),
  ),
};

// Without an API key, roster sync uses its checked-in fallback capture.
const firecrawl = {
  FIRECRAWL_API_KEY: optionalTrimmedString,
  FIRECRAWL_BASE_URL: urlWithDefault("https://api.firecrawl.dev/v2"),
};

// Without the secret, scheduled roster routes reject every request.
const scheduler = {
  CRON_SECRET: optionalTrimmedString,
};

// Without the platform secret, billing calls remain on their described dry-run path.
const stripe = {
  STRIPE_SECRET_KEY: optionalTrimmedString,
  STRIPE_WEBHOOK_SECRET: optionalTrimmedString,
};

// Without a complete SMTP configuration, platform mail is described rather than sent.
const platformSmtp = {
  APP_SMTP_HOST: optionalTrimmedString,
  APP_SMTP_PORT: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().min(1).max(65_535).optional(),
  ),
  APP_SMTP_SECURE: z.preprocess(
    (value) => typeof value === "string" ? value.trim() || undefined : value,
    z.stringbool().optional(),
  ),
  APP_SMTP_USER: optionalTrimmedString,
  APP_SMTP_PASSWORD: optionalString,
  APP_EMAIL_FROM: optionalTrimmedString,
};

// Without encryption and OAuth credentials, connector setup is disabled and sends are described.
const emailConnectors = {
  EMAIL_CONNECTOR_ENCRYPTION_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.base64().refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "must be 32 random bytes encoded as base64",
    ).optional(),
  ),
  GOOGLE_CLIENT_ID: optionalTrimmedString,
  GOOGLE_CLIENT_SECRET: optionalString,
  MICROSOFT_CLIENT_ID: optionalTrimmedString,
  MICROSOFT_CLIENT_SECRET: optionalString,
  MICROSOFT_TENANT_ID: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).default("common"),
  ),
};

const environmentSchema = z.object({
  ...core,
  ...auth,
  ...ai,
  ...firecrawl,
  ...scheduler,
  ...stripe,
  ...platformSmtp,
  ...emailConnectors,
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === "production" && !environment.BETTER_AUTH_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["BETTER_AUTH_SECRET"],
      message: "is required in production",
    });
  }
  if (environment.NODE_ENV === "production" && !environment.EMAIL_CONNECTOR_ENCRYPTION_KEY) {
    context.addIssue({
      code: "custom",
      path: ["EMAIL_CONNECTOR_ENCRYPTION_KEY"],
      message: "is required in production",
    });
  }
}).transform((environment) => ({
  ...environment,
  features: Object.freeze({
    ai: Boolean(environment.OPENAI_API_KEY),
    firecrawl: Boolean(environment.FIRECRAWL_API_KEY),
    stripe: Boolean(environment.STRIPE_SECRET_KEY),
    scheduler: Boolean(environment.CRON_SECRET),
    platformSmtp: Boolean(
      environment.APP_SMTP_HOST
      && environment.APP_SMTP_PORT
      && environment.APP_EMAIL_FROM
    ),
    googleOAuth: Boolean(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET),
    microsoftOAuth: Boolean(
      environment.MICROSOFT_CLIENT_ID && environment.MICROSOFT_CLIENT_SECRET
    ),
    connectorEncryption: Boolean(environment.EMAIL_CONNECTOR_ENCRYPTION_KEY),
  }),
}));

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(source: Record<string, string | undefined>): AppEnvironment {
  const result = environmentSchema.safeParse(source);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment variables: ${details}`, { cause: result.error });
}

/** Server-only environment, parsed exactly once when this module is loaded. */
export const env = parseEnvironment(process.env);

/** Preserve the host process environment when a test launches a configured child process. */
export function subprocessEnvironment(overrides: Record<string, string | undefined>) {
  return { ...process.env, ...overrides };
}
