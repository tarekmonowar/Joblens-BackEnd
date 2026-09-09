import { catchAsync } from "../../utils/catchAsync.js";
import { ChatbotServices } from "./chatbot.services.js";

const chat = catchAsync(async (req, res) => {
  const stream = ChatbotServices.streamChat(req.body.messages);
  const first = await stream.next();

  if (first.done && !first.value) {
    throw new Error("Azure OpenAI returned empty content");
  }

  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  if (first.value) {
    res.write(first.value);
  }

  try {
    for await (const chunk of stream) {
      res.write(chunk);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

export const chatbotControllers = {
  chat,
};
