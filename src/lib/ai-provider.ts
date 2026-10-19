import OpenAI from "openai";

import { intentGuidance, type SupportIntent } from "@/lib/intents";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type AIReply = { answer: string; humanEscalationRequested: boolean };

export type AIProviderOptions = {
  apiKey?: string;
  model?: string;
  apiEndpoint?: string;
  fetcher?: typeof fetch;
};

function getBaseURL(apiEndpoint: string): string {
  const normalizedEndpoint = apiEndpoint.replace(/\/$/, "");
  return normalizedEndpoint.endsWith("/v1")
    ? normalizedEndpoint
    : `${normalizedEndpoint}/v1`;
}

export async function openAIReply(
  history: ChatTurn[],
  options: AIProviderOptions = {},
  intent: SupportIntent = "general_support",
): Promise<AIReply> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const apiEndpoint =
    options.apiEndpoint ??
    process.env.OPENAI_API_ENDPOINT ??
    "https://api.openai.com";
  if (!apiKey) {
    throw new Error("AI provider is not configured");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: getBaseURL(apiEndpoint),
    fetch: options.fetcher,
    timeout: 20_000,
  });
  const response = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You are Cheetah, the friendly customer support assistant for Cheetah Broadband, a UK internet provider. Give clear, concise help about broadband, Wi-Fi, billing, outages and account support. The detected customer intent is "${intent}". Focus on this guidance: ${intentGuidance[intent]} Never claim to access or change a customer's account. Do not request passwords, full card numbers, or security codes. For account-specific or unresolved issues, offer escalation to a human support specialist.`,
      },
      ...history,
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "request_human_support",
          description:
            "Escalate this conversation to a human support specialist when the customer asks for one or the issue requires human account support.",
          parameters: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description: "Brief reason for the requested handoff.",
              },
            },
            required: ["reason"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: "auto",
  });
  if (!response.choices) {
    const fields = Object.keys(response).join(", ") || "none";
    throw new Error(
      `AI provider returned an unexpected chat completion response (fields: ${fields})`,
    );
  }
  const message = response.choices[0]?.message;
  const humanEscalationRequested =
    message?.tool_calls?.some(
      (call) =>
        call.type === "function" &&
        call.function.name === "request_human_support",
    ) ?? false;
  const answer =
    message?.content?.trim() ||
    (humanEscalationRequested
      ? "I’m connecting you with a human support specialist now."
      : "");
  if (!answer) throw new Error("AI provider returned an empty response");
  return { answer, humanEscalationRequested };
}

export async function checkAIConnection(
  options: AIProviderOptions = {},
): Promise<boolean> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const apiEndpoint =
    options.apiEndpoint ??
    process.env.OPENAI_API_ENDPOINT ??
    "https://api.openai.com";
  const client = new OpenAI({
    apiKey,
    baseURL: getBaseURL(apiEndpoint),
    fetch: options.fetcher,
    timeout: 10_000,
  });
  await client.models.list();
  return true;
}
