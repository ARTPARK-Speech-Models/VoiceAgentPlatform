// Preview-only mock backend. Imported FIRST by src/preview/main.jsx so the
// fetch/WebSocket stubs are in place before any app module evaluates.
//
// Query-string flags (on preview.html):
//   ?empty=1   -> empty agent / call / eval lists (first-run states)
//   ?error=1   -> list endpoints return HTTP 500
//   ?active=1  -> agent 1 ("Aarogya Helpdesk") is the active agent
//   ?delay=ms  -> artificial latency on every mocked response (default 60)
import * as fx from "./fixtures";
import { baseURL } from "../url";

const qs = new URLSearchParams(window.location.search);
const flag = (k) => ["1", "true", "yes"].includes((qs.get(k) || "").toLowerCase());
export const MODE = {
  empty: flag("empty"),
  error: flag("error"),
  active: flag("active"),
  delay: Number(qs.get("delay") ?? 60) || 0,
};

// ── Active agent: AgentContext seeds from sessionStorage and then reconciles
// against GET /api/agents/active-status (active_counts keyed by agent id).
const ACTIVE_KEY = "activeAgentSelection";
try {
  if (MODE.active) {
    const a = fx.agentList[0];
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ id: a.id, name: a.name }));
  } else {
    sessionStorage.removeItem(ACTIVE_KEY);
  }
} catch { /* storage unavailable */ }
let activeCounts = MODE.active ? { [String(fx.agentList[0].id)]: 1 } : {};

// ── WebSocket stub: never connects, never fires events.
class NoopWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  constructor(url) {
    this.url = String(url); this.readyState = 3; this.binaryType = "blob";
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    console.info("[preview] WebSocket stubbed:", this.url);
  }
  send() {}
  close() { this.readyState = 3; }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false; }
}
window.WebSocket = NoopWebSocket;

