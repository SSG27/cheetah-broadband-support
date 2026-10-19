import { prisma } from "@/lib/prisma";
import { fallbackSupport } from "@/lib/fallback-support";
import { openAIReply, type ChatTurn } from "@/lib/ai-provider";
import { detectSupportIntent } from "@/lib/intents";
import { logger } from "@/lib/logger";

export async function sendMessage(conversationId: string, content: string) {
  const intent = detectSupportIntent(content);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new Error("Conversation not found");
  if (conversation.endedAt) throw new Error("Conversation has ended");
  const userMessage = await prisma.message.create({
    data: { role: "user", content, conversationId },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      updatedAt: new Date(),
      ...(conversation.title === "New conversation"
        ? { title: content.slice(0, 42) + (content.length > 42 ? "…" : "") }
        : {}),
    },
  });

  if (conversation.humanRequested) {
    logger.info(
      { conversationId },
      "Customer message forwarded to support agent",
    );
    return {
      userMessage,
      assistantMessage: null,
      source: "human" as const,
      humanEscalationRequested: false,
      intent,
    };
  }

  const recent = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const history: ChatTurn[] = recent.reverse().map((message) => ({
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
  }));

  let answer: string;
  let humanEscalationRequested = false;
  let source: "ai" | "fallback" = "fallback";
  if (process.env.OPENAI_API_KEY) {
    try {
      const reply = await openAIReply(history, {}, intent);
      answer = reply.answer;
      humanEscalationRequested = reply.humanEscalationRequested;
      source = "ai";
    } catch (error) {
      logger.warn(
        { err: error },
        "AI provider unavailable; using local support response",
      );
      answer = fallbackSupport(content);
    }
  } else {
    answer = fallbackSupport(content);
  }

  const assistantMessage = await prisma.message.create({
    data: { role: "assistant", content: answer, conversationId },
  });
  logger.info({ conversationId, source }, "Chat message handled");
  return {
    userMessage,
    assistantMessage,
    source,
    humanEscalationRequested,
    intent,
  };
}
