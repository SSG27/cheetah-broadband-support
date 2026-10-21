import { prisma } from "@/lib/prisma";
import * as aiProvider from "@/lib/ai-provider";
import { apiFetcher } from "@/lib/api-fetcher";
import {
  getUserFromToken,
  hashPassword,
  isAdmin,
  isAdminEmail,
  signToken,
  verifyPassword,
  verifyToken,
} from "@/lib/auth";
import { sendMessage } from "@/lib/chat-service";
import { fallbackSupport } from "@/lib/fallback-support";
import {
  detectSupportIntent,
  intentGuidance,
  supportIntents,
} from "@/lib/intents";
import { cn } from "@/lib/utils";

let originalEnvironment: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnvironment = { ...process.env };
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = originalEnvironment;
});

describe("support intent detection", () => {
  it.each([
    ["Please speak to a person", "human_escalation"],
    ["I want to cancel my package", "cancellation_or_complaint"],
    ["There is a charge on my invoice", "billing"],
    ["My speed is slow", "slow_speed"],
    ["The internet is offline", "connection_issue"],
    ["The Wi-Fi signal is weak", "wifi_help"],
    ["I need to change my account", "account_support"],
    ["Can you help me?", "general_support"],
  ] as const)("classifies %s", (message, intent) => {
    expect(detectSupportIntent(message)).toBe(intent);
  });

  it("uses the first matching intent when a message matches several rules", () => {
    expect(
      detectSupportIntent("I want a human to cancel a billing dispute"),
    ).toBe("human_escalation");
  });

  it("keeps guidance defined for every supported intent", () => {
    expect(supportIntents).toHaveLength(8);
    for (const intent of supportIntents) {
      expect(intentGuidance[intent]).toEqual(expect.any(String));
      expect(intentGuidance[intent].length).toBeGreaterThan(0);
    }
  });
});

describe("local support responses", () => {
  it.each([
    ["My broadband is down", /router|restart|service status/i],
    ["My speed is slow", /speed|router/i],
    ["I have a billing question", /billing|invoice|payment/i],
    ["The Wi-Fi router is in the wrong room", /wi-fi|router/i],
    ["I need a human agent", /support specialist|0800/i],
    ["What does Cheetah offer?", /broadband|Wi-Fi|billing/i],
  ])("returns relevant guidance for %s", (message, expected) => {
    expect(fallbackSupport(message)).toMatch(expected);
  });
});

describe("API fetch helper", () => {
  it("returns parsed JSON for a successful response", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({ status: "ok" }));

    await expect(
      apiFetcher<{ status: string }>("/api/health"),
    ).resolves.toEqual({
      status: "ok",
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/health");
  });

  it("throws with the status when the response is not successful", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(apiFetcher("/api/health")).rejects.toThrow(
      "Request failed (503)",
    );
  });
});

