import { NextRequest } from "next/server";
import * as aiProvider from "@/lib/ai-provider";
import * as auth from "@/lib/auth";
import * as chatService from "@/lib/chat-service";
import { prisma } from "@/lib/prisma";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import {
  GET as getCurrentUser,
  PUT as updateCurrentUser,
} from "@/app/api/auth/user/route";
import { POST as postChat } from "@/app/api/chat/route";
import {
  GET as getConversations,
  POST as createConversation,
} from "@/app/api/conversations/route";
import { DELETE as deleteConversation } from "@/app/api/conversations/[id]/route";
import { POST as endConversation } from "@/app/api/conversations/[id]/end/route";
import { POST as submitFeedback } from "@/app/api/conversations/[id]/feedback/route";
import { POST as requestHumanSupport } from "@/app/api/conversations/[id]/human-request/route";
import { PATCH as clearPriority } from "@/app/api/conversations/[id]/priority/route";
import { POST as sendAgentReply } from "@/app/api/conversations/[id]/reply/route";
import { GET as healthCheck } from "@/app/api/health/route";
import { GET as openAIStatus } from "@/app/api/integrations/openai/route";

const id = "conversation-1";
const context = { params: Promise.resolve({ id }) };
const adminUser = {
  id: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
};
const regularUser = {
  id: "user-1",
  email: "user@example.com",
  role: "USER",
};

