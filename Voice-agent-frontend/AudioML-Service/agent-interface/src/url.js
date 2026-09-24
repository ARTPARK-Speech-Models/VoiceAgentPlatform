// Backend orchestrator base URL -- set via VITE_API_BASE_URL in .env (see
// .env.example for the local-dev vs. production values). Must stay an
// absolute http(s) URL, not a bare "/": buildWsUrl() in
// VoiceAgentWidget.jsx regex-replaces the http(s) prefix
// to build wss://, and `new WebSocket("/...")` throws (browsers require an
// absolute ws(s) URL).
export const baseURL = import.meta.env.VITE_API_BASE_URL
