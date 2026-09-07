import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { ChatbotServices } from "./chatbot.services.js";

const chat = catchAsync(async (req, res) => {
  const result = await ChatbotServices.chat(req.body.messages);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    data: {
      message: result,
    },
  });
});

export const chatbotControllers = {
  chat,
};
