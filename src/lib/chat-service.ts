import { prisma } from "@/lib/prisma";
import { fallbackSupport } from "@/lib/fallback-support";
import { openAIReply, type ChatTurn } from "@/lib/ai-provider";

export async function sendMessage(conversationId: string, content: string) {
    const conversation = await prisma.conversation.findUnique({where: { id: conversationId }});
    if (!conversation) throw new Error("Conversation not found")

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

    const recent = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const history: ChatTurn[] = recent.reverse().map((message) => ({
      role: message.role as ChatTurn["role"],
      content: message.content,
    }));

    let answer: string;
    let source: "ai" | "fallback" = "fallback";
    if (process.env.OPENAI_API_KEY) {
      try {
        answer = await openAIReply(history);
        source = "ai";
      } catch (error) {
        console.warn("[chat] AI provider unavailable; using local support response", error);
        answer = fallbackSupport(content);
      }
    } else {
      answer = fallbackSupport(content);
    }

    const assistantMessage = await prisma.message.create({
      data: { role: "assistant", content: answer, conversationId },
    });
    console.info("[chat] message handled", { conversationId, source });
    return { userMessage, assistantMessage, source };
}