// ── fetch wrapper
const realFetch = window.fetch.bind(window);
const API_BASE = String(baseURL || "http://localhost:8000/");

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [method, regex on path after "/api/", handler(match, ctx) -> body | Response | null (=404)]
// Handlers flagged `list: true` return 500 in ?error=1 mode.
const ROUTES = [
  ["GET", /^auth\/verify$/, () => ({ username: fx.USERNAME, verified: true })],
  ["POST", /^auth\/session$/, () => ({ username: fx.USERNAME, verified: true })],
  ["POST", /^auth\/logout$/, () => ({ message: "Logged out" })],

  ["GET", /^agents\/active-status$/, () => ({ active_counts: activeCounts })],
  ["POST", /^activate\/configurable\/agent$/, (m, c) => {
    const id = c.body?.body?.agent_id ?? c.body?.agent_id;
    if (id != null) activeCounts = { [String(id)]: 1 };
    return { success: true, status: 200, message: "Agent activated", io_format: "audio" };
  }],
  ["POST", /^deactivate\/agent\/([^/]+)$/, (m) => { delete activeCounts[m[1]]; return { message: "Agent deactivated", status: 200 }; }],

  ["GET", /^get\/agent\/list$/, () => (MODE.empty ? [] : fx.agentList), { list: true }],
  ["GET", /^agent-stats\/summary$/, (m, c) =>
    fx.statsSummary({ agentId: c.query.get("agent_id"), empty: MODE.empty }), { list: true }],
  ["GET", /^calls$/, (m, c) => fx.listAllCalls({ ...page(c), empty: MODE.empty }), { list: true }],
  ["GET", /^asr-eval\/summary$/, () => fx.asrEvalSummary({ empty: MODE.empty }), { list: true }],
  ["GET", /^asr\/eval-models$/, () => fx.asrEvalModels],

  ["GET", /^catalog$/, () => fx.catalog, { list: true }],
  ["POST", /^catalog\/models$/, (m, c) => ({ stage: c.body?.stage, provider: c.body?.provider, value: c.body?.value, label: c.body?.label || c.body?.value })],

  ["GET", /^settings\/api-keys$/, () => fx.apiKeys, { list: true }],
  ["PUT", /^settings\/api-keys$/, (m, c) => ({
    provider: c.body?.provider, masked: mask(c.body?.api_key || ""), updated_at: new Date().toISOString(),
  })],
  ["DELETE", /^settings\/api-keys\/(.+)$/, () => ({ deleted: true })],

  ["GET", /^tts\/voice-references$/, () => fx.voiceReferences],
  ["POST", /^tts\/voice-references$/, () => ({ id: 99, name: "New voice", transcript: "", status: 200 })],
  ["DELETE", /^tts\/voice-references\/(\d+)$/, () => ({ message: "Deleted", status: 200 })],

  ["POST", /^create\/new\/voice\/agent$/, () => ({ message: "Agent created successfully", status: 200, agent_id: 5, id: 5 })],
  ["PATCH", /^update\/agent\/([^/]+)$/, () => ({ message: "Agent updated successfully", status: 200 })],
  ["DELETE", /^delete\/agent\/([^/]+)$/, () => ({ message: "Agent deleted successfully", status: 200 })],
  ["POST", /^llm\/ingest\/data$/, () => ({ message: "Data ingested", status: 200 })],

  ["GET", /^agent\/([^/]+)\/prompt-history$/, (m) => fx.promptHistory(m[1])],
  ["GET", /^agent\/([^/]+)\/prompt-history\/([^/]+)\/diff$/, (m) => fx.promptDiff(m[1], m[2])],
  ["POST", /^agent\/([^/]+)\/prompt-history\/([^/]+)\/rollback$/, () => ({ message: "Prompt rolled back", status: 200 })],

  ["GET", /^agent\/([^/]+)\/calls$/, (m, c) => fx.listAgentCalls(m[1], { ...page(c), empty: MODE.empty }), { list: true }],
  ["GET", /^agent\/([^/]+)\/calls\/([^/]+)$/, (m) => fx.callDetail(m[1], m[2])],
  ["POST", /^agent\/([^/]+)\/calls\/([^/]+)\/asr-eval-feedback$/, (m, c) => ({
    turn_id: c.body?.turn_id, provider: c.body?.provider, feedback: c.body?.feedback,
  })],
  ["GET", /^agent\/([^/]+)\/calls\/([^/]+)\/recording\/(user|agent)$/, () => null],
  ["GET", /^agent\/([^/]+)$/, (m) => fx.agentDetail(m[1])],
];

function page(c) {
  return {
    limit: Math.max(1, Math.min(Number(c.query.get("limit") || 25), 100)),
    offset: Number(c.query.get("offset") || 0),
  };
}
function mask(k) {
  return k.length <= 8 ? "•".repeat(k.length) : `${k.slice(0, 4)}${"•".repeat(8)}${k.slice(-4)}`;
}

function isApi(url) {
  return url.startsWith(API_BASE) || url.includes("/api/");
}

async function readBody(input, init) {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text().catch(() => null) : null);
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
}

window.fetch = async function previewFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!isApi(url)) return realFetch(input, init);

  const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const u = new URL(url, window.location.href);
  const idx = u.pathname.indexOf("/api/");
  const path = decodeURIComponent(idx >= 0 ? u.pathname.slice(idx + 5) : u.pathname.replace(/^\/+/, "")).replace(/\/+$/, "");
  const ctx = { query: u.searchParams, body: await readBody(input, init), url, method };

  if (MODE.delay) await sleep(MODE.delay);

  for (const [m, re, handler, opts] of ROUTES) {
    if (m !== method) continue;
    const match = path.match(re);
    if (!match) continue;
    if (MODE.error && opts?.list) {
      return json({ detail: "Internal Server Error (preview ?error=1)" }, 500);
    }
    const out = handler(match, ctx);
    if (out instanceof Response) return out;
    if (out == null) return json({ detail: "Not found" }, 404);
    return json(structuredClone(out));
  }

  console.warn(`[preview] not mocked: ${method} ${url}`);
  return json({ detail: "not mocked" }, 404);
};

// Also route navigator.sendBeacon (if anything uses it) away from the backend.
if (navigator.sendBeacon) {
  const realBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (url, data) => (isApi(String(url)) ? true : realBeacon(url, data));
}
