import { NextResponse } from "next/server";
import { checkAIConnection } from "@/lib/ai-provider";

export async function GET() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ status: "unconfigured", provider: "OpenAI" });
  }

  try {
    await checkAIConnection();
    return NextResponse.json({ status: "connected", provider: "OpenAI" });
  } catch (error) {
    console.error("[api/integrations/openai] connection check failed", error);
    return NextResponse.json(
      {
        status: "unavailable",
        message: error instanceof Error ? error.message : "Connection failed",
      },
      { status: 503 },
    );
  }
}
