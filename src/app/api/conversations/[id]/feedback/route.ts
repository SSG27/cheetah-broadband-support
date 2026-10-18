import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("rating" in body) ||
    typeof body.rating !== "number" ||
    !Number.isInteger(body.rating) ||
    body.rating < 1 ||
    body.rating > 5 ||
    ("comment" in body &&
      body.comment !== undefined &&
      typeof body.comment !== "string")
  ) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  const comment =
    "comment" in body && typeof body.comment === "string"
      ? body.comment.trim()
      : "";
  if (comment.length > 500) {
    return NextResponse.json(
      { error: "Feedback comments must be 500 characters or fewer" },
      { status: 400 },
    );
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
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
    if (conversation.messages.length === 0) {
      return NextResponse.json(
        { error: "Feedback is available after the assistant responds" },
        { status: 409 },
      );
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        feedbackRating: body.rating,
        feedbackComment: comment || null,
        feedbackSubmittedAt: new Date(),
      },
      select: {
        id: true,
        feedbackRating: true,
        feedbackComment: true,
        feedbackSubmittedAt: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[api/conversations/feedback] failed", { id, error });
    return NextResponse.json(
      { error: "Unable to save your feedback" },
      { status: 500 },
    );
  }
}
