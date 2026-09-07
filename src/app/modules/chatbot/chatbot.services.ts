import { configService } from "../../config/appConfig.js";
import { websiteContext } from "./chatbot.prompt.js";

interface IMessage {
  role: "user" | "assistant";
  content: string;
}

const chat = async (messages: IMessage[]) => {
  const ai = configService.get("azureOpenAi");

  if (!ai.endpoint || !ai.apiKey || !ai.deployment) {
    throw new Error("Azure OpenAI is not configured");
  }

  const url = `${new URL(ai.endpoint).origin}/openai/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": ai.apiKey,
      "Authorization": `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify({
      model: ai.deployment,
      messages: [
        {
          role: "system",
          content: websiteContext,
        },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Azure OpenAI HTTP ${response.status}: ${body.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Azure OpenAI returned empty content");
  }

  return content;
};

export const ChatbotServices = {
  chat,
};
