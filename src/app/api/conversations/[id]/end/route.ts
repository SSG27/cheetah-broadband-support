import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        endedAt: true,
        messages: {
          where: { role: "assistant" },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (!conversation.endedAt && conversation.messages.length === 0) {
      return NextResponse.json(
        { error: "A conversation can end after the assistant responds" },
        { status: 409 },
      );
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { endedAt: conversation.endedAt ?? new Date() },
      select: { id: true, endedAt: true, updatedAt: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[api/conversations/end] failed", { id, error });
    return NextResponse.json(
      { error: "Unable to end this conversation" },
      { status: 500 },
    );
  }
}
