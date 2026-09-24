import { useState, useEffect, useRef, useCallback } from "react";
import { keyframes } from "../styles/keyframes";
import { useAgent } from "../context/AgentContext";
import { baseURL } from "../url";
import MarkdownRenderer from "./MarkDownRenderer";
import { CHAT_CSS }from "../styles/textInputOutputStyle";

let _chatStyleInjected = false;
function injectChatStyles(sharedKeyframes) {
  if (_chatStyleInjected) return;
  _chatStyleInjected = true;
  const el = document.createElement("style");
  el.textContent = sharedKeyframes + CHAT_CSS;
  document.head.appendChild(el);
}

/* ─── Constants ───────────────────────────────────────────────── */
const FONT  = "'Inter', sans-serif";
const SERIF = "'Inter', sans-serif";

/* ─── Bot avatar ──────────────────────────────────────────────── */
function BotAvatar({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 8px rgba(59,130,246,.3)",
    }}>
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="13" rx="2.5" stroke="white" strokeWidth="1.6"/>
        <rect x="7"    y="8" width="2.4" height="2.4" rx=".5" fill="white" stroke="none"/>
        <rect x="14.6" y="8" width="2.4" height="2.4" rx=".5" fill="white" stroke="none"/>
        <path d="M9 13 Q12 14.8 15 13" stroke="white" strokeWidth="1.3" fill="none"/>
        <line x1="12" y1="4" x2="12" y2="2.2" stroke="white" strokeWidth="1.5"/>
        <circle cx="12" cy="1.6" r=".8" fill="white" stroke="none"/>
      </svg>
    </div>
  );
}

/* ─── User avatar ─────────────────────────────────────────────── */
function UserAvatar({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,#64748b,#475569)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    </div>
  );
}

/* ─── Thinking indicator ──────────────────────────────────────── */
function ThinkingBubble() {
  const dot = (delay) => (
    <span style={{
      width: 6, height: 6, borderRadius: "50%", background: "#93c5fd",
      display: "inline-block",
      animation: `ttc-thinking-dot .9s ease-in-out ${delay} infinite`,
    }}/>
  );
  return (
    <div className="ttc-msg" style={{
      display: "flex", alignItems: "flex-end", gap: 8, alignSelf: "flex-start",
    }}>
      <BotAvatar />
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: "#fff", border: "1px solid #e2e8f0",
        borderRadius: "4px 16px 16px 16px",
        padding: "12px 16px",
        boxShadow: "0 1px 4px rgba(0,0,0,.05)",
      }}>
        {dot("0s")} {dot(".18s")} {dot(".36s")}
      </div>
    </div>
  );
}

/* ─── Single message bubble ───────────────────────────────────── */
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";

  return (
    <div
      className="ttc-msg"
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: 8,
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "82%",
      }}
    >
      {isUser ? <UserAvatar /> : <BotAvatar />}

      <div style={{
        padding: "11px 15px",
        borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
        background: isUser
          ? "linear-gradient(135deg,#3b82f6,#1d4ed8)"
          : "#fff",
        color: isUser ? "#fff" : "#334155",
        fontSize: 14,
        lineHeight: 1.7,
        fontFamily: FONT,
        boxShadow: isUser
          ? "0 2px 12px rgba(59,130,246,.28)"
          : "0 1px 4px rgba(0,0,0,.06)",
        border: isUser ? "none" : "1px solid #e2e8f0",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {/* {msg.text}
        {msg.streaming && <span className="ttc-cursor" />} */}

        <MarkdownRenderer 
          text={msg.text}
          isUserBubble={isUser}
          streaming={msg.streaming}
        />
      </div>
    </div>
  );
}

/* ─── Empty state ─────────────────────────────────────────────── */
function EmptyChat({ agentName }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 14, padding: "32px 24px", textAlign: "center",
    }}>
      <div className="idle-float">
        <BotAvatar size={52} />
      </div>
      <div>
        <p style={{ fontFamily: SERIF, fontSize: 20, color: "#0f172a", marginBottom: 6 }}>
          {agentName ? `Chat with ${agentName}` : "Start a conversation"}
        </p>
        <p style={{ fontFamily: FONT, fontSize: 13, color: "#94a3b8", maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>
          Type a message below and press Enter or click Send.
        </p>
      </div>
    </div>
  );
}

