// Preview entry (preview.html): renders the real <App/> with a mocked
// backend so logged-in pages can be screenshotted without a real login.
//
//   /preview.html?path=/agents
//   /preview.html?path=/detail/1&active=1
//   /preview.html?path=/models&tab=llm      (tab is appended to path)
//   /preview.html?path=/models%3Ftab%3Dllm  (equivalent)
//   flags: empty=1, error=1, active=1, delay=<ms>
//
// mockBackend MUST be the first import: ES module imports evaluate in
// order, so fetch/WebSocket are stubbed before any app module runs.
import "./mockBackend.js";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../firebase.js";
import "../index.css";
import App from "../App.jsx";
import { AgentProvider } from "../context/AgentContext.jsx";
import { MessageBannerProvider } from "../context/MessageBannerContext.jsx";

const qs = new URLSearchParams(window.location.search);
let path = qs.get("path") || "/agents";
if (!path.startsWith("/")) path = "/" + path;

// Passthrough params for pages that read their own search params
// (e.g. ModelCardsPage's ?tab=).
const PASSTHROUGH = ["tab"];
const extra = new URLSearchParams();
for (const k of PASSTHROUGH) if (qs.has(k)) extra.set(k, qs.get(k));
if ([...extra.keys()].length) path += (path.includes("?") ? "&" : "?") + extra.toString();

document.documentElement.dataset.preview = "1";

// ?frame=<width>[&fh=<height>] -> instead of the app, render a same-origin
// <iframe> of this same preview URL (minus frame/fh/src) at that exact size.
// Used by shoot.sh: headless Chrome can't make windows narrower than ~500px
// and its --window-size includes non-viewport chrome, and a cross-origin
// (file://) wrapper's iframe doesn't get virtual time -- so the wrapper is
// same-origin and the iframe gives an exact viewport.
const frameW = Number(qs.get("frame") || 0);
if (frameW) {
  const inner = new URLSearchParams(qs);
  inner.delete("frame"); inner.delete("fh");
  const fh = Number(qs.get("fh") || 844);
  document.body.style.cssText = "margin:0;background:#fff";
  const root = document.getElementById("root");
  root.innerHTML = "";
  const f = document.createElement("iframe");
  // ?src=<same-origin URL> frames an arbitrary page (e.g. the public landing "/")
  const src = qs.get("src");
  inner.delete("src");
  f.src = src || `${location.pathname}?${inner.toString()}`;
  f.style.cssText = `display:block;width:${frameW}px;height:${fh}px;border:0`;
  root.appendChild(f);
  // Same-origin, so measure the framed document directly.
  setInterval(() => {
    try {
      const w = f.contentWindow;
      if (w?.document?.body) document.documentElement.dataset.contentHeight = String(contentHeight(w));
    } catch { /* not same-origin */ }
  }, 400);
} else createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MessageBannerProvider>
      <AgentProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AgentProvider>
    </MessageBannerProvider>
  </StrictMode>,
);

// Rendered content height, written to <html data-content-height> so the
// screenshot script can read it via `chrome --dump-dom` and size the shot.
// Accounts for inner scroll containers (h-screen + overflow-auto layouts).
function contentHeight(w) {
  const doc = w.document;
  let h = doc.documentElement.scrollHeight;
  for (const el of doc.querySelectorAll("body *")) {
    if (el.scrollHeight <= el.clientHeight + 2) continue;
    const oy = w.getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll") continue;
    const r = el.getBoundingClientRect();
    const top = r.top + w.scrollY;
    // content below the scroller (e.g. a footer) still counts
    const below = Math.max(0, doc.documentElement.scrollHeight - (r.bottom + w.scrollY));
    h = Math.max(h, Math.ceil(top + el.scrollHeight + below));
  }
  return h;
}
if (!frameW) setInterval(() => {
  const h = contentHeight(window);
  document.documentElement.dataset.contentHeight = String(h);
}, 400);
