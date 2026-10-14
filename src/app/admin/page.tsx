"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; humanRequested: boolean; messages: Message[] };

function formatTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function initials(title: string) {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C";
}

export default function AdminPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/conversations")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load conversations");
        return response.json() as Promise<Conversation[]>;
      })
      .then((data) => {
        if (!active) return;
        setConversations(data);
        setSelectedId(data[0]?.id ?? "");
      })
      .catch(() => { if (active) setError("We couldn’t load conversations. Please refresh to try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...conversations]
      .sort((a, b) => Number(b.humanRequested) - Number(a.humanRequested) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .filter((conversation) => !normalized || conversation.title.toLowerCase().includes(normalized)
        || conversation.messages.some((message) => message.content.toLowerCase().includes(normalized)));
  }, [conversations, query]);
  const selected = conversations.find((conversation) => conversation.id === selectedId);
  const messageCount = conversations.reduce((total, conversation) => total + conversation.messages.length, 0);
  const humanRequestCount = conversations.filter((conversation) => conversation.humanRequested).length;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span className="admin-brand-mark">c</span><span><strong>cheetah</strong><small>BROADBAND</small></span></Link>
        <div className="admin-nav-label">WORKSPACE</div>
        <Link className="admin-nav-link" href="/"><span>⌂</span> Customer chat</Link>
        <Link className="admin-nav-link active" href="/admin"><span>▤</span> Conversations</Link>
        <div className="admin-sidebar-bottom"><span className="admin-online-dot" /> Support workspace <span className="admin-demo-tag">DEMO</span></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div className="admin-breadcrumb">Workspace <span>/</span> <strong>Conversations</strong></div><div className="admin-agent"><span className="admin-agent-avatar">S</span><span><strong>Support agent</strong><small>Agent workspace</small></span><span className="admin-agent-menu">···</span></div></header>
        <div className="admin-content">
          <div className="admin-page-heading"><div><div className="admin-eyebrow">CUSTOMER CARE</div><h1>Conversations</h1><p>Review customer conversations and their message history.</p></div><div className="admin-heading-status"><i /> Inbox up to date</div></div>
          <div className="admin-stats">
            <div className="admin-stat-card human-stat"><span className="admin-stat-icon urgent">◉</span><span className="admin-stat-label">NEEDS HUMAN SUPPORT</span><strong>{humanRequestCount}</strong><small>Customer requests to follow up</small></div>
            <div className="admin-stat-card"><span className="admin-stat-icon">▤</span><span className="admin-stat-label">TOTAL CONVERSATIONS</span><strong>{conversations.length}</strong><small>Across your support inbox</small></div>
            <div className="admin-stat-card"><span className="admin-stat-icon mint">◷</span><span className="admin-stat-label">MESSAGES</span><strong>{messageCount}</strong><small>Customer and assistant replies</small></div>
          </div>
          <div className={`admin-inbox${showDetail ? " show-detail" : ""}`}>
            <section className="admin-list-panel">
              <div className="admin-list-heading"><div><h2>All conversations</h2><span>{conversations.length} {conversations.length === 1 ? "conversation" : "conversations"}</span></div><button className="admin-refresh" onClick={() => window.location.reload()} aria-label="Refresh conversations">↻</button></div>
              <label className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /><kbd>⌘ K</kbd></label>
              <div className="admin-list-scroll">
                {loading && <div className="admin-empty"><span className="admin-spinner" /> Loading conversations…</div>}
                {!loading && error && <div className="admin-empty admin-error">{error}</div>}
                {!loading && !error && filtered.map((conversation) => {
                  const latest = conversation.messages.at(-1);
                  return <button key={conversation.id} className={`admin-conversation${selectedId === conversation.id ? " selected" : ""}`} onClick={() => { setSelectedId(conversation.id); setShowDetail(true); }}>
                    <span className="admin-customer-avatar">{initials(conversation.title)}</span><span className="admin-conversation-copy"><span className="admin-conversation-top"><strong>{conversation.title || "New conversation"}</strong><time>{formatTime(conversation.updatedAt)}</time></span><span className="admin-conversation-preview">{latest?.content || "No messages yet"}</span><span className="admin-conversation-meta">{conversation.humanRequested ? <b className="human-request-badge">Needs human</b> : <><i /> {conversation.messages.length} {conversation.messages.length === 1 ? "message" : "messages"}</>}</span></span>
                  </button>;
                })}
                {!loading && !error && filtered.length === 0 && <div className="admin-empty">{query ? "No conversations match your search." : "No conversations yet."}</div>}
              </div>
            </section>

            <section className="admin-detail-panel">
              {selected ? <>
                <div className="admin-detail-header"><button className="admin-back-button" onClick={() => setShowDetail(false)}>← <span>All conversations</span></button><div className="admin-detail-person"><span className="admin-customer-avatar large">{initials(selected.title)}</span><span><strong>{selected.title || "New conversation"}</strong><small>Customer conversation</small></span></div><span className="admin-detail-menu">···</span></div>
                <div className="admin-detail-summary"><span><small>STARTED</small><strong>{new Date(selected.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</strong></span><span><small>LAST UPDATED</small><strong>{formatTime(selected.updatedAt)}</strong></span><span><small>MESSAGES</small><strong>{selected.messages.length}</strong></span></div>
                {selected.humanRequested && <div className="admin-human-alert"><span>◉</span><div><strong>Customer requested human support</strong><small>This conversation has been prioritized for agent follow-up.</small></div><span className="admin-human-priority">PRIORITY</span></div>}
                <div className="admin-thread">
                  <div className="admin-thread-date">CONVERSATION HISTORY</div>
                  {selected.messages.length === 0 && <div className="admin-thread-empty">There are no messages in this conversation yet.</div>}
                  {selected.messages.map((message) => <div key={message.id} className={`admin-message ${message.role}`}><div className="admin-message-label"><strong>{message.role === "user" ? "Customer" : "Cheetah Assistant"}</strong><time>{new Date(message.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div><div className="admin-message-bubble">{message.content}</div></div>)}
                </div>
                <div className="admin-readonly-note"><span>◈</span> Viewing conversation history</div>
              </> : <div className="admin-no-selection"><span>▤</span><strong>Select a conversation</strong><p>Choose a conversation from the list to view its message history.</p></div>}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
