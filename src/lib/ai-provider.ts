import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions/completions";

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
  onToken?: (token: string) => void,
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
  const request = {
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
  } satisfies ChatCompletionCreateParamsNonStreaming;
  if (onToken) {
    const stream = await client.chat.completions.create({
      ...request,
      stream: true,
    });
    let answer = "";
    let humanEscalationRequested = false;
    const toolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const token = choice?.delta?.content;
      if (typeof token === "string" && token) {
        answer += token;
        onToken(token);
      }
      for (const call of choice?.delta?.tool_calls ?? []) {
        const accumulated = toolCalls.get(call.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        accumulated.id += call.id ?? "";
        accumulated.name += call.function?.name ?? "";
        accumulated.arguments += call.function?.arguments ?? "";
        toolCalls.set(call.index, accumulated);
      }
    }
    answer = answer.trim();
    const requestedCalls = [...toolCalls.values()].filter(
      (call) => call.name === "request_human_support" && call.id,
    );
    humanEscalationRequested = requestedCalls.length > 0;
    if (!answer && humanEscalationRequested) {
      const messages = [
        ...request.messages,
        {
          role: "assistant" as const,
          content: null,
          tool_calls: requestedCalls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: {
              name: call.name,
              arguments: call.arguments || "{}",
            },
          })),
        },
        ...requestedCalls.map((call) => ({
          role: "tool" as const,
          tool_call_id: call.id,
          content:
            "The request for a human support specialist has been accepted. Write a concise, natural acknowledgement for the customer. Do not claim a specialist has already replied.",
        })),
      ];
      try {
        const followUp = await client.chat.completions.create({
          ...request,
          messages,
          tools: [],
          tool_choice: "none",
          stream: true,
        });
        for await (const chunk of followUp) {
          const token = chunk.choices[0]?.delta?.content;
          if (typeof token === "string" && token) {
            answer += token;
            onToken(token);
          }
        }
        answer = answer.trim();
      } catch {
        // Keep the handoff working even if the follow-up wording request fails.
      }
      if (!answer) {
        answer = "I’ve passed your request to our support team.";
        onToken(answer);
      }
    }
    if (!answer) throw new Error("AI provider returned an empty response");
    return { answer, humanEscalationRequested };
  }

  const response = await client.chat.completions.create(request);
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
  let answer = message?.content?.trim() ?? "";
  if (!answer && humanEscalationRequested && message?.tool_calls) {
    const requestedCalls = message.tool_calls.filter(
      (call) =>
        call.type === "function" &&
        call.function.name === "request_human_support",
    );
    try {
      const followUp = await client.chat.completions.create({
        ...request,
        messages: [
          ...request.messages,
          {
            role: "assistant",
            content: null,
            tool_calls: requestedCalls,
          },
          ...requestedCalls.map((call) => ({
            role: "tool" as const,
            tool_call_id: call.id,
            content:
              "The request for a human support specialist has been accepted. Write a concise, natural acknowledgement for the customer. Do not claim a specialist has already replied.",
          })),
        ],
        tools: [],
        tool_choice: "none",
      });
      answer = followUp.choices[0]?.message?.content?.trim() ?? "";
    } catch {
      // Keep the handoff working even if the follow-up wording request fails.
    }
    if (!answer) answer = "I’ve passed your request to our support team.";
  }
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
