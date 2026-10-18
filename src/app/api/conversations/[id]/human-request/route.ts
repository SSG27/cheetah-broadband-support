import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, getUserFromToken } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const user = await getUserFromToken(token);

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    if (user && conversation.userId && conversation.userId !== user.id) {
      return NextResponse.json(
        { error: "You can only request support for your own conversations" },
        { status: 403 },
      );
    }

    if (!user && conversation.userId) {
      return NextResponse.json(
        { error: "You can only request support for your own conversations" },
        { status: 403 },
      );
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id },
      data: { humanRequested: true },
      select: { id: true, humanRequested: true, updatedAt: true },
    });
    return NextResponse.json(updatedConversation);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "PrismaClientKnownRequestError"
    ) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    logger.error(
      { conversationId: id, err: error },
      "Failed to request a support agent",
    );
    return NextResponse.json(
      { error: "Unable to request a support agent" },
      { status: 500 },
    );
  }
}
