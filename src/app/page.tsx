"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  PoundSterling
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [aiConnected, setAiConnected] = useState<boolean | null>(null);
  const [humanRequestState, setHumanRequestState] = useState<
    "idle" | "pending" | "requested" | "error"
  >("idle");
  const [deletingConversationId, setDeletingConversationId] = useState("");
  const [conversationToDelete, setConversationToDelete] =
    useState<Conversation | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const messagesContainer = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find((item) => item.id === activeId);
  const messages = useMemo(
    () => activeConversation?.messages ?? [],
    [activeConversation?.messages],
  );

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) throw new Error("Unable to load conversations");
      const data = (await response.json()) as Conversation[];
      setConversations(data);
      if (data.length) setActiveId((current) => current || data[0].id);
      else {
        const created = await fetch("/api/conversations", { method: "POST" });
        if (!created.ok) throw new Error("Unable to start a conversation");
        const conversation = (await created.json()) as Conversation;
        setConversations([conversation]);
        setActiveId(conversation.id);
      }
      setReady(true);
    } catch (cause) {
      console.error("[ui] conversation loading failed", cause);
      setError(
        "We couldn’t load your support chat. Refresh the page to try again.",
      );
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    fetch("/api/integrations/openai")
      .then((response) => response.json())
      .then((data: { status?: string }) =>
        setAiConnected(data.status === "connected"),
      )
      .catch(() => setAiConnected(false));
  }, [loadConversations]);

  useEffect(() => {
    const container = messagesContainer.current;
    if (container)
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    setHumanRequestState(
      activeConversation?.humanRequested ? "requested" : "idle",
    );
  }, [activeId, activeConversation?.humanRequested]);

  async function requestHumanSupport() {
    if (
      !activeId ||
      humanRequestState === "pending" ||
      humanRequestState === "requested"
    )
      return;
    setHumanRequestState("pending");
    try {
      const response = await fetch(
        `/api/conversations/${activeId}/human-request`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Request failed");
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId ? { ...item, humanRequested: true } : item,
        ),
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
      setConversations((items) => [conversation, ...items]);
      setActiveId(conversation.id);
    } catch (cause) {
      console.error("[ui] conversation creation failed", cause);
      setError("We couldn’t start a new chat. Please try again.");
    }
  }

  async function deleteConversation(id: string) {
    if (loading && id === activeId) return;
    setDeletingConversationId(id);
    setDeleteError("");
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Unable to delete this conversation");
      setConversations((items) => items.filter((item) => item.id !== id));
      if (activeId === id) {
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
    if (!content || !activeId || loading) return;
    setDraft("");
    setError("");
    setLoading(true);
    const optimistic: Message = {
      id: `pending-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setConversations((items) =>
      items.map((item) =>
        item.id === activeId
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
    );
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: content }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Message could not be sent");
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId
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
      );
      if (data.source === "fallback") setAiConnected(false);
    } catch (cause) {
      console.error("[ui] message send failed", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Your message could not be sent. Please try again.",
      );
      setConversations((items) =>
        items.map((item) =>
          item.id === activeId
            ? {
                ...item,
                messages: item.messages.filter(
                  (message) => message.id !== optimistic.id,
                ),
              }
            : item,
        ),
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
                className={`conversation-link${activeId === conversation.id ? " active" : ""}`}
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
                  (loading && activeId === conversation.id)
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
                        <item.icon/>
                        <span>{item.title}</span>
                        <span className="suggestion-arrow">↗</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {error && (
                <Alert variant="destructive" className="error-banner">
                  <CircleHelp aria-hidden="true" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <form
                className="composer"
                onSubmit={(event) => void sendMessage(event)}
              >
                <Input
                  className="composer-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask us anything about your broadband…"
                  maxLength={1000}
                  disabled={!ready || loading}
                />
                <span className="character-count">{draft.length}/1000</span>
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
