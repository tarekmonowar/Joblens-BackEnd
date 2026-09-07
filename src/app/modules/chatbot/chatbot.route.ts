import { Router } from "express";
import { chatbotControllers } from "./chatbot.controller";

const router = Router();

router.post("/chat", chatbotControllers.chat);

export const ChatbotRoutes = router;
