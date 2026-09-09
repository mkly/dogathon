import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateText,
  streamText,
  type UIMessage,
} from "ai";

import { createAiModel, hasAiCredentials, reasoning } from "./ai-model.ts";
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
  photo?: {
    data: Uint8Array;
    mime: string;
  };
};

type InterviewTurnOptions = {
  onFinish?: (messages: UIMessage[]) => Promise<void> | void;
};

const SCRIPTED_QUESTIONS = [
  (name: string) => `What did you and ${name} get up to today?`,
  (name: string) =>
    `What was ${name} like today: playful, sleepy, silly, cuddly?`,
  (name: string) =>
    `Was there a moment with ${name} that made you smile, something a sponsor would love to hear about?`,
] as const;

function scriptedReply(input: InterviewInput): string {
  const questionsAsked = input.messages.filter(
    (message) =>
      message.role === "assistant" &&
      SCRIPTED_QUESTIONS.some(
        (question) => messageText(message) === question(input.companion.name),
      ),
  ).length;

  if (questionsAsked < SCRIPTED_QUESTIONS.length) {
    return SCRIPTED_QUESTIONS[questionsAsked](input.companion.name);
  }

  return `Thanks, ${input.companion.name}'s sponsors are going to love hearing about this. [[READY]]`;
}

function textStreamResponse(
  text: string,
  input: InterviewInput,
  options: InterviewTurnOptions,
): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "scripted-response";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    originalMessages: input.messages,
    generateId,
    onEnd: ({ messages }) => options.onFinish?.(messages),
  });
  return createUIMessageStreamResponse({ stream });
}

export function buildInterviewSystemPrompt({
  companion,
  orgName,
}: Omit<InterviewInput, "messages">): string {
  return [
    `You are a friendly interviewer for ${orgName ?? "an animal rescue"}, chatting with a volunteer who just spent time with ${companion.name}, a ${companion.ageText} ${companion.breed} (${companion.sex}).`,
    `Your only job is to collect fun, vivid material for the short email updates that ${companion.name}'s sponsors receive. Sponsors are people who give a little each month and want to feel close to ${companion.name}; the conversation is not a wellness check, a care log, or a report for staff.`,
    "Ask one short, curious question at a time and ask no more than five questions total.",
    "Go after the good stuff: what they did together, games and favorite spots, personality quirks, funny or sweet moments, new friends, small wins like a new trick or a brave first, and the volunteer's own feelings about the visit. Follow up on anything charming to get a concrete detail a sponsor could picture.",
    "Do not ask about eating, drinking, bathroom habits, weight, medication, or health, and do not ask what staff should know. If the volunteer raises a concern, acknowledge it kindly in a few words and steer back to the visit.",
    "Never invent facts, give medical advice, or use dog-specific wording; call the animal a companion.",
    "When opening the conversation with a photo, first describe one concrete visible detail about the setting, posture, expression, or what the companion is doing in one short sentence, then ask the first question.",
    "Never infer health, breed, or identity from a photo. If no photo is provided, skip the description and ask the first question.",
    "When you have enough for a lively update, respond with one short, appreciative wrap-up whose final text is exactly [[READY]].",
  ].join(" ");
}

// Reasoning models spend their thinking inside this budget before any visible
// text, so it only exists as a runaway guard and must stay far above what a
// turn needs; a tight cap shows up as an empty reply.
const MAX_INTERVIEW_TURN_OUTPUT_TOKENS = 8000;

async function generateOpening(
  input: InterviewInput,
  includePhoto: boolean,
): Promise<string> {
  const content =
    includePhoto && input.photo
      ? [
          {
            type: "text" as const,
            text: "Open the volunteer update from this photo, following the opening-message rules.",
          },
          {
            type: "file" as const,
            data: input.photo.data,
            mediaType: input.photo.mime,
          },
        ]
      : "Open the volunteer update now. No photo is available to you, so ask the first question without describing one.";
  const { text } = await generateText({
    model: createAiModel(),
    instructions: buildInterviewSystemPrompt(input),
    messages: [{ role: "user", content }],
    maxOutputTokens: MAX_INTERVIEW_TURN_OUTPUT_TOKENS,
    providerOptions: reasoning("low"),
  });
  if (!text.trim())
    throw new Error("The interviewer returned an empty opening turn");
  return text;
}

export async function interviewTurn(
  input: InterviewInput,
  options: InterviewTurnOptions = {},
): Promise<Response> {
  if (!hasAiCredentials())
    return textStreamResponse(scriptedReply(input), input, options);

  if (input.messages.length === 0) {
    if (input.photo) {
      try {
        return textStreamResponse(
          await generateOpening(input, true),
          input,
          options,
        );
      } catch (error) {
        console.error(
          "Volunteer interview vision opening failed; retrying without the photo",
          error,
        );
      }
    }
    try {
      return textStreamResponse(
        await generateOpening(input, false),
        input,
        options,
      );
    } catch (error) {
      console.error(
        "Volunteer interview text opening failed; using the scripted opening",
        error,
      );
      return textStreamResponse(scriptedReply(input), input, options);
    }
  }

  const result = streamText({
    model: createAiModel(),
    instructions: buildInterviewSystemPrompt(input),
    messages: await convertToModelMessages(input.messages),
    maxOutputTokens: MAX_INTERVIEW_TURN_OUTPUT_TOKENS,
    providerOptions: reasoning("low"),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: input.messages,
    generateMessageId: generateId,
    onEnd: ({ messages }) => options.onFinish?.(messages),
  });
}
