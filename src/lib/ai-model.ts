import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
  return Boolean((apiKey ?? process.env.OPENAI_API_KEY)?.trim());
}

export function createAiModel(options: AiModelOptions = {}) {
  const apiKey = requiredSetting(options.apiKey ?? process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const baseURL = requiredSetting(
    options.baseUrl ?? process.env.OPENAI_BASE_URL,
    "OPENAI_BASE_URL",
  ).replace(/\/+$/u, "");
  const model = requiredSetting(options.model ?? process.env.OPENAI_MODEL, "OPENAI_MODEL");

  return createOpenAICompatible({
    name: "dogathon",
    apiKey,
    baseURL,
    fetch: options.fetch,
    supportsStructuredOutputs: true,
  }).chatModel(model);
}
