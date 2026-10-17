import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, getUserFromToken } from "@/lib/auth";

export async function DELETE(
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
        { error: "You can only delete your own conversations" },
        { status: 403 },
      );
    }

    if (!user && conversation.userId) {
      return NextResponse.json(
        { error: "You can only delete your own conversations" },
        { status: 403 },
      );
    }

    await prisma.conversation.delete({ where: { id } });
    return NextResponse.json({ id, deleted: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "PrismaClientKnownRequestError" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    logger.error(
      { conversationId: id, err: error },
      "Failed to delete conversation",
    );
    return NextResponse.json(
      { error: "Unable to delete conversation" },
      { status: 500 },
    );
  }
}
