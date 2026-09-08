import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  Output,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { createAiModel, hasAiCredentials } from "./ai-model.ts";
import { messageText } from "./ui-message-text.ts";

export type InterviewCompanion = {
  name: string;
  breed: string;
  sex: string;
  ageText: string;
};

export type InterviewInput = {
  companion: InterviewCompanion;
  orgName?: string;
  messages: UIMessage[];
};

const SCRIPTED_QUESTIONS = [
  (name: string) => `What did you and ${name} do together today?`,
  (name: string) => `How was ${name}'s mood and energy?`,
  () => "Is there anything else staff should know, such as eating, drinking, bathroom habits, or a nice moment?",
] as const;

const interviewSummarySchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

function userAnswers(messages: UIMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map(messageText)
    .filter(Boolean);
}

function scriptedReply(input: InterviewInput): string {
  const questionsAsked = input.messages.filter((message) =>
    message.role === "assistant" && SCRIPTED_QUESTIONS.some((question) =>
      messageText(message) === question(input.companion.name))).length;

  if (questionsAsked < SCRIPTED_QUESTIONS.length) {
    return SCRIPTED_QUESTIONS[questionsAsked](input.companion.name);
  }

  return `Thanks — that gives the ${input.orgName ?? "rescue"} team what they need. [[READY]]`;
}

function textStreamResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "scripted-response";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function ensureSentence(text: string): string {
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function deterministicSummary(messages: UIMessage[]): { note: string } {
  const note = userAnswers(messages).map(ensureSentence).join(" ").slice(0, 2000).trim();
  return { note: note || "No visit details were provided." };
}

export function buildInterviewSystemPrompt({
  companion,
  orgName,
}: Omit<InterviewInput, "messages">): string {
  return [
    `You are a warm volunteer interviewer for ${orgName ?? "an animal rescue"}.`,
    `You are asking about ${companion.name}, a ${companion.ageText} ${companion.breed} (${companion.sex}).`,
    "Ask one short question at a time and ask no more than five questions total.",
    "Gather only facts the volunteer knows: what they did together, mood and energy, eating and drinking, bathroom habits, anything staff should know, and a nice moment for sponsors.",
    "Never invent facts, give medical advice, or use dog-specific wording; call the animal a companion.",
    "When you have enough information, respond with one short wrap-up whose final text is exactly [[READY]].",
  ].join(" ");
}

// Reasoning models spend their thinking inside this budget before any visible
// text; a small cap leaves the volunteer with an empty reply.
const MAX_INTERVIEW_TURN_OUTPUT_TOKENS = 1200;
const MAX_INTERVIEW_SUMMARY_OUTPUT_TOKENS = 600;

export async function interviewTurn(input: InterviewInput): Promise<Response> {
  if (!hasAiCredentials()) return textStreamResponse(scriptedReply(input));

  const result = streamText({
    model: createAiModel(),
    instructions: buildInterviewSystemPrompt(input),
    messages: await convertToModelMessages(input.messages),
    maxOutputTokens: MAX_INTERVIEW_TURN_OUTPUT_TOKENS,
  });

  return result.toUIMessageStreamResponse();
}

export async function summarizeInterview(input: InterviewInput): Promise<{ note: string }> {
  if (!hasAiCredentials()) return deterministicSummary(input.messages);

  const transcript = input.messages
    .map((message) => `${message.role}: ${messageText(message)}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n");
  const { output } = await generateText({
    model: createAiModel(),
    output: Output.object({ schema: interviewSummarySchema }),
    maxOutputTokens: MAX_INTERVIEW_SUMMARY_OUTPUT_TOKENS,
    instructions: [
      "Turn the volunteer interview into one concise plain-text care note for rescue staff.",
      "Use only facts in the transcript, do not invent details, and do not give medical advice.",
      "First person is allowed. The note must be no longer than 2000 characters.",
    ].join(" "),
    prompt: JSON.stringify({ companion: input.companion, transcript }),
  });

  return output;
}
