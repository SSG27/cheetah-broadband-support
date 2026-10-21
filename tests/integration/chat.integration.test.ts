import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { sendMessage } from "../../src/lib/chat-service";
import { POST as submitFeedback } from "../../src/app/api/conversations/[id]/feedback/route";
import { POST as endConversation } from "../../src/app/api/conversations/[id]/end/route";
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
  assert.ok(result.assistantMessage);
  assert.equal(result.assistantMessage.role, "assistant");
  assert.match(result.assistantMessage.content, /speed|router|Wi-Fi/i);
  assert.equal(result.source, "fallback");

  const stored = await prisma.message.findMany({
    where: { conversationId: conversation.id },
  });
  assert.equal(stored.length, 2);
});

test("customers can submit feedback after an assistant reply", async () => {
  const conversation = await prisma.conversation.create({ data: {} });
  const makeRequest = (body: unknown) =>
    new NextRequest("http://localhost/api/conversations/feedback/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    });
  const context = { params: Promise.resolve({ id: conversation.id }) };

  const tooEarly = await submitFeedback(makeRequest({ rating: 5 }), context);
  assert.equal(tooEarly.status, 409);

  const invalidRating = await submitFeedback(
    makeRequest({ rating: 6 }),
    context,
  );
  assert.equal(invalidRating.status, 400);

  await sendMessage(conversation.id, "My Wi-Fi is slow");
  const response = await submitFeedback(
    makeRequest({ rating: 4, comment: "Thanks for the advice" }),
    context,
  );
  assert.equal(response.status, 200);

  const updated = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
  });
  assert.equal(updated.feedbackRating, 4);
  assert.equal(updated.feedbackComment, "Thanks for the advice");
  assert.ok(updated.feedbackSubmittedAt);
});

test("customers can end a conversation after the assistant responds", async () => {
  const conversation = await prisma.conversation.create({ data: {} });
  const context = { params: Promise.resolve({ id: conversation.id }) };
  const request = () =>
    new NextRequest(
      `http://localhost/api/conversations/${conversation.id}/end`,
      {
        method: "POST",
      },
    );

  const tooEarly = await endConversation(request(), context);
  assert.equal(tooEarly.status, 409);

  await sendMessage(conversation.id, "My Wi-Fi is slow");
  const response = await endConversation(request(), context);
  assert.equal(response.status, 200);
  const ended = await response.json();
  assert.ok(ended.endedAt);

  const repeatedEnd = await endConversation(request(), context);
  assert.equal(repeatedEnd.status, 200);
  assert.equal((await repeatedEnd.json()).endedAt, ended.endedAt);

  await assert.rejects(
    sendMessage(conversation.id, "I have another question"),
    { message: "Conversation has ended" },
  );
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
  assert.deepEqual(reply, {
    answer: "Try restarting your router.",
    humanEscalationRequested: false,
  });
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
