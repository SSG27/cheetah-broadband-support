import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { prisma } from "../../src/lib/prisma";
import { ChatService } from "../../src/lib/chat-service";
import { FallbackSupport } from "../../src/lib/fallback-support";
import { OpenAIProvider } from "../../src/lib/ai-provider";

describe("FallbackSupport", () => {
  it("returns Wi-Fi troubleshooting advice for slow internet", () => {
    const reply = new FallbackSupport().reply("My Wi-Fi is slow");

    expect(reply.toLowerCase()).toMatch(/speed|router|wi-fi|wifi/);
  });

  it("returns an outage response when the connection is down", () => {
    const reply = new FallbackSupport().reply("My internet is down");

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

    const result = await new ChatService().send(
      conversation.id,
      "My Wi-Fi is slow",
    );

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

    const provider = new OpenAIProvider(
      "test-key",
      "test-model",
      fakeFetch as typeof fetch,
    );

    const reply = await provider.reply([
      { role: "user", content: "My Wi-Fi is slow" },
    ]);

    expect(reply).toBe("Try restarting your router.");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(fakeFetch.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });
});
