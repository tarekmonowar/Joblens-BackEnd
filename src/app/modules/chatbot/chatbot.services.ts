import { configService } from "../../config/appConfig.js";
import { websiteContext } from "./chatbot.prompt.js";

interface IMessage {
  role: "user" | "assistant";
  content: string;
}

const HISTORY_LIMIT = 8;
const MAX_COMPLETION_TOKENS = 900;

type AzureStreamChunk = {
  choices?: {
    delta?: { content?: string | null };
    message?: { content?: string | null };
  }[];
};

const recentMessages = (messages: IMessage[] | undefined): IMessage[] => {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((item) => item?.role === "user" || item?.role === "assistant")
    .map((item) => ({
      role: item.role,
      content: typeof item.content === "string" ? item.content.trim() : "",
    }))
    .filter((item) => item.content.length > 0)
    .slice(-HISTORY_LIMIT);
};

const contentFromSseLine = (line: string): string => {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "[DONE]") return "";

  const payload = trimmed.startsWith("data:")
    ? trimmed.slice(5).trim()
    : trimmed;
  if (!payload || payload === "[DONE]") return "";

  try {
    const json = JSON.parse(payload) as AzureStreamChunk;
    return (
      json.choices?.[0]?.delta?.content ??
      json.choices?.[0]?.message?.content ??
      ""
    );
  } catch {
    return "";
  }
};

async function* iterateAzureSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    leftover += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const lines = leftover.split(/\r?\n/);
    leftover = done ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      if (line.includes("[DONE]")) return;
      const piece = contentFromSseLine(line);
      if (piece) yield piece;
    }

    if (done) break;
  }
}

async function* streamChat(
  messages: IMessage[] | undefined,
): AsyncGenerator<string> {
  const ai = configService.get("azureOpenAi");

  if (!ai.endpoint || !ai.apiKey || !ai.deployment) {
    throw new Error("Azure OpenAI is not configured");
  }

  const url = `${new URL(ai.endpoint).origin}/openai/v1/chat/completions`;
  const history = [
    {
      role: "system" as const,
      content: websiteContext,
    },
    ...recentMessages(messages),
  ];

  const payloads: Record<string, unknown>[] = [
    {
      model: ai.deployment,
      stream: true,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: "low",
      messages: history,
    },
    {
      model: ai.deployment,
      stream: true,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages: history,
    },
    {
      model: ai.deployment,
      stream: true,
      messages: history,
    },
  ];

  let response: Response | undefined;
  let lastError = "";

  for (const payload of payloads) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": ai.apiKey,
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) break;

    lastError = await response.text();
    if (response.status !== 400) {
      throw new Error(
        `Azure OpenAI HTTP ${response.status}: ${lastError.slice(0, 200)}`,
      );
    }
  }

  if (!response?.ok) {
    throw new Error(
      `Azure OpenAI HTTP ${response?.status ?? 500}: ${lastError.slice(0, 200)}`,
    );
  }

  if (!response.body) {
    throw new Error("Azure OpenAI returned an empty stream");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as AzureStreamChunk & {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Azure OpenAI returned empty content");
    }
    yield content;
    return;
  }

  let sawContent = false;
  for await (const piece of iterateAzureSse(response.body)) {
    sawContent = true;
    yield piece;
  }

  if (!sawContent) {
    throw new Error("Azure OpenAI returned empty content");
  }
}

export const ChatbotServices = {
  streamChat,
};
