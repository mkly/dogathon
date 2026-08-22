export type PupdateType = "regular" | "graduation";

export interface PupdateDog {
  name: string;
  [key: string]: unknown;
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
  smsText: string;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_SMS_LENGTH = 299;

function cleanNotes(notes: PupdateNote[]): string[] {
  return notes
    .map((note) => (typeof note === "string" ? note : note.note))
    .map((note) => note.trim())
    .filter(Boolean);
}

function removeTrailingPunctuation(text: string): string {
  return text.replace(/[.!?]+$/u, "").trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);

  const shortened = text.slice(0, maxLength - 1).trimEnd();
  const lastSpace = shortened.lastIndexOf(" ");
  const boundary = lastSpace > maxLength / 2 ? lastSpace : shortened.length;
  return `${shortened.slice(0, boundary).trimEnd()}…`;
}

function buildSms(input: ComposePupdateInput, notes: string[]): string {
  const name = input.dog.name.trim();
  const link = input.dogPageUrl.trim() || "{{dogPageUrl}}";
  const secondSentence =
    input.type === "graduation"
      ? `You helped get ${name} there.`
      : `Thank you for supporting ${name}.`;
  const firstPrefix =
    input.type === "graduation"
      ? `${name} was adopted today`
      : `${name} update: `;
  const firstContent =
    input.type === "graduation" ? "" : removeTrailingPunctuation(notes[0] ?? "A new pupdate is ready");
  const fixedLength = firstPrefix.length + secondSentence.length + link.length + 4;
  const availableContent = Math.max(0, MAX_SMS_LENGTH - fixedLength);
  const firstSentence = `${firstPrefix}${truncate(firstContent, availableContent)}.`;

  return `${firstSentence} ${secondSentence} ${link}`;
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
    smsText: buildSms(input, notes),
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
    typeof candidate.bodyText === "string" &&
    typeof candidate.smsText === "string"
  );
}

function ensureRequiredContent(
  draft: ComposedPupdate,
  input: ComposePupdateInput,
): ComposedPupdate {
  const postscript = input.pinnedPostscript.trim();
  const link = input.dogPageUrl.trim() || "{{dogPageUrl}}";
  const bodyText = postscript && !draft.bodyText.includes(postscript)
    ? `${draft.bodyText.trim()}\n\n${postscript}`
    : draft.bodyText.trim();

  let smsText = draft.smsText.trim();
  if (!smsText.includes(link)) smsText = `${smsText} ${link}`;
  if (smsText.length > MAX_SMS_LENGTH) {
    const roomForBody = Math.max(0, MAX_SMS_LENGTH - link.length - 1);
    smsText = `${truncate(smsText.replace(link, "").trim(), roomForBody)} ${link}`;
  }

  return { subject: draft.subject.trim(), bodyText, smsText };
}

async function composeWithAnthropic(
  input: ComposePupdateInput,
  apiKey: string,
): Promise<ComposedPupdate> {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      system:
        "You write warm, short updates in a dog rescue's voice. Use only facts in the supplied JSON; never invent details. Return only a JSON object with subject, bodyText, and smsText strings. The SMS must be under 300 characters, use two short sentences, and include dogPageUrl.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });

  const payload = (await response.json()) as AnthropicResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Anthropic request failed (${response.status})`);
  }

  const text = payload.content
    ?.filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
  if (!text) throw new Error("Anthropic returned no text content");

  const parsed = parseJsonObject(text);
  if (!isComposedPupdate(parsed)) {
    throw new Error("Anthropic returned an invalid pupdate draft");
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

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  return apiKey ? composeWithAnthropic(input, apiKey) : deterministicCompose(input);
}