describe("authentication helpers", () => {
  it("hashes passwords and verifies only the matching password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toBe("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", hash),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("signs and verifies a user token, and rejects a malformed token", () => {
    const token = signToken("user-123");

    expect(verifyToken(token)?.sub).toBe("user-123");
    expect(verifyToken("not-a-jwt")).toBeNull();
  });

  it("returns null when no token is supplied or the referenced user is missing", async () => {
    const findUser = jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValue(null as never);

    await expect(getUserFromToken()).resolves.toBeNull();
    await expect(
      getUserFromToken(signToken("missing-user")),
    ).resolves.toBeNull();
    expect(findUser).toHaveBeenCalledTimes(1);
  });

  it("loads the user and resolves admin access from either role or configured email", async () => {
    process.env.ADMIN_EMAILS = "support@example.com, ops@example.com";
    const findUser = jest.spyOn(prisma.user, "findUnique");
    findUser.mockResolvedValueOnce({
      id: "admin-id",
      email: "admin@example.com",
      role: "ADMIN",
    } as never);
    findUser.mockResolvedValueOnce({
      id: "support-id",
      email: "SUPPORT@example.com",
      role: "USER",
    } as never);

    const roleAdmin = await getUserFromToken(signToken("admin-id"));
    const emailAdmin = await getUserFromToken(signToken("support-id"));

    expect(roleAdmin?.role).toBe("ADMIN");
    expect(emailAdmin?.role).toBe("ADMIN");
    expect(isAdmin(roleAdmin)).toBe(true);
    expect(isAdmin({ role: "USER" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("matches admin emails case-insensitively and ignores empty entries", () => {
    process.env.ADMIN_EMAILS = " , Admin@Example.com ,, ops@example.com ";

    expect(isAdminEmail("ADMIN@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
  });

  it("keeps a non-admin user in the regular role", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: "customer-id",
      email: "customer@example.com",
      role: "USER",
    } as never);

    await expect(
      getUserFromToken(signToken("customer-id")),
    ).resolves.toMatchObject({
      role: "USER",
    });
  });
});

describe("shared class name helper", () => {
  it("combines conditional class inputs", () => {
    expect(cn("alpha", false, "beta")).toContain("alpha");
    expect(cn("alpha", false, "beta")).toContain("beta");
  });
});

describe("chat service", () => {
  const conversation = {
    id: "conversation-1",
    title: "New conversation",
    endedAt: null,
    humanRequested: false,
  };
  const userMessage = {
    id: "message-user",
    role: "user",
    content: "My Wi-Fi is slow",
    conversationId: conversation.id,
  };
  const assistantMessage = {
    id: "message-assistant",
    role: "assistant",
    content: "Try checking the router position.",
    conversationId: conversation.id,
  };

  it("persists the customer message and local response and emits fallback text", async () => {
    process.env.OPENAI_API_KEY = "";
    jest
      .spyOn(prisma.conversation, "findUnique")
      .mockResolvedValue(conversation as never);
    jest
      .spyOn(prisma.message, "create")
      .mockResolvedValueOnce(userMessage as never)
      .mockResolvedValueOnce(assistantMessage as never);
    const updateConversation = jest
      .spyOn(prisma.conversation, "update")
      .mockResolvedValue({
        ...conversation,
        title: "My Wi-Fi is slow",
      } as never);
    jest
      .spyOn(prisma.message, "findMany")
      .mockResolvedValue([userMessage] as never);
    const tokens: string[] = [];

    const result = await sendMessage(
      conversation.id,
      "My Wi-Fi is slow",
      (token) => tokens.push(token),
    );

    expect(result.source).toBe("fallback");
    expect(result.intent).toBe("slow_speed");
    expect(result.assistantMessage).toEqual(assistantMessage);
    expect(tokens.join("")).toMatch(/speed|router|Wi-Fi/i);
    expect(updateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "My Wi-Fi is slow" }),
      }),
    );
  });

  it("preserves existing titles and skips the AI when human support was requested", async () => {
    process.env.OPENAI_API_KEY = "configured-key";
    jest.spyOn(prisma.conversation, "findUnique").mockResolvedValue({
      ...conversation,
      title: "Existing title",
      humanRequested: true,
    } as never);
    jest
      .spyOn(prisma.message, "create")
      .mockResolvedValue(userMessage as never);
    const updateConversation = jest
      .spyOn(prisma.conversation, "update")
      .mockResolvedValue(conversation as never);
    const findRecent = jest.spyOn(prisma.message, "findMany");

    const result = await sendMessage(conversation.id, "Please help");

    expect(result).toMatchObject({
      source: "human",
      assistantMessage: null,
      humanEscalationRequested: false,
    });
    expect(updateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ data: { updatedAt: expect.any(Date) } }),
    );
    expect(findRecent).not.toHaveBeenCalled();
  });

  it("uses AI replies and returns escalation signals", async () => {
    process.env.OPENAI_API_KEY = "configured-key";
    jest
      .spyOn(prisma.conversation, "findUnique")
      .mockResolvedValue(conversation as never);
    jest
      .spyOn(prisma.message, "create")
      .mockResolvedValueOnce(userMessage as never)
      .mockResolvedValueOnce(assistantMessage as never);
    jest
      .spyOn(prisma.conversation, "update")
      .mockResolvedValue(conversation as never);
    jest
      .spyOn(prisma.message, "findMany")
      .mockResolvedValue([userMessage] as never);
    const aiReply = jest.spyOn(aiProvider, "openAIReply").mockResolvedValue({
      answer: "I can connect you to support.",
      humanEscalationRequested: true,
    });
    const tokens: string[] = [];

    const result = await sendMessage(
      conversation.id,
      "I need an agent",
      (token) => tokens.push(token),
    );

    expect(aiReply).toHaveBeenCalledWith(
      [{ role: "user", content: "My Wi-Fi is slow" }],
      {},
      "human_escalation",
      expect.any(Function),
    );
    expect(tokens).toEqual([]);
    expect(result).toMatchObject({
      source: "ai",
      humanEscalationRequested: true,
    });
  });

  it("replaces a failed streamed AI response with fallback guidance", async () => {
    process.env.OPENAI_API_KEY = "configured-key";
    jest
      .spyOn(prisma.conversation, "findUnique")
      .mockResolvedValue(conversation as never);
    jest
      .spyOn(prisma.message, "create")
      .mockResolvedValueOnce(userMessage as never)
      .mockResolvedValueOnce(assistantMessage as never);
    jest
      .spyOn(prisma.conversation, "update")
      .mockResolvedValue(conversation as never);
    jest
      .spyOn(prisma.message, "findMany")
      .mockResolvedValue([userMessage] as never);
    jest
      .spyOn(aiProvider, "openAIReply")
      .mockImplementation(async (_history, _options, _intent, onToken) => {
        onToken?.("Partial text");
        throw new Error("provider unavailable");
      });
    const events: string[] = [];

    const result = await sendMessage(
      conversation.id,
      "My internet is down",
      (token) => events.push(`token:${token}`),
      (text) => events.push(`replace:${text}`),
    );

    expect(result.source).toBe("fallback");
    expect(events[0]).toBe("token:Partial text");
    expect(events[1]).toMatch(/^replace:/);
    expect(events).toHaveLength(2);
  });

  it("rejects missing and ended conversations before creating a message", async () => {
    const lookup = jest.spyOn(prisma.conversation, "findUnique");
    const createMessage = jest.spyOn(prisma.message, "create");
    lookup.mockResolvedValueOnce(null as never);
    lookup.mockResolvedValueOnce({
      ...conversation,
      endedAt: new Date(),
    } as never);

    await expect(sendMessage(conversation.id, "Hello")).rejects.toThrow(
      "Conversation not found",
    );
    await expect(sendMessage(conversation.id, "Hello")).rejects.toThrow(
      "Conversation has ended",
    );
    expect(createMessage).not.toHaveBeenCalled();
  });
});

