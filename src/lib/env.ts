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

function positiveMillisecondsWithDefault(fallback: number) {
  return z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().positive().default(fallback),
  );
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ error: "is required and must be a valid URL" }),
  BETTER_AUTH_SECRET: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32, "must contain at least 32 characters").optional(),
  ),
  BETTER_AUTH_URL: urlWithDefault("http://localhost:3000"),
  EMAIL_CONNECTOR_ENCRYPTION_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.base64().refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "must be 32 random bytes encoded as base64",
    ).optional(),
  ),
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_BASE_URL: urlWithDefault("https://api.openai.com/v1"),
  OPENAI_MODEL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).default("gpt-4o-mini"),
  ),
  FIRECRAWL_API_KEY: optionalTrimmedString,
  FIRECRAWL_BASE_URL: urlWithDefault("https://api.firecrawl.dev/v2"),
  CRON_SECRET: optionalTrimmedString,
  ROSTER_SYNC_DRAIN_SECRET: optionalTrimmedString,
  ROSTER_SYNC_DRAIN_BUDGET_MS: positiveMillisecondsWithDefault(4 * 60 * 1000),
  ROSTER_SYNC_SCHEDULE_STAGGER_MS: positiveMillisecondsWithDefault(5 * 60 * 1000),
  STRIPE_SECRET_KEY: optionalTrimmedString,
  STRIPE_WEBHOOK_SECRET: optionalTrimmedString,
  APP_SMTP_HOST: optionalTrimmedString,
  APP_SMTP_PORT: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().min(1).max(65_535).optional(),
  ),
  APP_SMTP_SECURE: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.stringbool().optional(),
  ),
  APP_SMTP_USER: optionalTrimmedString,
  APP_SMTP_PASSWORD: optionalString,
  APP_EMAIL_FROM: optionalTrimmedString,
  GOOGLE_CLIENT_ID: optionalTrimmedString,
  GOOGLE_CLIENT_SECRET: optionalString,
  MICROSOFT_CLIENT_ID: optionalTrimmedString,
  MICROSOFT_CLIENT_SECRET: optionalString,
  MICROSOFT_TENANT_ID: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).default("common"),
  ),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === "production" && !environment.BETTER_AUTH_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["BETTER_AUTH_SECRET"],
      message: "is required in production",
    });
  }
});

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