function makeRequest(
  path: string,
  method: string,
  body?: unknown,
  cookie?: string,
): NextRequest {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

function authAs(user: typeof adminUser | typeof regularUser | null) {
  return jest.spyOn(auth, "getUserFromToken").mockResolvedValue(user as never);
}

function findConversation(value: unknown) {
  return jest
    .spyOn(prisma.conversation, "findUnique")
    .mockResolvedValue(value as never);
}

function suppressConsoleErrors() {
  jest.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("authentication route handlers", () => {
  it("registers a regular account, hashes the password, and sets a session cookie", async () => {
    process.env.ADMIN_EMAILS = "staff@example.com";
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null as never);
    const create = jest.spyOn(prisma.user, "create").mockResolvedValue({
      id: "new-user",
      email: "customer@example.com",
      name: "Customer",
      role: "USER",
      password: "hash",
    } as never);

    const response = await register(
      makeRequest("/api/auth/register", "POST", {
        email: "customer@example.com",
        password: "secret",
        name: "Customer",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "new-user",
      role: "USER",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "customer@example.com",
          role: "USER",
          password: expect.not.stringMatching(/^secret$/),
        }),
      }),
    );
    expect(response.cookies.get(auth.COOKIE_NAME)?.value).toBeTruthy();
  });

  it("assigns configured admin email addresses the admin role", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null as never);
    const create = jest.spyOn(prisma.user, "create").mockResolvedValue({
      id: "admin-new",
      email: "ADMIN@example.com",
      name: null,
      role: "ADMIN",
      password: "hash",
    } as never);

    const response = await register(
      makeRequest("/api/auth/register", "POST", {
        email: "ADMIN@example.com",
        password: "secret",
      }),
    );

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "ADMIN" }),
      }),
    );
  });

  it.each([{}, { email: "a@example.com" }, { email: 1, password: "x" }])(
    "rejects invalid registration input %#",
    async (body: unknown) => {
      const response = await register(
        makeRequest("/api/auth/register", "POST", body),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty(
        "error",
        "Email and password are required",
      );
    },
  );

  it("reports malformed JSON, duplicate users, and persistence errors during registration", async () => {
    suppressConsoleErrors();
    const malformed = await register(
      makeRequest("/api/auth/register", "POST", "{"),
    );
    expect(malformed.status).toBe(500);

    jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValue({ id: "existing" } as never);
    const duplicate = await register(
      makeRequest("/api/auth/register", "POST", {
        email: "existing@example.com",
        password: "secret",
      }),
    );
    expect(duplicate.status).toBe(409);

    jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null as never);
    jest
      .spyOn(prisma.user, "create")
      .mockRejectedValue(new Error("db unavailable"));
    const failed = await register(
      makeRequest("/api/auth/register", "POST", {
        email: "new@example.com",
        password: "secret",
      }),
    );
    expect(failed.status).toBe(500);
  });

  it("authenticates valid credentials and rejects missing users and wrong passwords", async () => {
    const hash = await auth.hashPassword("secret");
    const user = {
      id: "user-login",
      email: "customer@example.com",
      name: null,
      role: "USER",
      password: hash,
    };
    jest.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(user as never);
    const success = await login(
      makeRequest("/api/auth/login", "POST", {
        email: user.email,
        password: "secret",
      }),
    );
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({ id: user.id, role: "USER" });
    expect(success.cookies.get(auth.COOKIE_NAME)?.value).toBeTruthy();

    jest.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(null as never);
    const missing = await login(
      makeRequest("/api/auth/login", "POST", {
        email: "missing@example.com",
        password: "secret",
      }),
    );
    expect(missing.status).toBe(401);

    jest.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(user as never);
    const wrongPassword = await login(
      makeRequest("/api/auth/login", "POST", {
        email: user.email,
        password: "wrong",
      }),
    );
    expect(wrongPassword.status).toBe(401);
  });

  it("validates login input, handles storage errors, and clears the session on logout", async () => {
    suppressConsoleErrors();
    const invalid = await login(
      makeRequest("/api/auth/login", "POST", { email: "a@example.com" }),
    );
    expect(invalid.status).toBe(400);
    const malformed = await login(makeRequest("/api/auth/login", "POST", "{"));
    expect(malformed.status).toBe(500);

    jest
      .spyOn(prisma.user, "findUnique")
      .mockRejectedValue(new Error("database unavailable"));
    const failed = await login(
      makeRequest("/api/auth/login", "POST", {
        email: "a@example.com",
        password: "secret",
      }),
    );
    expect(failed.status).toBe(500);

    const loggedOut = await logout();
    expect(await loggedOut.json()).toEqual({ ok: true });
    expect(loggedOut.cookies.get(auth.COOKIE_NAME)?.value).toBe("");
  });

  it("returns the current user or null and handles lookup errors", async () => {
    authAs(null);
    expect(
      await (await getCurrentUser(makeRequest("/api/auth/user", "GET"))).json(),
    ).toBe(null);

    authAs(regularUser);
    const current = await getCurrentUser(
      makeRequest("/api/auth/user", "GET", undefined, "session=test"),
    );
    expect(await current.json()).toMatchObject({ id: regularUser.id });

    authAs(null).mockRejectedValue(new Error("auth failed"));
    suppressConsoleErrors();
    const failed = await getCurrentUser(makeRequest("/api/auth/user", "GET"));
    expect(await failed.json()).toBeNull();
  });

  it("updates the profile name, rejects unauthorized or overlong input, and handles failures", async () => {
    authAs(null);
    const unauthorized = await updateCurrentUser(
      makeRequest("/api/auth/user", "PUT", { name: "A" }),
    );
    expect(unauthorized.status).toBe(401);

    authAs(regularUser);
    const tooLong = await updateCurrentUser(
      makeRequest("/api/auth/user", "PUT", { name: "n".repeat(81) }),
    );
    expect(tooLong.status).toBe(400);

    authAs(regularUser);
    const update = jest.spyOn(prisma.user, "update").mockResolvedValue({
      ...regularUser,
      name: "Alex",
    } as never);
    const success = await updateCurrentUser(
      makeRequest("/api/auth/user", "PUT", { name: " Alex " }),
    );
    expect(success.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: regularUser.id },
      data: { name: "Alex" },
    });

    authAs(regularUser);
    jest.spyOn(prisma.user, "update").mockRejectedValue(new Error("db failed"));
    suppressConsoleErrors();
    const failed = await updateCurrentUser(
      makeRequest("/api/auth/user", "PUT", { name: 3 }),
    );
    expect(failed.status).toBe(500);
  });
});

