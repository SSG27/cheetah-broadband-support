"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type Conversation = { id: string; title: string; updatedAt: string; messages: Message[] };

const suggestions = [
  { icon: "⌁", title: "Improve my Wi-Fi", prompt: "How can I improve my Wi-Fi signal at home?" },
  { icon: "↗", title: "Check my speed", prompt: "My broadband speed feels slower than usual. What should I try?" },
  { icon: "◉", title: "Connection issue", prompt: "My internet connection keeps dropping out." },
  { icon: "£", title: "Billing question", prompt: "Where can I find my latest bill?" },
];

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M6 25.8c2.3-8.5 8.4-14.2 17.2-14.2 5 0 8.8 1.7 11.2 4.6-4.8-.4-8.7 1.2-11.3 4.2-2.8 3.1-6.8 5-12.1 5.5L6 25.8Z" fill="currentColor"/><path d="M10.7 28.1c6.7 1.1 12.7-.6 17.7-5.2-1.8 7.3-7.7 11.6-15.9 10.5l-1.8-5.3Z" fill="currentColor" opacity=".65"/><circle cx="27" cy="16" r="1.2" fill="#fff"/></svg></div>;
}

function ChatAvatar({ small = false }: { small?: boolean }) {
  return <div className={`chat-avatar${small ? " small" : ""}`}><BrandMark /></div>;
}

