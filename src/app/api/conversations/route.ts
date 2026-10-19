import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getUserFromToken, COOKIE_NAME, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const user = await getUserFromToken(token);

    const where = isAdmin(user) ? {} : { userId: user?.id ?? null };

    const conversations = await prisma.conversation.findMany({
      where,
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

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const user = await getUserFromToken(token);

    const conversation = await prisma.conversation.create({
      data: { ...(user ? { userId: user.id } : {}) },
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
