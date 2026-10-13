import { NextResponse } from "next/server";
import { OpenAIProvider } from "@/lib/ai-provider";

export async function GET() {
  try {
    await new OpenAIProvider().checkConnection();
    return NextResponse.json({ status: "connected", provider: "OpenAI" });
  } catch (error) {
    console.error("[api/integrations/openai] connection check failed", error);
    return NextResponse.json(
      { status: "unavailable", message: error instanceof Error ? error.message : "Connection failed" },
      { status: 503 },
    );
  }
}
