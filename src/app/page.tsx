"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  ArrowUp,
  CircleHelp,
  Inbox,
  Plus,
  ShieldCheck,
  Trash2,
  Gauge,
  WifiIcon,
  GlobeOff,
  PoundSterling,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BrandMark } from "@/components/brand-mark";
import { apiFetcher } from "@/lib/api-fetcher";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: Message[];
  humanRequested?: boolean;
};

const suggestions = [
  {
    icon: WifiIcon,
    title: "Improve my Wi-Fi",
    prompt: "How can I improve my Wi-Fi signal at home?",
  },
  {
    icon: Gauge,
    title: "Check my speed",
    prompt: "My broadband speed feels slower than usual. What should I try?",
  },
  {
    icon: GlobeOff,
    title: "Connection issue",
    prompt: "My internet connection keeps dropping out.",
  },
  {
    icon: PoundSterling,
    title: "Billing question",
    prompt: "Where can I find my latest bill?",
  },
];

export default function HomePage() {
  const {
    data: conversations = [],
    error: conversationsError,
    isLoading: conversationsLoading,
    mutate: mutateConversations,
  } = useSWR<Conversation[]>("/api/conversations", apiFetcher);
  const { data: integrationStatus } = useSWR<{ status?: string }>(
    "/api/integrations/openai",
    apiFetcher,
  );
  const [activeId, setActiveId] = useState("");
  const currentActiveId = activeId || conversations[0]?.id || "";
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [error, setError] = useState("");
  const [aiFallback, setAiFallback] = useState(false);
  const [humanRequestState, setHumanRequestState] = useState<
    "idle" | "pending" | "requested" | "error"
  >("idle");
  const [deletingConversationId, setDeletingConversationId] = useState("");
  const [conversationToDelete, setConversationToDelete] =
    useState<Conversation | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const initialConversationStarted = useRef(false);
  const messagesContainer = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find(
    (item) => item.id === currentActiveId,
  );
  const messages = useMemo(
    () => activeConversation?.messages ?? [],
    [activeConversation?.messages],
  );

  useEffect(() => {
    if (
      conversationsLoading ||
      conversationsError ||
      conversations.length ||
      initialConversationStarted.current
    )
      return;
    initialConversationStarted.current = true;
    void fetch("/api/conversations", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to start a conversation");
        return (await response.json()) as Conversation;
      })
      .then((conversation) => {
        void mutateConversations([conversation], { revalidate: false });
        setActiveId(conversation.id);
      })
      .catch((cause) => {
        console.error("[ui] conversation loading failed", cause);
        setError(
          "We couldn’t load your support chat. Refresh the page to try again.",
        );
      });
  }, [
    conversationsLoading,
    conversationsError,
    conversations,
    mutateConversations,
  ]);

  const aiConnected = integrationStatus?.status === "connected" && !aiFallback;
  const ready =
    !conversationsLoading && !conversationsError && conversations.length > 0;
  const displayError =
    error ||
    messageError ||
    (conversationsError
      ? "We couldn’t load your support chat. Refresh the page to try again."
      : "");

  useEffect(() => {
    const container = messagesContainer.current;
    if (container)
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHumanRequestState(
      activeConversation?.humanRequested ? "requested" : "idle",
    );
  }, [currentActiveId, activeConversation?.humanRequested]);

  async function requestHumanSupport() {
    if (
      !currentActiveId ||
      humanRequestState === "pending" ||
      humanRequestState === "requested"
    )
      return;
    setHumanRequestState("pending");
    try {
      const response = await fetch(
        `/api/conversations/${currentActiveId}/human-request`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Request failed");
      await mutateConversations(
        (items = []) =>
          items.map((item) =>
            item.id === currentActiveId
              ? { ...item, humanRequested: true }
              : item,
          ),
        { revalidate: false },
      );
      setHumanRequestState("requested");
    } catch (cause) {
      console.error("[ui] human support request failed", cause);
      setHumanRequestState("error");
    }
  }

  async function newConversation() {
    setError("");
    try {
      const response = await fetch("/api/conversations", { method: "POST" });
      if (!response.ok) throw new Error("Unable to create conversation");
      const conversation = (await response.json()) as Conversation;
      await mutateConversations((items = []) => [conversation, ...items], {
        revalidate: false,
      });
      setActiveId(conversation.id);
    } catch (cause) {
      console.error("[ui] conversation creation failed", cause);
      setError("We couldn’t start a new chat. Please try again.");
    }
  }

  async function deleteConversation(id: string) {
    if (loading && id === currentActiveId) return;
    setDeletingConversationId(id);
    setDeleteError("");
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Unable to delete this conversation");
      await mutateConversations(
        (items = []) => items.filter((item) => item.id !== id),
        { revalidate: false },
      );
      if (currentActiveId === id) {
        const remaining = conversations.filter((item) => item.id !== id);
        if (remaining[0]) setActiveId(remaining[0].id);
        else {
          setActiveId("");
          await newConversation();
        }
      }
      setConversationToDelete(null);
    } catch (cause) {
      console.error("[ui] conversation deletion failed", cause);
      setDeleteError("We couldn’t delete this chat. Please try again.");
    } finally {
      setDeletingConversationId("");
    }
  }

  async function sendMessage(event?: FormEvent, suggestedText?: string) {
    event?.preventDefault();
    const content = (suggestedText ?? draft).trim();
    if (!content || !currentActiveId || loading) return;
    setDraft("");
    setMessageError("");
    setError("");
    setLoading(true);
    const optimistic: Message = {
      // eslint-disable-next-line react-hooks/purity
      id: `pending-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    await mutateConversations(
      (items = []) =>
        items.map((item) =>
          item.id === currentActiveId
            ? {
                ...item,
                title:
                  item.title === "New conversation"
                    ? content.slice(0, 42)
                    : item.title,
                messages: [...item.messages, optimistic],
              }
            : item,
        ),
      { revalidate: false },
    );
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: currentActiveId,
          message: content,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Message could not be sent");
      await mutateConversations(
        (items = []) =>
          items.map((item) =>
            item.id === currentActiveId
              ? {
                  ...item,
                  title:
                    item.title === "New conversation"
                      ? content.slice(0, 42)
                      : item.title,
                  updatedAt: new Date().toISOString(),
                  messages: [
                    ...item.messages.filter(
                      (message) => message.id !== optimistic.id,
                    ),
                    data.userMessage,
                    data.assistantMessage,
                  ],
                }
              : item,
          ),
        { revalidate: false },
      );
      if (data.source === "fallback") setAiFallback(true);
    } catch (cause) {
      console.error("[ui] message send failed", cause);
      setMessageError(
        cause instanceof Error
          ? cause.message
          : "Your message could not be sent. Please try again.",
      );
      await mutateConversations(
        (items = []) =>
          items.map((item) =>
            item.id === currentActiveId
              ? {
                  ...item,
                  messages: item.messages.filter(
                    (message) => message.id !== optimistic.id,
                  ),
                }
              : item,
          ),
        { revalidate: false },
      );
      setDraft(content);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>cheetah</strong>
            <span>BROADBAND</span>
          </div>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item selected">
          <span className="nav-icon">◌</span> Customer care
        </button>
        <a className="nav-item" href="/admin">
          <span className="nav-icon">
            <Inbox aria-hidden="true" />
          </span>{" "}
          Support inbox
        </a>
        <div className="sidebar-section">
          <span className="sidebar-label">RECENT CHATS</span>
          <button
            className="plus-button"
            onClick={() => void newConversation()}
            disabled={!!deletingConversationId}
            aria-label="Start a new chat"
          >
            ＋
          </button>
        </div>
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <div className="conversation-item" key={conversation.id}>
              <button
                className={`conversation-link${currentActiveId === conversation.id ? " active" : ""}`}
                onClick={() => setActiveId(conversation.id)}
                disabled={!!deletingConversationId}
              >
                <span className="conversation-dot" />
                {conversation.title || "New conversation"}
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="delete-conversation-button"
                aria-label={`Delete ${conversation.title || "new conversation"}`}
                title="Delete conversation"
                disabled={
                  !!conversationToDelete ||
                  deletingConversationId === conversation.id ||
                  (loading && currentActiveId === conversation.id)
                }
                onClick={() => {
                  setDeleteError("");
                  setConversationToDelete(conversation);
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          {!conversations.length && (
            <span className="muted sidebar-empty">
              Your chats will appear here
            </span>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="support-hours">
            <span className="green-dot" /> Support online{" "}
            <span className="hours">8am – 8pm</span>
          </div>
          <div className="profile">
            <div className="profile-avatar">C</div>
            <div>
              <strong>Cheetah customer</strong>
              <span>Broadband home plan</span>
            </div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Customer care</span>
            <span className="crumb-chevron">/</span>
            <strong>AI support assistant</strong>
          </div>
          <div className="topbar-right">
            <div className="secure-label">
              <ShieldCheck aria-hidden="true" /> Secure conversation
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              className="help-button"
              aria-label="Help"
            >
              <CircleHelp aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div className="work-area">
          <section className="chat-column">
            <div className="chat-heading">
              <div>
                <div className="eyebrow">
                  <span className="pulse-dot" /> YOUR SUPPORT, REIMAGINED
                </div>
                <h1>
                  Good{" "}
                  {new Date().getHours() < 12
                    ? "morning"
                    : new Date().getHours() < 18
                      ? "afternoon"
                      : "evening"}{" "}
                  <span>👋</span>
                </h1>
                <p>How can we make your day a little faster?</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="new-chat-button"
                onClick={() => void newConversation()}
                disabled={!!deletingConversationId}
              >
                <Plus aria-hidden="true" /> New chat
              </Button>
            </div>
            <Card className="chat-card">
              <div className="chat-card-header">
                <div className="assistant-id">
                  <Avatar className="chat-avatar small">
                    <AvatarFallback className="bg-transparent">
                      <BrandMark />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <strong>Cheetah Assistant</strong>
                    <span>
                      <i className="green-dot" /> Here to help, anytime
                    </span>
                  </div>
                </div>
                <div>
                  <Badge variant="secondary" className="powered">
                    <span
                      className={aiConnected ? "provider-dot" : "local-dot"}
                    />
                    {aiConnected ? "AI POWERED" : "SUPPORT MODE"}
                  </Badge>
                </div>
              </div>
              <div className="messages-area" ref={messagesContainer}>
                {!ready && (
                  <div className="loading-state">
                    <span className="spinner" /> Getting your support space
                    ready…
                  </div>
                )}
                {ready && messages.length === 0 && (
                  <div className="welcome-message">
                    <Avatar className="chat-avatar">
                      <AvatarFallback className="bg-transparent">
                        <BrandMark />
                      </AvatarFallback>
                    </Avatar>
                    <div className="welcome-copy">
                      <span className="message-time">
                        CHEETAH ASSISTANT · JUST NOW
                      </span>
                      <Card className="assistant-bubble">
                        Hi there! I’m your Cheetah Broadband assistant. I can
                        help with your connection, Wi-Fi, speed and billing
                        questions. What can I help you with today?
                      </Card>
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-row ${message.role === "user" ? "from-user" : "from-assistant"}`}
                  >
                    {message.role === "assistant" && (
                      <Avatar className="chat-avatar">
                        <AvatarFallback className="bg-transparent">
                          <BrandMark />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="message-content">
                      <span className="message-time">
                        {message.role === "user" ? "YOU" : "CHEETAH ASSISTANT"}{" "}
                        ·{" "}
                        {new Date(message.createdAt).toLocaleTimeString(
                          "en-GB",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                      <Card
                        className={
                          message.role === "user"
                            ? "user-bubble"
                            : "assistant-bubble"
                        }
                      >
                        {message.content}
                      </Card>
                    </div>
                    {message.role === "user" && (
                      <div className="user-avatar">C</div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="message-row from-assistant">
                    <Avatar className="chat-avatar">
                      <AvatarFallback className="bg-transparent">
                        <BrandMark />
                      </AvatarFallback>
                    </Avatar>
                    <div className="typing-indicator">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
              </div>
              {messages.length === 0 && ready && (
                <div className="suggestion-area">
                  <span className="suggestion-label">
                    A GOOD PLACE TO START
                  </span>
                  <div className="suggestion-grid">
                    {suggestions.map((item) => (
                      <Button
                        variant="outline"
                        size="sm"
                        key={item.title}
                        className="suggestion-card"
                        onClick={() => void sendMessage(undefined, item.prompt)}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                        <span className="suggestion-arrow">↗</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {displayError && (
                <Alert variant="destructive" className="error-banner">
                  <CircleHelp aria-hidden="true" />
                  <AlertDescription id="chat-message-error">
                    {displayError}
                  </AlertDescription>
                </Alert>
              )}
              <form
                className="composer"
                onSubmit={(event) => void sendMessage(event)}
              >
                <label className="sr-only" htmlFor="chat-message">
                  Message
                </label>
                <Input
                  id="chat-message"
                  className="composer-input"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setMessageError("");
                  }}
                  placeholder="Ask us anything about your broadband…"
                  maxLength={1000}
                  disabled={!ready || loading}
                  aria-describedby={`chat-message-count${messageError ? " chat-message-error" : ""}`}
                  aria-invalid={!!messageError}
                />
                <span className="character-count" aria-hidden="true">
                  {draft.length}/1000
                </span>
                <span className="sr-only" id="chat-message-count">
                  {draft.length} of 1000 characters used.
                </span>
                <Button
                  variant="default"
                  size="icon"
                  className="send-button"
                  type="submit"
                  disabled={!draft.trim() || loading || !ready}
                  aria-label="Send message"
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
              </form>
              <div className="privacy-note">
                <span>♧</span> Your conversation is private and securely stored.{" "}
                <a href="#privacy">Learn about privacy</a>
              </div>
            </Card>
            <div className="chat-footnote">
              Cheetah Assistant can make mistakes. For account changes, speak
              with our support team.
            </div>
          </section>

          <aside className="info-column">
            <div className="connection-card">
              <div className="card-topline">
                <span className="card-icon">⌁</span>
                <span className="live-pill">
                  <i /> DEMO
                </span>
              </div>
              <span className="card-eyebrow">NETWORK STATUS</span>
              <h2>Looking good.</h2>
              <p>
                Sample service status for this demonstration. No live network
                systems are connected.
              </p>
              <div className="connection-visual">
                <div className="signal-bars">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span>Demo status · all systems operational</span>
              </div>
              <span className="text-link">Service status overview</span>
            </div>
            <div className="quick-help-card">
              <div className="quick-help-header">
                <span className="headset-icon">◉</span>
                <div>
                  <strong>Prefer a human?</strong>
                  <span>We’re here for you, too.</span>
                </div>
              </div>
              <Separator className="divider" />
              <div className="contact-row">
                <span>Call our team</span>
                <a href="tel:08000142025">0800 014 2025</a>
              </div>
              <div className="contact-row">
                <span>Opening hours</span>
                <strong>Mon–Sat, 8am–8pm</strong>
              </div>
              <Button
                variant={
                  humanRequestState === "requested" ? "secondary" : "outline"
                }
                size="default"
                className={`contact-button${humanRequestState === "requested" ? " requested" : ""}`}
                onClick={() => void requestHumanSupport()}
                disabled={
                  !ready ||
                  humanRequestState === "pending" ||
                  humanRequestState === "requested"
                }
              >
                {humanRequestState === "requested"
                  ? "Human support requested"
                  : humanRequestState === "pending"
                    ? "Sending request…"
                    : "Request a human"}
                <span>{humanRequestState === "requested" ? "✓" : "→"}</span>
              </Button>
              {humanRequestState === "error" && (
                <Alert variant="destructive" className="human-request-error">
                  <CircleHelp aria-hidden="true" />
                  <AlertDescription>
                    Couldn’t send your request. Please try again.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <div className="trust-note">
              <span>✳</span>
              <p>
                <strong>We’ve got your back.</strong>
                <br />
                Real people, real fast. Our UK-based team is always just a call
                away.
              </p>
            </div>
            <div className="data-note">
              <span className="data-shield">◈</span> Your data stays yours.{" "}
              <a href="#privacy">Privacy promise</a>
            </div>
          </aside>
        </div>
        <footer className="page-footer">
          <span>© {new Date().getFullYear()} Cheetah Broadband</span>
          <div>
            <a href="#terms">Terms</a>
            <a href="#privacy">Privacy</a>
            <a href="#status">Network status</a>
          </div>
          <span className="footer-right">
            <i className="green-dot" /> All systems operational
          </span>
        </footer>
      </section>
      <AlertDialog
        open={!!conversationToDelete}
        onOpenChange={(open) => {
          if (!open && !deletingConversationId) {
            setConversationToDelete(null);
            setDeleteError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “
              {conversationToDelete?.title || "New conversation"}” and all of
              its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <CircleHelp aria-hidden="true" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingConversationId}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                if (conversationToDelete)
                  void deleteConversation(conversationToDelete.id);
              }}
              disabled={!!deletingConversationId}
            >
              <Trash2 aria-hidden="true" />
              {deletingConversationId ? "Deleting…" : "Delete conversation"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
