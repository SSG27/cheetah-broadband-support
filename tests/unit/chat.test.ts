import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { prisma } from "../../src/lib/prisma";
import { fallbackSupport } from "../../src/lib/fallback-support";
import { sendMessage } from "../../src/lib/chat-service";
import { AIProviderOptions, openAIReply } from "../../src/lib/ai-provider";

describe("FallbackSupport", () => {
  it("returns Wi-Fi troubleshooting advice for slow internet", () => {
    const reply = fallbackSupport("My Wi-Fi is slow");

    expect(reply.toLowerCase()).toMatch(/speed|router|wi-fi|wifi/);
  });

  it("returns an outage response when the connection is down", () => {
    const reply = fallbackSupport("My internet is down");

    expect(reply.toLowerCase()).toMatch(/router|restart|offline|online/);
  });
});

describe("ChatService", () => {
  beforeEach(async () => {
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
  });

  it("stores the user message and assistant reply in the same conversation", async () => {
    const conversation = await prisma.conversation.create({ data: {} });

    const result = await sendMessage(conversation.id, "My Wi-Fi is slow");

    expect(result.userMessage.content).toBe("My Wi-Fi is slow");
    expect(result.assistantMessage.role).toBe("assistant");
    expect(result.source).toBe("fallback");

    const stored = await prisma.message.findMany({
      where: { conversationId: conversation.id },
    });

    expect(stored).toHaveLength(2);
  });
});

describe("OpenAIProvider", () => {
  it("sends a bearer token and parses the assistant response", async () => {
    const fakeFetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Try restarting your router." } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const options: AIProviderOptions = {
      apiKey: "test-key",
      model: "test-model",
      fetcher: fakeFetch as typeof fetch,
    };
    const reply = await openAIReply(
      [{ role: "user", content: "My Wi-Fi is slow" }],
      options,
    );

    expect(reply).toBe("Try restarting your router.");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(fakeFetch.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });
});
