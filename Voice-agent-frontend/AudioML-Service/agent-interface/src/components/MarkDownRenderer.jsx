/**
 * MarkdownRenderer.jsx
 *
 * Renders markdown + LaTeX math from backend responses.
 *
 * Math syntaxes supported:
 *   Display  : \[ ... \]
 *   Inline   : \( ... \)
 *
 * Markdown supported:
 *   ``` fenced code blocks ```
 *   `inline code`
 *   # ## ### headings
 *   - / * bullet lists
 *   1. numbered lists
 *   **bold**, *italic*, _italic_, ***bold+italic***
 *   --- horizontal rule
 *
 * Loads KaTeX from CDN once (no npm install needed).
 *
 * Usage:
 *   import MarkdownRenderer from "./MarkdownRenderer";
 *   <MarkdownRenderer text={msg.text} isUserBubble={isUser} streaming={msg.streaming} />
 */

import { useState, useEffect, useRef } from "react";

const FONT = "'Inter', sans-serif";
const MONO = "'Courier New', Courier, monospace";

// ─── KaTeX loader (CDN, injected once) ───────────────────────────────────────
let _katexLoaded   = false;
let _katexLoading  = false;
let _katexCallbacks = [];

function loadKatex(cb) {
  if (_katexLoaded) { cb(window.katex); return; }
  _katexCallbacks.push(cb);
  if (_katexLoading) return;
  _katexLoading = true;

  // KaTeX CSS
  if (!document.getElementById("katex-css")) {
    const link = document.createElement("link");
    link.id   = "katex-css";
    link.rel  = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css";
    document.head.appendChild(link);
  }

  // KaTeX JS
  const script = document.createElement("script");
  script.src   = "https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js";
  script.async = true;
  script.onload = () => {
    _katexLoaded  = true;
    _katexLoading = false;
    _katexCallbacks.forEach(fn => fn(window.katex));
    _katexCallbacks = [];
  };
  document.head.appendChild(script);
}

// ─── Hook: resolves to katex once loaded ─────────────────────────────────────
function useKatex() {
  const [katex, setKatex] = useState(_katexLoaded ? window.katex : null);
  // `katex` only ever goes null -> loaded, so re-running on that change is a
  // no-op; the loader is still requested once per mount.
  useEffect(() => {
    if (!katex) loadKatex(k => setKatex(k));
  }, [katex]);
  return katex;
}

