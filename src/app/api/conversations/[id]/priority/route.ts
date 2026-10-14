import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const conversation = await prisma.conversation.update({
      where: { id },
      data: { humanRequested: false },
      select: { id: true, humanRequested: true, updatedAt: true },
    });
    return NextResponse.json(conversation);
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
    console.error("[api/conversations/priority] failed to clear priority", {
      id,
      error,
    });
    return NextResponse.json(
      { error: "Unable to clear conversation priority" },
      { status: 500 },
    );
  }
}
