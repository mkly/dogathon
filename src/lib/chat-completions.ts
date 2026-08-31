export type ChatCompletionToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatCompletionMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatCompletionToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ChatCompletionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletionOptions = {
  messages: ChatCompletionMessage[];
  maxTokens: number;
  tools?: ChatCompletionTool[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatCompletionToolCall[] } }>;
  error?: { message?: string };
};

export type ChatCompletionAssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ChatCompletionToolCall[];
};

function requiredSetting(value: string | undefined, name: string): string {
  const setting = value?.trim();
  if (!setting) throw new Error(`${name} is required to reach the chat-completions endpoint`);
  return setting;
}

export function hasChatCompletionCredentials(apiKey?: string): boolean {
  return Boolean((apiKey ?? process.env.OPENAI_API_KEY)?.trim());
}

async function requestChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionAssistantMessage> {
  const apiKey = requiredSetting(options.apiKey ?? process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const baseUrl = requiredSetting(options.baseUrl ?? process.env.OPENAI_BASE_URL, "OPENAI_BASE_URL");
  const model = requiredSetting(options.model ?? process.env.OPENAI_MODEL, "OPENAI_MODEL");
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(`${baseUrl.replace(/\/+$/u, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens,
      messages: options.messages,
      ...(options.tools ? { tools: options.tools, tool_choice: "auto" } : {}),
    }),
  });

  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Chat completion request failed (${response.status})`);
  }

  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("Chat completion response contained no message");
  const content = message.content?.trim() || null;
  if (!content && !message.tool_calls?.length) {
    throw new Error("Chat completion response contained no text or tool calls");
  }
  return { role: "assistant", content, tool_calls: message.tool_calls };
}

export async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const message = await requestChatCompletion(options);
  if (!message.content) throw new Error("Chat completion response contained no text");
  return message.content;
}

export function createToolCallingChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionAssistantMessage> {
  return requestChatCompletion(options);
}