/* ─── Copy button ─────────────────────────────────────────────── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      onClick={copy}
      title="Copy"
      style={{
        background: "none", border: "1px solid #e2e8f0",
        borderRadius: 6, padding: "3px 8px", cursor: "pointer",
        fontSize: 11, color: copied ? "#16a34a" : "#94a3b8",
        fontFamily: FONT, display: "flex", alignItems: "center", gap: 4,
        transition: "color .15s, border-color .15s",
      }}
      onMouseEnter={e => { if (!copied) { e.currentTarget.style.color = "#3b82f6"; e.currentTarget.style.borderColor = "#bfdbfe"; }}}
      onMouseLeave={e => { if (!copied) { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "#e2e8f0"; }}}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ─── Main component ──────────────────────────────────────────── */
/**
 * TextChat — text in, text out chat interface.
 *
 * Reads activeAgent from AgentContext (needs agent.id).
 * POST to baseURL + "request/custom" with FormData:
 *   - text: the user's message
 *   - agent_id: activeAgent.id
 * Expects a JSON response: { response: "..." }
 * or a plain text response.
 *
 * Add "TtT" to IO_REGISTRY in AgentInteract.jsx:
 *   "TtT": { component: TextChat, label: "Text → Text", icon: … }
 */
export default function TextChat() {
  const { activeAgent, llmSession } = useAgent();

  const [messages,  setMessages]  = useState([]);   // { id, role, text, streaming }
  const [prompt,    setPrompt]    = useState("");
  const [thinking,  setThinking]  = useState(false);
  const [error,     setError]     = useState("");

  const scrollRef   = useRef(null);
  const textareaRef = useRef(null);
  const styleInj    = useRef(false);
  const abortRef    = useRef(null);   // AbortController for in-flight requests

  /* inject styles once */
  useEffect(() => {
    if (!styleInj.current) { injectChatStyles(keyframes); styleInj.current = true; }
  }, []);

  /* auto-scroll to bottom whenever messages change */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  /* cleanup abort on unmount */
  useEffect(() => () => abortRef.current?.abort(), []);

  /* unique id helper */
  function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

  const handleSubmit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || thinking) return;

    setError("");
    setPrompt("");
    // Reset textarea height
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    // Append user message
    const userMsg = { id: uid(), role: "user", text, streaming: false };
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);

    const token = localStorage.getItem("agentToken");
    abortRef.current = new AbortController();

    try {
      const formData = new FormData();
      formData.append("text",     text);
      formData.append("agent_id", activeAgent?.id ?? "");
      if (llmSession) {
        formData.append("llm_session", llmSession);
      }

      const response = await fetch(baseURL + "request/custom", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body:    formData,
        signal:  abortRef.current.signal,
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => "");
        throw new Error(msg || `HTTP ${response.status}`);
      }

      // ── Try streaming (SSE / chunked text) first ──────────────
      // If the backend streams, we consume chunk by chunk.
      // If it returns a plain JSON or text response, we handle that too.
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // Streaming response
        const botId = uid();
        setThinking(false);
        setMessages(prev => [...prev, { id: botId, role: "bot", text: "", streaming: true }]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          // Strip SSE "data: " prefixes if present
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                buffer += parsed?.text || parsed?.delta || parsed?.content || data;
              } catch {
                buffer += data;
              }
            } else {
              buffer += chunk;
            }
          }

          const captured = buffer;
          setMessages(prev => prev.map(m =>
            m.id === botId ? { ...m, text: captured } : m
          ));
        }

        // Mark streaming done
        setMessages(prev => prev.map(m =>
          m.id === botId ? { ...m, streaming: false } : m
        ));

      } else {
        // Non-streaming: JSON or plain text
        setThinking(false);
        let replyText = "";

        if (contentType.includes("application/json")) {
          const data = await response.json();
          replyText = data?.output_text || data?.response || data?.text || data?.message || data?.reply
                   || data?.content || data?.answer
                   || JSON.stringify(data);
        } else {
          replyText = await response.text();
        }

        setMessages(prev => [...prev, {
          id: uid(), role: "bot", text: replyText.trim(), streaming: false,
        }]);
      }

    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Something went wrong.");
      setThinking(false);
    }
  }, [prompt, thinking, activeAgent, llmSession]);

  /* Enter sends, Shift+Enter = newline */
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setThinking(false);
    setError("");
  }

  const canSend = prompt.trim().length > 0 && !thinking;
  const hasMessages = messages.length > 0;

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div style={{
      flex: "1 1 0", display: "flex", flexDirection: "column",
      height: "100%", minHeight: 0, maxHeight: "100%",
      overflow: "hidden", fontFamily: FONT,
      background: "#f8fafc",
    }}>

      {/* ── Chat toolbar ── */}
      {hasMessages && (
        <div style={{
          padding: "8px 16px",
          borderBottom: "1px solid #e2e8f0",
          background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {messages.filter(m => m.role === "bot").length} response{messages.filter(m => m.role === "bot").length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={clearChat}
            style={{
              background: "none", border: "1px solid #e2e8f0",
              borderRadius: 7, padding: "4px 11px",
              fontSize: 12, color: "#94a3b8", cursor: "pointer",
              fontFamily: FONT, display: "flex", alignItems: "center", gap: 5,
              transition: "color .15s, border-color .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#fecaca"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Clear chat
          </button>
        </div>
      )}

      {/* ── Message list ── */}
      <div
        ref={scrollRef}
        className="ttc-scroll"
        style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          padding: "20px 16px",
          display: "flex", flexDirection: "column", gap: 16,
          minHeight: 0,
        }}
      >
        {!hasMessages && !thinking && (
          <EmptyChat agentName={activeAgent?.name} />
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 4,
            alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <MessageBubble msg={msg} />
            {/* Copy button on finished bot messages */}
            {msg.role === "bot" && !msg.streaming && (
              <div style={{ paddingLeft: 36 }}>
                <CopyButton text={msg.text} />
              </div>
            )}
          </div>
        ))}

        {thinking && <ThinkingBubble />}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="fade-up" style={{
          margin: "0 16px 8px",
          padding: "9px 13px", borderRadius: 10,
          background: "#fef2f2", border: "1px solid #fecaca",
          color: "#dc2626", fontSize: 13,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError("")}
            style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14, padding: 0 }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Input footer ── */}
      <div style={{
        background: "#fff", borderTop: "1px solid #e2e8f0",
        padding: "14px 16px 18px",
      }}>
        <div style={{ position: "relative" }}>
          <textarea
            ref={textareaRef}
            className="ttc-textarea"
            value={prompt}
            onChange={e => {
              setPrompt(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder={thinking ? "Waiting for response…" : "Message the agent…"}
            rows={1}
            disabled={thinking}
            style={{
              width: "100%", boxSizing: "border-box",
              resize: "none", overflowY: "auto",
              border: "1.5px solid #e2e8f0",
              borderRadius: 14,
              padding: "12px 50px 12px 16px",
              fontFamily: FONT, fontSize: 14, lineHeight: 1.6,
              color: "#334155",
              background: thinking ? "#f8fafc" : "#fff",
              outline: "none",
              transition: "border-color .15s, box-shadow .15s",
              boxShadow: "0 2px 8px rgba(0,0,0,.04)",
            }}
            onFocus={e => {
              e.target.style.borderColor = "#3b82f6";
              e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,.1)";
            }}
            onBlur={e => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,.04)";
            }}
          />

          {/* Send / stop button */}
          <button
            onClick={thinking ? () => { abortRef.current?.abort(); setThinking(false); } : handleSubmit}
            title={thinking ? "Cancel" : "Send (Enter)"}
            style={{
              position: "absolute", bottom: 9, right: 9,
              width: 34, height: 34, borderRadius: 10, border: "none",
              background: thinking
                ? "#fef2f2"
                : canSend
                ? "linear-gradient(135deg,#3b82f6,#1d4ed8)"
                : "#f1f5f9",
              color: thinking ? "#ef4444" : canSend ? "#fff" : "#cbd5e1",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: thinking || canSend ? "pointer" : "not-allowed",
              transition: "background .18s, color .18s, transform .1s",
              boxShadow: canSend && !thinking ? "0 2px 8px rgba(59,130,246,.28)" : "none",
            }}
            onMouseEnter={e => { if (canSend || thinking) e.currentTarget.style.transform = "scale(1.07)"; }}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          >
            {thinking ? (
              /* Stop/cancel square */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            ) : (
              /* Paper plane */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>

        {/* Hint row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 7, paddingInline: 2,
        }}>
          <p style={{ fontSize: 11, color: "#94a3b8" }}>
            {thinking ? "Generating… click ■ to cancel" : "Enter to send · Shift+Enter for newline"}
          </p>
          <span style={{
            fontSize: 11, fontVariantNumeric: "tabular-nums",
            color: prompt.length > 800 ? "#f59e0b" : "#cbd5e1",
          }}>
            {prompt.length}
          </span>
        </div>
      </div>
    </div>
  );
}