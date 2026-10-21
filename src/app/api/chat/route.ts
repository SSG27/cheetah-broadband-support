import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/chat-service";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, getUserFromToken, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("conversationId" in body) ||
      typeof body.conversationId !== "string" ||
      !("message" in body) ||
      typeof body.message !== "string"
    ) {
      return NextResponse.json(
        { error: "A conversation and message are required" },
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

    const user = await getUserFromToken(
      request.cookies.get(COOKIE_NAME)?.value,
    );
    const conversation = await prisma.conversation.findUnique({
      where: { id: body.conversationId },
      select: { userId: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (
      (conversation.userId &&
        conversation.userId !== user?.id &&
        !isAdmin(user)) ||
      (!conversation.userId && user && !isAdmin(user))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const conversationId = body.conversationId;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const result = await sendMessage(
            conversationId,
            content,
            (text) => send({ type: "token", text }),
            (text) => send({ type: "replace", text }),
          );
          send({ type: "complete", result });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "Conversation not found"
          ) {
            send({ type: "error", error: error.message, status: 404 });
          } else if (
            error instanceof Error &&
            error.message === "Conversation has ended"
          ) {
            send({ type: "error", error: error.message, status: 409 });
          } else {
            logger.error({ err: error }, "Chat request failed");
            send({
              type: "error",
              error: "We couldn’t process that message. Please try again.",
              status: 500,
            });
          }
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Conversation not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Conversation has ended") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logger.error({ err: error }, "Chat request failed");
    return NextResponse.json(
      { error: "We couldn’t process that message. Please try again." },
      { status: 500 },
    );
  }
}