describe("conversation collection routes", () => {
  it("lists conversations for guests, customers, and admins with the expected scope", async () => {
    const findMany = jest
      .spyOn(prisma.conversation, "findMany")
      .mockResolvedValue([] as never);
    authAs(null);
    await getConversations(makeRequest("/api/conversations", "GET"));
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: null } }),
    );

    authAs(regularUser);
    await getConversations(makeRequest("/api/conversations", "GET"));
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: regularUser.id } }),
    );

    authAs(adminUser);
    await getConversations(makeRequest("/api/conversations", "GET"));
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("creates guest and signed-in conversations and maps database errors", async () => {
    const created = { id, messages: [] };
    const create = jest
      .spyOn(prisma.conversation, "create")
      .mockResolvedValue(created as never);
    authAs(null);
    expect(
      (await createConversation(makeRequest("/api/conversations", "POST")))
        .status,
    ).toBe(201);
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: {} }),
    );

    authAs(regularUser);
    await createConversation(makeRequest("/api/conversations", "POST"));
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { userId: regularUser.id } }),
    );

    authAs(null);
    jest
      .spyOn(prisma.conversation, "create")
      .mockRejectedValue(new Error("db failed"));
    const failed = await createConversation(
      makeRequest("/api/conversations", "POST"),
    );
    expect(failed.status).toBe(500);
  });

  it("returns a server error when the list query fails", async () => {
    authAs(null);
    jest
      .spyOn(prisma.conversation, "findMany")
      .mockRejectedValue(new Error("db failed"));
    const response = await getConversations(
      makeRequest("/api/conversations", "GET"),
    );
    expect(response.status).toBe(500);
  });
});

describe("conversation deletion route", () => {
  it("returns 404 for missing conversations and 403 for another account's conversation", async () => {
    authAs(null);
    findConversation(null);
    expect(
      (
        await deleteConversation(
          makeRequest(`/api/conversations/${id}`, "DELETE"),
          context,
        )
      ).status,
    ).toBe(404);

    authAs(regularUser);
    findConversation({ id, userId: "other-user" });
    const forbidden = await deleteConversation(
      makeRequest(`/api/conversations/${id}`, "DELETE"),
      context,
    );
    expect(forbidden.status).toBe(403);

    authAs(null);
    findConversation({ id, userId: "other-user" });
    const unauthenticated = await deleteConversation(
      makeRequest(`/api/conversations/${id}`, "DELETE"),
      context,
    );
    expect(unauthenticated.status).toBe(403);
  });

  it("deletes a conversation and maps missing-record and unexpected database errors", async () => {
    authAs(regularUser);
    findConversation({ id, userId: regularUser.id });
    const remove = jest
      .spyOn(prisma.conversation, "delete")
      .mockResolvedValue({ id } as never);
    const success = await deleteConversation(
      makeRequest(`/api/conversations/${id}`, "DELETE"),
      context,
    );
    expect(await success.json()).toEqual({ id, deleted: true });
    expect(remove).toHaveBeenCalledWith({ where: { id } });

    authAs(null);
    findConversation({ id, userId: null });
    const missing = Object.assign(new Error("record missing"), {
      name: "PrismaClientKnownRequestError",
      code: "P2025",
    });
    jest.spyOn(prisma.conversation, "delete").mockRejectedValue(missing);
    expect(
      (
        await deleteConversation(
          makeRequest(`/api/conversations/${id}`, "DELETE"),
          context,
        )
      ).status,
    ).toBe(404);

    authAs(null);
    findConversation({ id, userId: null });
    jest
      .spyOn(prisma.conversation, "delete")
      .mockRejectedValue(new Error("db failed"));
    suppressConsoleErrors();
    const failed = await deleteConversation(
      makeRequest(`/api/conversations/${id}`, "DELETE"),
      context,
    );
    expect(failed.status).toBe(500);
  });
});