// ─── Math component (display or inline) ──────────────────────────────────────
function Math({ src, display, isUserBubble }) {
  const katex     = useKatex();
  const ref       = useRef(null);

  useEffect(() => {
    if (!katex || !ref.current) return;
    try {
      katex.render(src.trim(), ref.current, {
        displayMode:    display,
        throwOnError:   false,
        output:         "html",
        strict:         false,
      });
    } catch {
      if (ref.current) ref.current.textContent = src;
    }
  }, [katex, src, display]);

  if (!katex) {
    // Fallback: show raw LaTeX while loading
    return (
      <span style={{
        fontFamily: MONO, fontSize: 13,
        color: isUserBubble ? "rgba(255,255,255,.75)" : "#64748b",
        background: isUserBubble ? "rgba(255,255,255,.1)" : "#f8fafc",
        borderRadius: 4, padding: "1px 5px",
      }}>
        {src}
      </span>
    );
  }

  return display ? (
    <div
      ref={ref}
      style={{
        overflowX:  "auto",
        padding:    "10px 0",
        textAlign:  "center",
        color:       isUserBubble ? "#fff" : "inherit",
        // KaTeX colours need to propagate
        filter:      isUserBubble ? "invert(1) hue-rotate(180deg) brightness(1.8)" : "none",
      }}
    />
  ) : (
    <span
      ref={ref}
      style={{
        display: "inline",
        filter:  isUserBubble ? "invert(1) hue-rotate(180deg) brightness(1.8)" : "none",
      }}
    />
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      onClick={copy}
      style={{
        background: "none",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: 5, padding: "2px 8px",
        fontSize: 11, fontFamily: FONT,
        color: copied ? "#4ade80" : "rgba(255,255,255,.6)",
        cursor: "pointer",
        transition: "color .15s",
        display: "flex", alignItems: "center", gap: 4,
      }}
      onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={e => { if (!copied) e.currentTarget.style.color = "rgba(255,255,255,.6)"; }}
    >
      {copied
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      }
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Code block ───────────────────────────────────────────────────────────────
function CodeBlock({ lang, code }) {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1e293b", margin: "10px 0" }}>
      <div style={{
        background: "#1e293b", padding: "6px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", fontFamily: FONT }}>
          {lang || "code"}
        </span>
        <CopyBtn text={code} />
      </div>
      <pre style={{
        margin: 0, padding: "14px 16px",
        background: "#0f172a", color: "#e2e8f0",
        fontFamily: MONO, fontSize: 13, lineHeight: 1.7,
        overflowX: "auto", whiteSpace: "pre", wordBreak: "normal",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── Inline parser: markdown spans + inline math \( ... \) ───────────────────
function parseInline(text, isUserBubble, keyPrefix = "") {
  const parts   = [];
  // Order matters: display math first (just in case), then inline math, then markdown spans
  const re = /(\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|`([^`]+)`)/g;
  let last = 0, match, idx = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    const full = match[0];
    const [,, boldItalic, bold, italic1, italic2, inlineCode] = match;

    if (full.startsWith("\\[")) {
      // Display math inside inline context — treat as inline to avoid block wrapping
      const src = full.slice(2, -2);
      parts.push(<Math key={keyPrefix + idx++} src={src} display={false} isUserBubble={isUserBubble} />);
    } else if (full.startsWith("\\(")) {
      const src = full.slice(2, -2);
      parts.push(<Math key={keyPrefix + idx++} src={src} display={false} isUserBubble={isUserBubble} />);
    } else if (boldItalic) {
      parts.push(<strong key={keyPrefix + idx++}><em>{boldItalic}</em></strong>);
    } else if (bold) {
      parts.push(<strong key={keyPrefix + idx++}>{bold}</strong>);
    } else if (italic1 || italic2) {
      parts.push(<em key={keyPrefix + idx++}>{italic1 || italic2}</em>);
    } else if (inlineCode) {
      parts.push(
        <code key={keyPrefix + idx++} style={{
          fontFamily: MONO, fontSize: "0.88em",
          background: isUserBubble ? "rgba(255,255,255,.18)" : "#f1f5f9",
          color: isUserBubble ? "#fff" : "#7c3aed",
          borderRadius: 4, padding: "1px 5px",
          border: isUserBubble ? "1px solid rgba(255,255,255,.15)" : "1px solid #e2e8f0",
        }}>
          {inlineCode}
        </code>
      );
    }

    last = match.index + full.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}

// ─── Block-level parser ───────────────────────────────────────────────────────
function parseBlocks(text, isUserBubble) {
  const nodes = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Display math  \[ ... \] spanning multiple lines ──────────
    if (line.trimStart().startsWith("\\[")) {
      const mathLines = [line];
      // If the closing \] isn't on the same line, collect more
      if (!line.includes("\\]") || line.trimStart() === "\\[") {
        i++;
        while (i < lines.length && !lines[i].includes("\\]")) {
          mathLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) mathLines.push(lines[i]); // the closing line
      }
      const raw = mathLines.join("\n");
      // Extract content between \[ and \]
      const src = raw.replace(/^\s*\\\[/, "").replace(/\\\]\s*$/, "");
      nodes.push(
        <div key={`dm-${i}`} style={{ margin: "8px 0" }}>
          <Math src={src} display={true} isUserBubble={isUserBubble} />
        </div>
      );
      i++;
      continue;
    }

    // ── Fenced code block ────────────────────────────────────────
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "";
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(<CodeBlock key={`cb-${i}`} lang={lang} code={codeLines.join("\n")} />);
      i++;
      continue;
    }

    // ── Horizontal rule ──────────────────────────────────────────
    if (line.match(/^---+\s*$/) || line.match(/^\*\*\*+\s*$/)) {
      nodes.push(
        <hr key={`hr-${i}`} style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "12px 0" }} />
      );
      i++;
      continue;
    }

    // ── Heading  # ## ### ────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const sizeMap = { 1: 18, 2: 16, 3: 14.5 };
      nodes.push(
        <p key={`h-${i}`} style={{
          fontSize: sizeMap[level] || 14, fontWeight: 700,
          color: isUserBubble ? "#fff" : "#0f172a",
          margin: "14px 0 4px", fontFamily: FONT, lineHeight: 1.3,
        }}>
          {parseInline(headingMatch[2], isUserBubble, `h${i}-`)}
        </p>
      );
      i++;
      continue;
    }

    // ── Bullet list ──────────────────────────────────────────────
    if (line.match(/^[-*]\s+/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} style={{ margin: "6px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 3 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontSize: 14, lineHeight: 1.65, color: isUserBubble ? "#fff" : "#334155", fontFamily: FONT, listStyleType: "disc" }}>
              {parseInline(item, isUserBubble, `ul${i}${j}-`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Numbered list ────────────────────────────────────────────
    if (line.match(/^\d+\.\s+/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} style={{ margin: "6px 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 3 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontSize: 14, lineHeight: 1.65, color: isUserBubble ? "#fff" : "#334155", fontFamily: FONT, listStyleType: "decimal" }}>
              {parseInline(item, isUserBubble, `ol${i}${j}-`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Blank line → spacer ──────────────────────────────────────
    if (line.trim() === "") {
      if (nodes.length > 0) nodes.push(<div key={`sp-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // ── Plain paragraph (may contain inline math / markdown) ─────
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^```/) &&
      !lines[i].trimStart().startsWith("\\[") &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].match(/^[-*]\s+/) &&
      !lines[i].match(/^\d+\.\s+/) &&
      !lines[i].match(/^---+\s*$/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const combined = paraLines.join(" ");
      nodes.push(
        <p key={`p-${i}`} style={{
          fontSize: 14, lineHeight: 1.7,
          color: isUserBubble ? "#fff" : "#334155",
          fontFamily: FONT, margin: "4px 0", wordBreak: "break-word",
        }}>
          {parseInline(combined, isUserBubble, `p${i}-`)}
        </p>
      );
    }
  }

  return nodes;
}

// ─── Public component ─────────────────────────────────────────────────────────
/**
 * @param {string}  text          Raw string from backend (markdown + LaTeX)
 * @param {boolean} isUserBubble  True when inside the blue user chat bubble
 * @param {boolean} streaming     Appends the blinking cursor if true
 */
export default function MarkdownRenderer({ text = "", isUserBubble = false, streaming = false }) {
  if (!text) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {parseBlocks(text, isUserBubble)}
      {streaming && (
        <span
          className="ttc-cursor"
          style={{
            display: "inline-block",
            width: 2, height: "1em",
            background: isUserBubble ? "#fff" : "#3b82f6",
            borderRadius: 1, marginLeft: 2,
            verticalAlign: "text-bottom",
          }}
        />
      )}
    </div>
  );
}