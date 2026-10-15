"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  FlagOff,
  Inbox,
  MessageSquareText,
  MoreHorizontal,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  createdAt: string;
  updatedAt: string;
  humanRequested: boolean;
  messages: Message[];
};

function formatTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString())
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function initials(title: string) {
  return (
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "C"
  );
}

export default function AdminPage() {
  const {
    data: conversations = [],
    error,
    isLoading: loading,
    mutate: mutateConversations,
  } = useSWR<Conversation[]>("/api/conversations", apiFetcher);
  const [selectedId, setSelectedId] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [query, setQuery] = useState("");
  const [priorityUpdatingId, setPriorityUpdatingId] = useState("");
  const [priorityError, setPriorityError] = useState("");

  const loadError = error
    ? "We couldn’t load conversations. Please refresh to try again."
    : "";
  const activeSelectedId = selectedId || conversations[0]?.id || "";

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...conversations]
      .sort(
        (a, b) =>
          Number(b.humanRequested) - Number(a.humanRequested) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .filter(
        (conversation) =>
          !normalized ||
          conversation.title.toLowerCase().includes(normalized) ||
          conversation.messages.some((message) =>
            message.content.toLowerCase().includes(normalized),
          ),
      );
  }, [conversations, query]);
  const selected = conversations.find(
    (conversation) => conversation.id === activeSelectedId,
  );
  const messageCount = conversations.reduce(
    (total, conversation) => total + conversation.messages.length,
    0,
  );
  const humanRequestCount = conversations.filter(
    (conversation) => conversation.humanRequested,
  ).length;

  async function clearPriority(id: string) {
    setPriorityUpdatingId(id);
    setPriorityError("");
    try {
      const response = await fetch(`/api/conversations/${id}/priority`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Unable to clear priority");
      const updated = (await response.json()) as {
        humanRequested: boolean;
        updatedAt: string;
      };
      await mutateConversations(
        (items = []) =>
          items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  humanRequested: updated.humanRequested,
                  updatedAt: updated.updatedAt,
                }
              : item,
          ),
        { revalidate: false },
      );
    } catch (cause) {
      console.error("[admin] failed to clear conversation priority", cause);
      setPriorityError("Couldn’t clear priority. Please try again.");
    } finally {
      setPriorityUpdatingId("");
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" aria-label="Cheetah Broadband home">
          <div className="admin-brand">
            <BrandMark />
            <div>
              <strong>cheetah</strong>
              <span>BROADBAND</span>
            </div>
          </div>
        </Link>
        <div className="admin-nav-label">WORKSPACE</div>
        <Link className="admin-nav-link" href="/">
          <UserRound aria-hidden="true" /> Customer chat
        </Link>
        <Link className="admin-nav-link active" href="/admin">
          <Inbox aria-hidden="true" /> Conversations
        </Link>
        <div className="admin-sidebar-bottom">
          <span className="admin-online-dot" /> Support workspace{" "}
          <span className="admin-demo-tag">DEMO</span>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">
            Workspace <span>/</span> <strong>Conversations</strong>
          </div>
          <div className="admin-agent">
            <Avatar className="admin-agent-avatar">
              <AvatarFallback className="bg-transparent">S</AvatarFallback>
            </Avatar>
            <span>
              <strong>Support agent</strong>
              <small>Agent workspace</small>
            </span>
            <span className="admin-agent-menu">···</span>
          </div>
        </header>
        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <div className="admin-eyebrow">CUSTOMER CARE</div>
              <h1>Conversations</h1>
              <p>Review customer conversations and their message history.</p>
            </div>
            <div className="admin-heading-status">
              <i /> Inbox up to date
            </div>
          </div>
          <div className="admin-stats">
            <Card className="admin-stat-card human-stat">
              <span className="admin-stat-icon urgent">
                <UserRound aria-hidden="true" />
              </span>
              <span className="admin-stat-label">NEEDS HUMAN SUPPORT</span>
              <strong>{humanRequestCount}</strong>
              <small>Customer requests to follow up</small>
            </Card>
            <Card className="admin-stat-card">
              <span className="admin-stat-icon">
                <Inbox aria-hidden="true" />
              </span>
              <span className="admin-stat-label">TOTAL CONVERSATIONS</span>
              <strong>{conversations.length}</strong>
              <small>Across your support inbox</small>
            </Card>
            <Card className="admin-stat-card">
              <span className="admin-stat-icon mint">
                <MessageSquareText aria-hidden="true" />
              </span>
              <span className="admin-stat-label">MESSAGES</span>
              <strong>{messageCount}</strong>
              <small>Customer and assistant replies</small>
            </Card>
          </div>
          <div className={`admin-inbox${showDetail ? " show-detail" : ""}`}>
            <section className="admin-list-panel">
              <div className="admin-list-heading">
                <div>
                  <h2>All conversations</h2>
                  <span>
                    {conversations.length}{" "}
                    {conversations.length === 1
                      ? "conversation"
                      : "conversations"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="admin-refresh"
                  onClick={() => void mutateConversations()}
                  aria-label="Refresh conversations"
                >
                  <RefreshCw aria-hidden="true" />
                </Button>
              </div>
              <label className="admin-search">
                <Search aria-hidden="true" />
                <Input
                  className="admin-search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search conversations"
                />
                <kbd>⌘ K</kbd>
              </label>
              <div className="admin-list-scroll">
                {loading && (
                  <div
                    className="admin-loading-list"
                    aria-label="Loading conversations"
                    role="status"
                    aria-live="polite"
                  >
                    {[0, 1, 2, 3].map((item) => (
                      <div className="admin-loading-row" key={item}>
                        <Skeleton className="admin-loading-avatar" />
                        <div className="admin-loading-copy">
                          <Skeleton className="admin-loading-title" />
                          <Skeleton className="admin-loading-preview" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!loading && loadError && (
                  <Alert
                    variant="destructive"
                    className="admin-empty admin-error"
                  >
                    <AlertDescription>{loadError}</AlertDescription>
                  </Alert>
                )}
                {!loading &&
                  !loadError &&
                  filtered.map((conversation) => {
                    const latest = conversation.messages.at(-1);
                    return (
                      <Button
                        variant="ghost"
                        size="default"
                        key={conversation.id}
                        className={`admin-conversation${activeSelectedId === conversation.id ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedId(conversation.id);
                          setShowDetail(true);
                        }}
                      >
                        <Avatar className="admin-customer-avatar">
                          <AvatarFallback className="bg-transparent">
                            {initials(conversation.title)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="admin-conversation-copy">
                          <span className="admin-conversation-top">
                            <strong>
                              {conversation.title || "New conversation"}
                            </strong>
                            <time>{formatTime(conversation.updatedAt)}</time>
                          </span>
                          <span className="admin-conversation-preview">
                            {latest?.content || "No messages yet"}
                          </span>
                          <span className="admin-conversation-meta">
                            {conversation.humanRequested ? (
                              <Badge
                                variant="secondary"
                                className="human-request-badge"
                              >
                                Needs human
                              </Badge>
                            ) : (
                              <>
                                <i /> {conversation.messages.length}{" "}
                                {conversation.messages.length === 1
                                  ? "message"
                                  : "messages"}
                              </>
                            )}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                {!loading && !loadError && filtered.length === 0 && (
                  <div className="admin-empty">
                    {query
                      ? "No conversations match your search."
                      : "No conversations yet."}
                  </div>
                )}
              </div>
            </section>

            <section className="admin-detail-panel">
              {selected ? (
                <>
                  <div className="admin-detail-header">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="admin-back-button"
                      onClick={() => setShowDetail(false)}
                    >
                      <ArrowLeft aria-hidden="true" />{" "}
                      <span>All conversations</span>
                    </Button>
                    <div className="admin-detail-person">
                      <Avatar className="admin-customer-avatar large">
                        <AvatarFallback className="bg-transparent">
                          {initials(selected.title)}
                        </AvatarFallback>
                      </Avatar>
                      <span>
                        <strong>{selected.title || "New conversation"}</strong>
                        <small>Customer conversation</small>
                      </span>
                    </div>
                    <MoreHorizontal
                      className="admin-detail-menu"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="admin-detail-summary">
                    <span>
                      <small>STARTED</small>
                      <strong>
                        {new Date(selected.createdAt).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </strong>
                    </span>
                    <span>
                      <small>LAST UPDATED</small>
                      <strong>{formatTime(selected.updatedAt)}</strong>
                    </span>
                    <span>
                      <small>MESSAGES</small>
                      <strong>{selected.messages.length}</strong>
                    </span>
                  </div>
                  {selected.humanRequested && (
                    <Alert className="admin-human-alert">
                      <span>◉</span>
                      <div>
                        <strong>Customer requested human support</strong>
                        <small>
                          This conversation has been prioritized for agent
                          follow-up.
                        </small>
                        {priorityError && (
                          <small className="admin-priority-error">
                            {priorityError}
                          </small>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className="admin-human-priority"
                      >
                        PRIORITY
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="admin-clear-priority"
                        onClick={() => void clearPriority(selected.id)}
                        disabled={priorityUpdatingId === selected.id}
                      >
                        <FlagOff aria-hidden="true" />
                        {priorityUpdatingId === selected.id
                          ? "Clearing…"
                          : "Clear priority"}
                      </Button>
                    </Alert>
                  )}
                  <div className="admin-thread">
                    <div className="admin-thread-date">
                      <Separator />
                      <span>CONVERSATION HISTORY</span>
                      <Separator />
                    </div>
                    {selected.messages.length === 0 && (
                      <div className="admin-thread-empty">
                        There are no messages in this conversation yet.
                      </div>
                    )}
                    {selected.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`admin-message ${message.role}`}
                      >
                        <div className="admin-message-label">
                          <strong>
                            {message.role === "user"
                              ? "Customer"
                              : "Cheetah Assistant"}
                          </strong>
                          <time>
                            {new Date(message.createdAt).toLocaleString(
                              "en-GB",
                              {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </time>
                        </div>
                        <Card className="admin-message-bubble">
                          {message.content}
                        </Card>
                      </div>
                    ))}
                  </div>
                  <div className="admin-readonly-note">
                    <span>◈</span> Viewing conversation history
                  </div>
                </>
              ) : (
                <div className="admin-no-selection">
                  <Inbox aria-hidden="true" />
                  <strong>Select a conversation</strong>
                  <p>
                    Choose a conversation from the list to view its message
                    history.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
