import { createChatCompletion, hasChatCompletionCredentials } from "./chat-completions.ts";

export type PupdateType = "regular" | "graduation";

export interface PupdateDog {
  name: string;
  breed?: string;
  sex?: string;
  ageText?: string;
}

export type PupdateNote = string | { note: string; [key: string]: unknown };

export interface ComposePupdateInput {
  dog: PupdateDog;
  notes: PupdateNote[];
  pinnedPostscript: string;
  type: PupdateType;
  dogPageUrl: string;
}

export interface ComposedPupdate {
  subject: string;
  bodyText: string;
}

function cleanNotes(notes: PupdateNote[]): string[] {
  return notes
    .map((note) => (typeof note === "string" ? note : note.note))
    .map((note) => note.trim())
    .filter(Boolean);
}

function deterministicCompose(input: ComposePupdateInput): ComposedPupdate {
  const name = input.dog.name.trim();
  const notes = cleanNotes(input.notes);
  const intro =
    input.type === "graduation"
      ? `${name} was adopted today. You helped get ${name} there.`
      : `Here is the latest pupdate from ${name}.`;
  const noteSection = notes.length > 0 ? `Recent notes:\n${notes.map((note) => `- ${note}`).join("\n")}` : "";
  const bodyText = [intro, noteSection, input.pinnedPostscript.trim()].filter(Boolean).join("\n\n");

  return {
    subject: input.type === "graduation" ? `${name} found a home!` : `A pupdate from ${name}`,
    bodyText,
  };
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  return JSON.parse((fenced?.[1] ?? text).trim());
}

function isComposedPupdate(value: unknown): value is ComposedPupdate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.subject === "string" &&
    typeof candidate.bodyText === "string"
  );
}

function ensureRequiredContent(
  draft: ComposedPupdate,
  input: ComposePupdateInput,
): ComposedPupdate {
  const postscript = input.pinnedPostscript.trim();
  const bodyText = postscript && !draft.bodyText.includes(postscript)
    ? `${draft.bodyText.trim()}\n\n${postscript}`
    : draft.bodyText.trim();

  return { subject: draft.subject.trim(), bodyText };
}

async function composeWithModel(input: ComposePupdateInput): Promise<ComposedPupdate> {
  const regularUpdateGuidance = input.type === "regular"
    ? " Treat the volunteer notes as the update: lead with what happened lately, such as activities, fun, or new friends. Use the dog profile only as light background flavor; do not turn the email into a profile or biography."
    : "";
  const text = await createChatCompletion({
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content:
          `You write warm, short email updates in a dog rescue's voice. Use only facts in the supplied JSON; never invent details.${regularUpdateGuidance} Return only a JSON object with subject and bodyText strings.`,
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
  });

  const parsed = parseJsonObject(text);
  if (!isComposedPupdate(parsed)) {
    throw new Error("Chat completion returned an invalid pupdate draft");
  }

  return ensureRequiredContent(parsed, input);
}

/**
 * Draft a sponsor pupdate. With no API key, this uses a deterministic template
 * so local demos and tests never require network access.
 */
export async function composePupdate(input: ComposePupdateInput): Promise<ComposedPupdate> {
  const name = input.dog.name.trim();
  if (!name) throw new Error("dog.name is required");
  if (input.type !== "regular" && input.type !== "graduation") {
    throw new Error("type must be regular or graduation");
  }

  return hasChatCompletionCredentials() ? composeWithModel(input) : deterministicCompose(input);
}