describe("human support and agent routes", () => {
  it("requests human support for an active conversation and checks ownership and state", async () => {
    authAs(null);
    findConversation(null);
    expect(
      (
        await requestHumanSupport(
          makeRequest(`/api/conversations/${id}/human-request`, "POST"),
          context,
        )
      ).status,
    ).toBe(404);

    authAs(regularUser);
    findConversation({ id, userId: "other-user", endedAt: null });
    expect(
      (
        await requestHumanSupport(
          makeRequest(`/api/conversations/${id}/human-request`, "POST"),
          context,
        )
      ).status,
    ).toBe(403);

    authAs(null);
    findConversation({ id, userId: regularUser.id, endedAt: null });
    expect(
      (
        await requestHumanSupport(
          makeRequest(`/api/conversations/${id}/human-request`, "POST"),
          context,
        )
      ).status,
    ).toBe(403);

    authAs(null);
    findConversation({ id, userId: null, endedAt: new Date() });
    expect(
      (
        await requestHumanSupport(
          makeRequest(`/api/conversations/${id}/human-request`, "POST"),
          context,
        )
      ).status,
    ).toBe(409);

    authAs(regularUser);
    findConversation({ id, userId: regularUser.id, endedAt: null });
    const update = jest
      .spyOn(prisma.conversation, "update")
      .mockResolvedValue({ id, humanRequested: true } as never);
    const success = await requestHumanSupport(
      makeRequest(`/api/conversations/${id}/human-request`, "POST"),
      context,
    );
    expect(success.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { humanRequested: true } }),
    );
  });

  it("maps human request persistence errors", async () => {
    authAs(null);
    findConversation({ id, userId: null, endedAt: null });
    const knownError = Object.assign(new Error("not found"), {
      name: "PrismaClientKnownRequestError",
    });
    jest.spyOn(prisma.conversation, "update").mockRejectedValue(knownError);
    expect(
      (
        await requestHumanSupport(
          makeRequest(`/api/conversations/${id}/human-request`, "POST"),
          context,
        )
      ).status,
    ).toBe(404);

    authAs(null);
    findConversation({ id, userId: null, endedAt: null });
    jest
      .spyOn(prisma.conversation, "update")
      .mockRejectedValue(new Error("database unavailable"));
    const failed = await requestHumanSupport(
      makeRequest(`/api/conversations/${id}/human-request`, "POST"),
      context,
    );
    expect(failed.status).toBe(500);
  });

  it("requires an admin to reply, validates the message, and stores an agent message", async () => {
    authAs(null);
    expect(
      (
        await sendAgentReply(
          makeRequest(`/api/conversations/${id}/reply`, "POST", {
            message: "Hi",
          }),
          context,
        )
      ).status,
    ).toBe(401);

    authAs(regularUser);
    expect(
      (
        await sendAgentReply(
          makeRequest(`/api/conversations/${id}/reply`, "POST", {
            message: "Hi",
          }),
          context,
        )
      ).status,
    ).toBe(403);

    authAs(adminUser);
    expect(
      (
        await sendAgentReply(
          makeRequest(`/api/conversations/${id}/reply`, "POST", {}),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await sendAgentReply(
          makeRequest(`/api/conversations/${id}/reply`, "POST", {
            message: " ",
          }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await sendAgentReply(
          makeRequest(`/api/conversations/${id}/reply`, "POST", {
            message: "x".repeat(1001),
          }),
          context,
        )
      ).status,
    ).toBe(400);

    findConversation(null);
    expect(
      (
        await sendAgentReply(
          makeRequest(`/api/conversations/${id}/reply`, "POST", {
            message: "Hi",
          }),
          context,
        )
      ).status,
    ).toBe(404);

    findConversation({ id, humanRequested: false });
    expect(
      (
        await sendAgentReply(
          makeRequest(`/api/conversations/${id}/reply`, "POST", {
            message: "Hi",
          }),
          context,
        )
      ).status,
    ).toBe(409);

    findConversation({ id, humanRequested: true });
    const savedMessage = {
      id: "agent-message",
      role: "agent",
      content: "Hello",
    };
    jest.spyOn(prisma.message, "create").mockReturnValue(savedMessage as never);
    jest.spyOn(prisma.conversation, "update").mockReturnValue({} as never);
    jest
      .spyOn(prisma, "$transaction")
      .mockResolvedValue([savedMessage] as never);
    const success = await sendAgentReply(
      makeRequest(`/api/conversations/${id}/reply`, "POST", {
        message: " Hello ",
      }),
      context,
    );
    expect(success.status).toBe(201);
    expect(await success.json()).toEqual(savedMessage);
  });

  it("returns a server error when an agent reply transaction fails", async () => {
    authAs(adminUser);
    findConversation({ id, humanRequested: true });
    jest.spyOn(prisma.message, "create").mockReturnValue({} as never);
    jest.spyOn(prisma.conversation, "update").mockReturnValue({} as never);
    jest
      .spyOn(prisma, "$transaction")
      .mockRejectedValue(new Error("transaction failed"));
    const response = await sendAgentReply(
      makeRequest(`/api/conversations/${id}/reply`, "POST", {
        message: "Hello",
      }),
      context,
    );
    expect(response.status).toBe(500);
  });

  it("clears priority for admins and handles auth, missing, and database failures", async () => {
    authAs(null);
    expect(
      (
        await clearPriority(
          makeRequest(`/api/conversations/${id}/priority`, "PATCH"),
          context,
        )
      ).status,
    ).toBe(401);
    authAs(regularUser);
    expect(
      (
        await clearPriority(
          makeRequest(`/api/conversations/${id}/priority`, "PATCH"),
          context,
        )
      ).status,
    ).toBe(403);

    authAs(adminUser);
    jest.spyOn(prisma.conversation, "update").mockResolvedValue({
      id,
      humanRequested: false,
    } as never);
    const success = await clearPriority(
      makeRequest(`/api/conversations/${id}/priority`, "PATCH"),
      context,
    );
    expect(success.status).toBe(200);

    authAs(adminUser);
    const missing = Object.assign(new Error("record missing"), {
      name: "PrismaClientKnownRequestError",
      code: "P2025",
    });
    jest.spyOn(prisma.conversation, "update").mockRejectedValue(missing);
    expect(
      (
        await clearPriority(
          makeRequest(`/api/conversations/${id}/priority`, "PATCH"),
          context,
        )
      ).status,
    ).toBe(404);

    authAs(adminUser);
    jest
      .spyOn(prisma.conversation, "update")
      .mockRejectedValue(new Error("db failed"));
    const failed = await clearPriority(
      makeRequest(`/api/conversations/${id}/priority`, "PATCH"),
      context,
    );
    expect(failed.status).toBe(500);
  });
});

describe("feedback and end conversation routes", () => {
  it("validates feedback, requires an assistant response, and persists trimmed feedback", async () => {
    const invalidJson = await submitFeedback(
      makeRequest(`/api/conversations/${id}/feedback`, "POST", "{"),
      context,
    );
    expect(invalidJson.status).toBe(400);

    for (const body of [
      {},
      { rating: 0 },
      { rating: 6 },
      { rating: 2.5 },
      { rating: "5" },
      { rating: 5, comment: 2 },
    ]) {
      const response = await submitFeedback(
        makeRequest(`/api/conversations/${id}/feedback`, "POST", body),
        context,
      );
      expect(response.status).toBe(400);
    }

    const tooLong = await submitFeedback(
      makeRequest(`/api/conversations/${id}/feedback`, "POST", {
        rating: 5,
        comment: "x".repeat(501),
      }),
      context,
    );
    expect(tooLong.status).toBe(400);

    findConversation(null);
    expect(
      (
        await submitFeedback(
          makeRequest(`/api/conversations/${id}/feedback`, "POST", {
            rating: 5,
          }),
          context,
        )
      ).status,
    ).toBe(404);

    findConversation({ id, messages: [] });
    expect(
      (
        await submitFeedback(
          makeRequest(`/api/conversations/${id}/feedback`, "POST", {
            rating: 5,
          }),
          context,
        )
      ).status,
    ).toBe(409);

    findConversation({ id, messages: [{ id: "assistant-message" }] });
    const saved = {
      id,
      feedbackRating: 4,
      feedbackComment: "Helpful",
      feedbackSubmittedAt: new Date(),
    };
    const update = jest
      .spyOn(prisma.conversation, "update")
      .mockResolvedValue(saved as never);
    const success = await submitFeedback(
      makeRequest(`/api/conversations/${id}/feedback`, "POST", {
        rating: 4,
        comment: " Helpful ",
      }),
      context,
    );
    expect(success.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ feedbackComment: "Helpful" }),
      }),
    );
  });

  it("stores empty feedback comments as null and maps persistence failures", async () => {
    findConversation({ id, messages: [{ id: "assistant-message" }] });
    const update = jest.spyOn(prisma.conversation, "update").mockResolvedValue({
      id,
      feedbackRating: 3,
      feedbackComment: null,
    } as never);
    const response = await submitFeedback(
      makeRequest(`/api/conversations/${id}/feedback`, "POST", { rating: 3 }),
      context,
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ feedbackComment: null }),
      }),
    );

    findConversation({ id, messages: [{ id: "assistant-message" }] });
    jest
      .spyOn(prisma.conversation, "update")
      .mockRejectedValue(new Error("database unavailable"));
    suppressConsoleErrors();
    const failed = await submitFeedback(
      makeRequest(`/api/conversations/${id}/feedback`, "POST", { rating: 4 }),
      context,
    );
    expect(failed.status).toBe(500);
  });

  it("ends only conversations with a reply and keeps an existing end timestamp", async () => {
    findConversation(null);
    expect(
      (
        await endConversation(
          makeRequest(`/api/conversations/${id}/end`, "POST"),
          context,
        )
      ).status,
    ).toBe(404);

    findConversation({ id, endedAt: null, messages: [] });
    expect(
      (
        await endConversation(
          makeRequest(`/api/conversations/${id}/end`, "POST"),
          context,
        )
      ).status,
    ).toBe(409);

    const previousEnd = new Date("2026-10-01T12:00:00Z");
    findConversation({ id, endedAt: previousEnd, messages: [] });
    const update = jest
      .spyOn(prisma.conversation, "update")
      .mockResolvedValue({ id, endedAt: previousEnd } as never);
    const repeated = await endConversation(
      makeRequest(`/api/conversations/${id}/end`, "POST"),
      context,
    );
    expect(repeated.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { endedAt: previousEnd } }),
    );

    findConversation({ id, endedAt: null, messages: [{ id: "reply" }] });
    jest.spyOn(prisma.conversation, "update").mockResolvedValue({
      id,
      endedAt: new Date(),
    } as never);
    const success = await endConversation(
      makeRequest(`/api/conversations/${id}/end`, "POST"),
      context,
    );
    expect(success.status).toBe(200);
  });

  it("returns a server error if ending a conversation fails", async () => {
    findConversation({ id, endedAt: null, messages: [{ id: "reply" }] });
    jest
      .spyOn(prisma.conversation, "update")
      .mockRejectedValue(new Error("database unavailable"));
    suppressConsoleErrors();
    const response = await endConversation(
      makeRequest(`/api/conversations/${id}/end`, "POST"),
      context,
    );
    expect(response.status).toBe(500);
  });
});

