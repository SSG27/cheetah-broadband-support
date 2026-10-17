import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: [{ humanRequested: "desc" }, { updatedAt: "desc" }],
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(conversations);
  } catch (error) {
    logger.error({ err: error }, "Failed to load conversations");
    return NextResponse.json(
      { error: "Unable to load conversations" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const conversation = await prisma.conversation.create({
      data: {},
      include: { messages: true },
    });
    logger.info({ conversationId: conversation.id }, "Conversation created");
    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Failed to create conversation");
    return NextResponse.json(
      { error: "Unable to create conversation" },
      { status: 500 },
    );
  }
}