describe("AI provider adapter", () => {
  const baseHistory = [{ role: "user" as const, content: "My Wi-Fi is slow" }];

  it("requires an API key and normalizes a configured endpoint", async () => {
    await expect(
      aiProvider.openAIReply(baseHistory, { apiKey: "" }),
    ).rejects.toThrow("AI provider is not configured");

    const fetcher: typeof fetch = async (input) => {
      expect(String(input)).toBe(
        "https://provider.example/v1/chat/completions",
      );
      return Response.json({
        choices: [{ message: { content: "Provider response" } }],
      });
    };
    await expect(
      aiProvider.openAIReply(baseHistory, {
        apiKey: "test-key",
        apiEndpoint: "https://provider.example/v1/",
        fetcher,
      }),
    ).resolves.toMatchObject({ answer: "Provider response" });
  });

  it("streams assistant tokens", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        [
          'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
          "data: [DONE]",
          "",
        ].join("\n\n"),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    const tokens: string[] = [];

    const result = await aiProvider.openAIReply(
      baseHistory,
      { apiKey: "test-key", fetcher },
      "wifi_help",
      (token) => tokens.push(token),
    );

    expect(result).toEqual({
      answer: "Hello",
      humanEscalationRequested: false,
    });
    expect(tokens).toEqual(["Hello"]);
  });

  it("follows a streamed handoff tool call with a customer acknowledgement", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          [
            'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"request_human_support","arguments":"{\\"reason\\":\\"account support\\"}"}}]},"finish_reason":null}]}',
            "data: [DONE]",
            "",
          ].join("\n\n"),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return new Response(
        [
          'data: {"id":"chunk-2","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"content":"A specialist can help."},"finish_reason":null}]}',
          "data: [DONE]",
          "",
        ].join("\n\n"),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
    const tokens: string[] = [];

    const result = await aiProvider.openAIReply(
      baseHistory,
      { apiKey: "test-key", fetcher },
      "account_support",
      (token) => tokens.push(token),
    );

    expect(result).toEqual({
      answer: "A specialist can help.",
      humanEscalationRequested: true,
    });
    expect(calls).toBe(2);
    expect(tokens).toEqual(["A specialist can help."]);
  });

  it("uses the built-in streamed acknowledgement if the follow-up is empty", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      const data =
        calls === 1
          ? 'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"request_human_support","arguments":"{}"}}]},"finish_reason":null}]}\n\n'
          : 'data: {"id":"chunk-2","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[]}\n\n';
      return new Response(`${data}data: [DONE]\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      });
    };
    const tokens: string[] = [];

    const result = await aiProvider.openAIReply(
      baseHistory,
      { apiKey: "test-key", fetcher },
      "human_escalation",
      (token) => tokens.push(token),
    );

    expect(result).toEqual({
      answer: "I’ve passed your request to our support team.",
      humanEscalationRequested: true,
    });
    expect(tokens).toEqual(["I’ve passed your request to our support team."]);
  });

  it("handles non-streaming tool calls and obtains an acknowledgement", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls += 1;
      return Response.json(
        calls === 1
          ? {
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call-1",
                        type: "function",
                        function: {
                          name: "request_human_support",
                          arguments: '{"reason":"billing"}',
                        },
                      },
                    ],
                  },
                },
              ],
            }
          : { choices: [{ message: { content: "I will pass this on." } }] },
      );
    };

    const result = await aiProvider.openAIReply(baseHistory, {
      apiKey: "test-key",
      fetcher,
    });

    expect(result).toEqual({
      answer: "I will pass this on.",
      humanEscalationRequested: true,
    });
    expect(calls).toBe(2);
  });

  it("rejects empty or unexpected non-streaming provider responses", async () => {
    const noChoices: typeof fetch = async () => Response.json({});
    await expect(
      aiProvider.openAIReply(baseHistory, {
        apiKey: "test-key",
        fetcher: noChoices,
      }),
    ).rejects.toThrow(/unexpected chat completion response/);

    const emptyAnswer: typeof fetch = async () =>
      Response.json({ choices: [{ message: { content: "  " } }] });
    await expect(
      aiProvider.openAIReply(baseHistory, {
        apiKey: "test-key",
        fetcher: emptyAnswer,
      }),
    ).rejects.toThrow("AI provider returned an empty response");
  });

  it("checks provider configuration and connectivity", async () => {
    await expect(aiProvider.checkAIConnection({ apiKey: "" })).rejects.toThrow(
      "OPENAI_API_KEY is not configured",
    );
    const fetcher: typeof fetch = async (input) => {
      expect(String(input)).toBe("https://api.openai.com/v1/models");
      return Response.json({ data: [] });
    };
    await expect(
      aiProvider.checkAIConnection({ apiKey: "test-key", fetcher }),
    ).resolves.toBe(true);
  });
});
