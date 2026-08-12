"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversationStatus, setConversationStatus] = useState("open");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    // Optimistically render the customer's message.
    const optimistic = {
      id: `local-${Date.now()}`,
      sender: "customer",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, userEmail: email, message: text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to send message");
      }

      const data = await res.json();
      if (!conversationId) setConversationId(data.conversationId);
      if (data.escalated) setConversationStatus("escalated");

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: "ai",
          content: data.aiMessage.content,
          classification: data.aiMessage.classification,
          confidence: data.aiMessage.confidence,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!emailConfirmed) {
    return (
      <div className="shell">
        <div className="header">
          <div>
            <h1>Support</h1>
            <div className="sub">Chat with our assistant</div>
          </div>
        </div>
        <form
          className="email-gate"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setEmailConfirmed(true);
          }}
        >
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
            What email should we use to follow up if this needs a human?
          </p>
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">Start conversation</button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="header">
        <div>
          <h1>Support</h1>
          <div className="sub">{email}</div>
        </div>
        <span className={`status-pill status-${conversationStatus}`}>{conversationStatus}</span>
      </div>

      {conversationStatus === "escalated" && (
        <div className="escalation-banner">
          This conversation has been escalated to a member of our team. They'll follow up by
          email — you can keep chatting here in the meantime.
        </div>
      )}

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            Send a message below to get started — e.g. "I can't log in and haven't received the
            password reset email."
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <div className={`bubble-row ${m.sender}`}>
              <div className="bubble">{m.content}</div>
            </div>
            {m.sender === "ai" && m.classification && (
              <div
                className="meta-row"
                style={{ justifyContent: "flex-start", paddingLeft: 2 }}
              >
                <span className="tag">{m.classification}</span>
                {typeof m.confidence === "number" && (
                  <span className="tag">{Math.round(m.confidence * 100)}% confidence</span>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && <div className="typing">Assistant is typing…</div>}
      </div>

      {error && (
        <div className="escalation-banner" style={{ margin: "0 24px 14px 24px" }}>
          {error}
        </div>
      )}

      <form className="composer" onSubmit={sendMessage}>
        <input
          type="text"
          placeholder="Type your message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
