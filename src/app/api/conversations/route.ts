import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: [{ humanRequested: "desc" }, { updatedAt: "desc" }],
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(conversations);
  } catch (error) {
    console.error("[api/conversations] failed to load", error);
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
    console.info("[api/conversations] created", {
      conversationId: conversation.id,
    });
    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error("[api/conversations] failed to create", error);
    return NextResponse.json(
      { error: "Unable to create conversation" },
      { status: 500 },
    );
  }
}
