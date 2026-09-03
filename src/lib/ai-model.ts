import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { env } from "./env.ts";

export type AiModelOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
};

function requiredSetting(value: string | undefined, name: string): string {
  const setting = value?.trim();
  if (!setting) throw new Error(`${name} is required to reach the chat-completions endpoint`);
  return setting;
}

export function hasAiCredentials(apiKey?: string): boolean {
  return Boolean((apiKey ?? env.OPENAI_API_KEY)?.trim());
}

export function createAiModel(options: AiModelOptions = {}) {
  const apiKey = requiredSetting(options.apiKey ?? env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const baseURL = requiredSetting(
    options.baseUrl ?? env.OPENAI_BASE_URL,
    "OPENAI_BASE_URL",
  );
  const model = requiredSetting(options.model ?? env.OPENAI_MODEL, "OPENAI_MODEL");

  return createOpenAICompatible({
    name: "dogathon",
    apiKey,
    baseURL,
    fetch: options.fetch,
    supportsStructuredOutputs: true,
  }).chatModel(model);
}
