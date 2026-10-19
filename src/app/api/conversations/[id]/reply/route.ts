import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, getUserFromToken, isAdmin } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!isAdmin(user)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: user ? 403 : 401 },
    );
  }
  const { id } = await context.params;

  try {
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("message" in body) ||
      typeof body.message !== "string"
    ) {
      return NextResponse.json(
        { error: "A message is required" },
        { status: 400 },
      );
    }

    const content = body.message.trim();
    if (!content || content.length > 1000) {
      return NextResponse.json(
        { error: "Message must be between 1 and 1000 characters" },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, humanRequested: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (!conversation.humanRequested) {
      return NextResponse.json(
        { error: "This conversation is not awaiting human support" },
        { status: 409 },
      );
    }

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { role: "agent", content, conversationId: id },
      }),
      prisma.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      }),
    ]);
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    logger.error(
      { conversationId: id, err: error },
      "Failed to send support reply",
    );
    return NextResponse.json(
      { error: "Unable to send reply. Please try again." },
      { status: 500 },
    );
  }
}
