import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../../src/lib/prisma";
import { sendMessage } from "../../src/lib/chat-service";
import {
  AIProviderOptions,
  ChatTurn,
  checkAIConnection,
  openAIReply,
} from "../../src/lib/ai-provider";

before(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

after(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.$disconnect();
});

test("chat service persists a customer and support reply through Prisma", async () => {
  const conversation = await prisma.conversation.create({ data: {} });
  const result = await sendMessage(conversation.id, "My Wi-Fi is slow");

  assert.equal(result.userMessage.content, "My Wi-Fi is slow");
  assert.equal(result.assistantMessage.role, "assistant");
  assert.match(result.assistantMessage.content, /speed|router|Wi-Fi/i);
  assert.equal(result.source, "fallback");

  const stored = await prisma.message.findMany({
    where: { conversationId: conversation.id },
  });
  assert.equal(stored.length, 2);
});

test("AI integration sends authenticated requests and parses provider replies", async () => {
  let target = "";
  let authorization = "";
  const fakeFetch: typeof fetch = async (input, init) => {
    target = String(input);
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "Try restarting your router." } }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  const history: ChatTurn[] = [{ role: "user", content: "My Wi-Fi is slow" }];
  const options: AIProviderOptions = {
    apiKey: "test-key",
    model: "test-model",
    fetcher: fakeFetch,
  };

  const reply = await openAIReply(history, options);
  assert.equal(reply, "Try restarting your router.");
  assert.equal(target, "https://api.openai.com/v1/chat/completions");
  assert.equal(authorization, "Bearer test-key");
});

test(
  "configured credentials can reach the real OpenAI models endpoint",
  {
    skip: !process.env.OPENAI_API_KEY
      ? "Set OPENAI_API_KEY to run the live third-party connection check"
      : false,
  },
  async () => {
    assert.equal(await checkAIConnection(), true);
  },
);
