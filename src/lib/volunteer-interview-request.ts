import { z } from "zod";

import { uuidSchema } from "./uuid.ts";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(2000),
});

const messageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  parts: z.array(textPartSchema).min(1),
});

export const interviewRequestSchema = z.object({
  orgSlug: z.string().trim().min(1).max(200),
  residentId: uuidSchema,
  messages: z.array(messageSchema).min(1).max(40),
});

export type InterviewRequest = z.infer<typeof interviewRequestSchema>;