describe("chat route", () => {
  it("validates request payload and message length", async () => {
    const missing = await postChat(makeRequest("/api/chat", "POST", {}));
    expect(missing.status).toBe(400);

    for (const message of ["  ", "x".repeat(1001)]) {
      const response = await postChat(
        makeRequest("/api/chat", "POST", { conversationId: id, message }),
      );
      expect(response.status).toBe(400);
    }
  });

  it("checks conversation access before opening a stream", async () => {
    authAs(null);
    findConversation(null);
    expect(
      (
        await postChat(
          makeRequest("/api/chat", "POST", {
            conversationId: id,
            message: "Hi",
          }),
        )
      ).status,
    ).toBe(404);

    authAs(regularUser);
    findConversation({ userId: "other-user" });
    expect(
      (
        await postChat(
          makeRequest("/api/chat", "POST", {
            conversationId: id,
            message: "Hi",
          }),
        )
      ).status,
    ).toBe(403);

    authAs(regularUser);
    findConversation({ userId: null });
    expect(
      (
        await postChat(
          makeRequest("/api/chat", "POST", {
            conversationId: id,
            message: "Hi",
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("streams token and completion events", async () => {
    authAs(null);
    findConversation({ userId: null });
    jest
      .spyOn(chatService, "sendMessage")
      .mockImplementation(
        async (_conversationId, _content, onToken, onReplace) => {
          onToken?.("Hello");
          onReplace?.("Hello");
          return {
            userMessage: { id: "user-message", role: "user", content: "Hi" },
            assistantMessage: {
              id: "assistant-message",
              role: "assistant",
              content: "Hello",
            },
            source: "ai",
            humanEscalationRequested: false,
            intent: "general_support",
          } as never;
        },
      );

    const response = await postChat(
      makeRequest("/api/chat", "POST", { conversationId: id, message: "Hi" }),
    );
    expect(response.headers.get("Content-Type")).toMatch(
      /application\/x-ndjson/,
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual([
      "token",
      "replace",
      "complete",
    ]);
    expect(events[0]).toEqual({ type: "token", text: "Hello" });
  });

  it.each([
    ["Conversation not found", 404],
    ["Conversation has ended", 409],
    ["database unavailable", 500],
  ])("encodes stream errors for %s", async (message, status) => {
    authAs(null);
    findConversation({ userId: null });
    jest
      .spyOn(chatService, "sendMessage")
      .mockRejectedValue(new Error(message));
    const response = await postChat(
      makeRequest("/api/chat", "POST", { conversationId: id, message: "Hi" }),
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({ type: "error", status });
  });

  it("returns JSON for malformed request bodies and unexpected outer failures", async () => {
    const malformed = await postChat(makeRequest("/api/chat", "POST", "{"));
    expect(malformed.status).toBe(500);

    authAs(null).mockRejectedValue(new Error("auth unavailable"));
    suppressConsoleErrors();
    const failed = await postChat(
      makeRequest("/api/chat", "POST", { conversationId: id, message: "Hi" }),
    );
    expect(failed.status).toBe(500);
  });
});

describe("health and integration routes", () => {
  it("checks SQLite and reports connectivity failures", async () => {
    jest.spyOn(prisma, "$queryRaw").mockResolvedValue([{ 1: 1 }] as never);
    expect((await healthCheck()).status).toBe(200);

    jest
      .spyOn(prisma, "$queryRaw")
      .mockRejectedValue(new Error("database unavailable"));
    expect((await healthCheck()).status).toBe(503);
  });

  it("reports an unconfigured AI integration, connected status, and provider failure", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(await (await openAIStatus()).json()).toMatchObject({
      status: "unconfigured",
      provider: "OpenAI",
    });

    process.env.OPENAI_API_KEY = "configured-key";
    jest.spyOn(aiProvider, "checkAIConnection").mockResolvedValue(true);
    expect(await (await openAIStatus()).json()).toMatchObject({
      status: "connected",
    });

    jest
      .spyOn(aiProvider, "checkAIConnection")
      .mockRejectedValue(new Error("provider unavailable"));
    suppressConsoleErrors();
    const failed = await openAIStatus();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({
      status: "unavailable",
      message: "provider unavailable",
    });

    jest.spyOn(aiProvider, "checkAIConnection").mockRejectedValue("offline");
    const unknownFailure = await openAIStatus();
    expect(unknownFailure.status).toBe(503);
    expect(await unknownFailure.json()).toMatchObject({
      status: "unavailable",
      message: "Connection failed",
    });
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });
});