export default function HomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [aiConnected, setAiConnected] = useState<boolean | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find((item) => item.id === activeId);
  const messages = activeConversation?.messages ?? [];

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
      setError("We couldn’t load your support chat. Refresh the page to try again.");
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    fetch("/api/integrations/openai")
      .then((response) => setAiConnected(response.ok))
      .catch(() => setAiConnected(false));
  }, [loadConversations]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
    setConversations((items) => items.map((item) => item.id === activeId
      ? { ...item, title: item.title === "New conversation" ? content.slice(0, 42) : item.title, messages: [...item.messages, optimistic] }
      : item));
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Message could not be sent");
      setConversations((items) => items.map((item) => item.id === activeId
        ? { ...item, title: item.title === "New conversation" ? content.slice(0, 42) : item.title, updatedAt: new Date().toISOString(), messages: [...item.messages.filter((message) => message.id !== optimistic.id), data.userMessage, data.assistantMessage] }
        : item));
      if (data.source === "fallback") setAiConnected(false);
    } catch (cause) {
      console.error("[ui] message send failed", cause);
      setError(cause instanceof Error ? cause.message : "Your message could not be sent. Please try again.");
      setConversations((items) => items.map((item) => item.id === activeId
        ? { ...item, messages: item.messages.filter((message) => message.id !== optimistic.id) }
        : item));
      setDraft(content);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><BrandMark /><div><strong>cheetah</strong><span>BROADBAND</span></div></div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item selected"><span className="nav-icon">◌</span> Customer care</button>
        <button className="nav-item" onClick={() => void newConversation()}><span className="nav-icon">▤</span> My conversations</button>
        <div className="sidebar-section"><span className="sidebar-label">RECENT CHATS</span><button className="plus-button" onClick={() => void newConversation()} aria-label="Start a new chat">＋</button></div>
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button key={conversation.id} className={`conversation-link${activeId === conversation.id ? " active" : ""}`} onClick={() => setActiveId(conversation.id)}>
              <span className="conversation-dot" />{conversation.title}
            </button>
          ))}
          {!conversations.length && <span className="muted sidebar-empty">Your chats will appear here</span>}
        </div>
        <div className="sidebar-bottom"><div className="support-hours"><span className="green-dot" /> Support online <span className="hours">8am – 8pm</span></div><div className="profile"><div className="profile-avatar">C</div><div><strong>Cheetah customer</strong><span>Broadband home plan</span></div><span className="profile-menu">···</span></div></div>
      </aside>

      <section className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Customer care</span><span className="crumb-chevron">/</span><strong>AI support assistant</strong></div><div className="topbar-right"><div className="secure-label"><span>◇</span> Secure conversation</div><button className="help-button" aria-label="Help">?</button></div></header>
        <div className="work-area">
          <section className="chat-column">
            <div className="chat-heading"><div><div className="eyebrow"><span className="pulse-dot" /> YOUR SUPPORT, REIMAGINED</div><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"} <span>👋</span></h1><p>How can we make your day a little faster?</p></div><button className="new-chat-button" onClick={() => void newConversation()}><span>＋</span> New chat</button></div>
            <div className="chat-card">
              <div className="chat-card-header"><div className="assistant-id"><ChatAvatar small /><div><strong>Cheetah Assistant</strong><span><i className="green-dot" /> Here to help, anytime</span></div></div><div className="powered">{aiConnected ? <><span className="provider-dot" /> AI POWERED</> : <><span className="local-dot" /> SUPPORT MODE</>}</div></div>
              <div className="messages-area">
                {!ready && <div className="loading-state"><span className="spinner" /> Getting your support space ready…</div>}
                {ready && messages.length === 0 && <div className="welcome-message"><ChatAvatar /><div className="welcome-copy"><span className="message-time">CHEETAH ASSISTANT · JUST NOW</span><div className="assistant-bubble">Hi there! I’m your Cheetah Broadband assistant. I can help with your connection, Wi-Fi, speed and billing questions. What can I help you with today?</div></div></div>}
                {messages.map((message) => <div key={message.id} className={`message-row ${message.role === "user" ? "from-user" : "from-assistant"}`}>
                  {message.role === "assistant" && <ChatAvatar />}
                  <div className="message-content"><span className="message-time">{message.role === "user" ? "YOU" : "CHEETAH ASSISTANT"} · {new Date(message.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><div className={message.role === "user" ? "user-bubble" : "assistant-bubble"}>{message.content}</div></div>
                  {message.role === "user" && <div className="user-avatar">C</div>}
                </div>)}
                {loading && <div className="message-row from-assistant"><ChatAvatar /><div className="typing-indicator"><span /><span /><span /></div></div>}
                <div ref={messagesEnd} />
              </div>
              {messages.length === 0 && ready && <div className="suggestion-area"><span className="suggestion-label">A GOOD PLACE TO START</span><div className="suggestion-grid">{suggestions.map((item) => <button key={item.title} className="suggestion-card" onClick={() => void sendMessage(undefined, item.prompt)}><span className="suggestion-icon">{item.icon}</span><span>{item.title}</span><span className="suggestion-arrow">↗</span></button>)}</div></div>}
              {error && <div className="error-banner">{error}</div>}
              <form className="composer" onSubmit={(event) => void sendMessage(event)}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask us anything about your broadband…" maxLength={1000} disabled={!ready || loading} /><span className="character-count">{draft.length}/1000</span><button className="send-button" type="submit" disabled={!draft.trim() || loading || !ready} aria-label="Send message">↑</button></form>
              <div className="privacy-note"><span>♧</span> Your conversation is private and securely stored. <a href="#privacy">Learn about privacy</a></div>
            </div>
            <div className="chat-footnote">Cheetah Assistant can make mistakes. For account changes, speak with our support team.</div>
          </section>

          <aside className="info-column">
            <div className="connection-card"><div className="card-topline"><span className="card-icon">⌁</span><span className="live-pill"><i /> LIVE</span></div><span className="card-eyebrow">YOUR CONNECTION</span><h2>Looking good.</h2><p>Your area is running smoothly. No issues reported nearby.</p><div className="connection-visual"><div className="signal-bars"><i /><i /><i /><i /></div><span>All systems operational</span></div><button className="text-link" onClick={() => window.open("https://www.checnet.co.uk/", "_blank", "noopener,noreferrer")}>View network status <span>↗</span></button></div>
            <div className="quick-help-card"><div className="quick-help-header"><span className="headset-icon">◉</span><div><strong>Prefer a human?</strong><span>We’re here for you, too.</span></div></div><div className="divider" /><div className="contact-row"><span>Call our team</span><a href="tel:08000142025">0800 014 2025</a></div><div className="contact-row"><span>Opening hours</span><strong>Mon–Sat, 8am–8pm</strong></div><button className="contact-button" onClick={() => { setDraft("I’d like to speak with a support specialist."); }}>Get more support <span>→</span></button></div>
            <div className="trust-note"><span>✳</span><p><strong>We’ve got your back.</strong><br />Real people, real fast. Our UK-based team is always just a call away.</p></div>
            <div className="data-note"><span className="data-shield">◈</span> Your data stays yours. <a href="#privacy">Privacy promise</a></div>
          </aside>
        </div>
        <footer className="page-footer"><span>© 2025 Cheetah Broadband</span><div><a href="#terms">Terms</a><a href="#privacy">Privacy</a><a href="#status">Network status</a></div><span className="footer-right"><i className="green-dot" /> All systems operational</span></footer>
      </section>
    </main>
  );
}
