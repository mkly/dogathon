import { generateText, Output } from "ai";
import { z } from "zod";

import { createAiModel, hasAiCredentials } from "./ai-model.ts";

export type SponsorUpdateType = "regular" | "graduation";

export interface SponsorUpdateCompanion {
  name: string;
  available: boolean;
  breed?: string;
  sex?: string;
  ageText?: string;
}

export type SponsorUpdateNote = string | { note: string; [key: string]: unknown };

export interface ComposeSponsorUpdateInput {
  companion: SponsorUpdateCompanion;
  notes: SponsorUpdateNote[];
  pinnedPostscript: string;
  type: SponsorUpdateType;
  companionPageUrl: string;
}

export interface ComposedSponsorUpdate {
  subject: string;
  bodyText: string;
}

const composedSponsorUpdateSchema = z.object({
  subject: z.string(),
  bodyText: z.string(),
});

function cleanNotes(notes: SponsorUpdateNote[]): string[] {
  return notes
    .map((note) => (typeof note === "string" ? note : note.note))
    .map((note) => note.trim())
    .filter(Boolean);
}

function deterministicCompose(input: ComposeSponsorUpdateInput): ComposedSponsorUpdate {
  const name = input.companion.name.trim();
  const notes = cleanNotes(input.notes);
  const intro =
    input.type === "graduation"
      ? `${name} has been adopted! You helped carry ${name} all the way home.`
      : `Here is the latest update from ${name}.`;
  const noteSection = notes.length > 0 ? `## Recent notes\n\n${notes.map((note) => `- ${note}`).join("\n")}` : "";
  const bodyText = appendPostscript([intro, noteSection].filter(Boolean).join("\n\n"), input.pinnedPostscript);

  return {
    subject: input.type === "graduation" ? `${name} found a home!` : `An update from ${name}`,
    bodyText,
  };
}

function appendPostscript(bodyText: string, postscript: string): string {
  if (!postscript) return bodyText.trim();
  const trimmedBody = bodyText.trim();
  return trimmedBody ? `${trimmedBody}\n\n${postscript}` : postscript;
}

function finalizeDraft(draft: ComposedSponsorUpdate, postscript: string): ComposedSponsorUpdate {
  return {
    subject: draft.subject.trim(),
    bodyText: appendPostscript(draft.bodyText, postscript),
  };
}

const MAX_SPONSOR_UPDATE_OUTPUT_TOKENS = 900;

async function composeWithModel(input: ComposeSponsorUpdateInput): Promise<ComposedSponsorUpdate> {
  const regularUpdateGuidance = input.type === "regular"
    ? " Treat the volunteer notes as the update: lead with what happened lately, such as activities, fun, or new friends. Use the companion profile only as light background flavor; do not turn the email into a profile or biography."
    : "";
  const { output } = await generateText({
    model: createAiModel(),
    maxOutputTokens: MAX_SPONSOR_UPDATE_OUTPUT_TOKENS,
    output: Output.object({ schema: composedSponsorUpdateSchema }),
    instructions:
      `You write warm, short email updates in an animal shelter's voice. Use only facts in the supplied JSON; never invent details.${regularUpdateGuidance} Format the notes section with the literal Markdown heading "## Recent notes".`,
    prompt: JSON.stringify({
      companion: input.companion,
      notes: input.notes,
      type: input.type,
      companionPageUrl: input.companionPageUrl,
    }),
  });

  return finalizeDraft(output, input.pinnedPostscript);
}

/**
 * Draft a sponsor update. With no API key, this uses a deterministic template
 * so local demos and tests never require network access.
 */
export async function composeSponsorUpdate(input: ComposeSponsorUpdateInput): Promise<ComposedSponsorUpdate> {
  const name = input.companion.name.trim();
  if (!name) throw new Error("companion.name is required");
  if (input.type !== "regular" && input.type !== "graduation") {
    throw new Error("type must be regular or graduation");
  }
  if (input.type === "regular" && !input.companion.available) {
    throw new Error("regular updates require an available companion");
  }

  return hasAiCredentials() ? composeWithModel(input) : deterministicCompose(input);
}
