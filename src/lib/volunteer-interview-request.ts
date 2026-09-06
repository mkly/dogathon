import { z } from "zod";

import { uuidSchema } from "./uuid.ts";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(2000),
});

/**
 * Assistant messages from the AI SDK carry step boundary parts alongside their
 * text, so parts are filtered down to the text the interview actually uses
 * before the text limits are applied.
 */
const messagePartsSchema = z
  .array(z.looseObject({ type: z.string() }))
  .transform((parts) => parts.filter((part) => part.type === "text"))
  .pipe(z.array(textPartSchema).min(1));

const messageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  parts: messagePartsSchema,
});

export const interviewRequestSchema = z.object({
  orgSlug: z.string().trim().min(1).max(200),
  residentId: uuidSchema,
  messages: z.array(messageSchema).min(1).max(40),
});

export type InterviewRequest = z.infer<typeof interviewRequestSchema>;
