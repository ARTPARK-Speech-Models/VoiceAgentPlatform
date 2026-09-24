import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { baseURL } from "../url";
import { useMessageBanner } from "./MessageBannerContext"; // adjust path as needed

const AgentContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components -- public API imported app-wide from this module; splitting it out would change every import path (HMR just full-reloads this file instead)
export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used inside <AgentProvider>");
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components -- public API imported app-wide from this module; splitting it out would change every import path (HMR just full-reloads this file instead)
export const AGENT_STATUS = {
  IDLE:       "idle",
  ACTIVATING: "activating",
  ACTIVE:     "active",
  ERROR:      "error",
};

const VERIFY_INTERVAL_MS = 30 * 1000; // 30 seconds
const ACTIVE_STATUS_POLL_MS = 10 * 1000; // 10 seconds
const ACTIVE_AGENT_STORAGE_KEY = "activeAgentSelection";

function readStoredActiveAgent() {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(ACTIVE_AGENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.name) {
      return { id: parsed.id, name: parsed.name };
    }
  } catch {
    // ignore invalid stored data
  }

  return null;
}

function persistActiveAgent(agent) {
  if (typeof window === "undefined") return;

  if (agent?.id && agent?.name) {
    sessionStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, JSON.stringify({ id: agent.id, name: agent.name }));
  } else {
    sessionStorage.removeItem(ACTIVE_AGENT_STORAGE_KEY);
  }
}

export function AgentProvider({ children }) {
  const { showMessage } = useMessageBanner();

  const [activeAgent, setActiveAgent] = useState(() => readStoredActiveAgent() ?? null);
  const [ioFormat,    setIoFormat]    = useState(null);
  const [llmSession,  setLlmSession]  = useState(null);
  const [status,      setStatus]      = useState(AGENT_STATUS.IDLE);
  const [error,       setError]       = useState("");
  const [isVerified,  setIsVerified]  = useState(null);
  const [username,    setUsername]    = useState(null);

  const inFlightRef = useRef(false);
  const verifyInFlightRef = useRef(false);
  // Tracks the previous isVerified value so we only announce "please log
  // in" when a session actually EXPIRES (true → false), not on the very
  // first check on page load (null → false), which would be noisy and
  // misleading for a visitor who was never logged in to begin with.
  const wasVerifiedRef = useRef(null);
  const suspendedRef = useRef(false);

  const makeSessionId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const verifySession = useCallback(async () => {
    if (verifyInFlightRef.current) return isVerified;
    verifyInFlightRef.current = true;

    try {
      const res = await fetch(`${baseURL}api/auth/verify`, {
        headers: {
          'ngrok-skip-browser-warning': 'true'
        },
        method: "GET",
        credentials: "include", // send the auth cookie
      });

      if (!res.ok) {
        if (res.status === 403) {
          // Banned account (users.ban_status set server-side). Announce once
          // per suspension, not on every 30s poll.
          const data = await res.json().catch(() => ({}));
          if (!suspendedRef.current) {
            showMessage(data?.detail || "This account has been suspended.", "error");
          }
          suspendedRef.current = true;
        } else if (wasVerifiedRef.current === true) {
          showMessage("Login to your account", "info");
        }
        wasVerifiedRef.current = false;
        setIsVerified(false);
        setUsername(null);
        return false;
      }

      const data = await res.json().catch(() => ({}));
      const verified = data?.verified === true;
      suspendedRef.current = false;

      if (!verified && wasVerifiedRef.current === true) {
        showMessage("Login to your account", "info");
      }
      wasVerifiedRef.current = verified;
      setIsVerified(verified);
      setUsername(verified ? (data?.username ?? null) : null);
      return verified;
    } catch {
      if (wasVerifiedRef.current === true) {
        showMessage("Login to your account", "info");
      }
      wasVerifiedRef.current = false;
      setIsVerified(false);
      setUsername(null);
      return false;
    } finally {
      verifyInFlightRef.current = false;
    }
  }, [isVerified, showMessage]);

  // Run once on mount, then every 5 minutes
  useEffect(() => {
    // False positive: verifySession only sets state after awaiting fetch,
    // never synchronously within this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    verifySession();
    const id = setInterval(() => {
      verifySession();
    }, VERIFY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [verifySession]);

  // "Active" used to be purely a frontend sessionStorage marker with no
  // server-side source of truth at all (see AgentSession in the backend).
  // This reconciles the local marker against the real DB: called once at
  // start, then polled every 10s so a session closed elsewhere (another
  // tab/device, or a stale one that got cleaned up) doesn't leave this tab
  // showing an agent as active forever.
  const syncActiveStatus = useCallback(async () => {
    try {
      const res = await fetch(`${baseURL}api/agents/active-status`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const counts = data?.active_counts || {};

      setActiveAgent((prev) => {
        if (!prev) return prev;
        const stillActive = Number(counts[String(prev.id)] ?? 0) > 0;
        if (stillActive) return prev;
        persistActiveAgent(null);
        setStatus(AGENT_STATUS.IDLE);
        return null;
      });
    } catch {
      // Best-effort background sync -- a failed poll just means we keep
      // trusting the local marker until the next successful check.
    }
  }, []);

  useEffect(() => {
    // False positive: syncActiveStatus only sets state after awaiting fetch,
    // never synchronously within this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncActiveStatus(); // call the DB at the start
    const id = setInterval(syncActiveStatus, ACTIVE_STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [syncActiveStatus]);

  // `_navigate` is accepted (and passed by every caller) but unused for now --
  // activation deliberately doesn't redirect; see the commented navigate() below.
  const activateAgent = useCallback(async (agent, _navigate) => {
    if (inFlightRef.current) return;
    if (activeAgent?.id && agent?.id && String(activeAgent.id) === String(agent.id)) {
      setStatus(AGENT_STATUS.ACTIVE);
      setIoFormat((prev) => prev ?? null);
      setLlmSession((prev) => prev ?? null);
      setError("");
      return;
    }

    inFlightRef.current = true;

    const sessionId = makeSessionId();
    const oldAgentId = activeAgent?.id ?? null;

    setStatus(AGENT_STATUS.ACTIVATING);
    setIoFormat(null);
    setLlmSession(null);
    setError("");

    try {
      const payload = {
        body :{
            agent_id: agent.id,
            old_agent_id: oldAgentId,
        } 
      }
      
      const res = await fetch(
        `${baseURL}api/activate/configurable/agent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // cookie carries auth instead of Bearer token
          body: JSON.stringify(payload),
        }
      );

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const err = new Error(data?.message || data?.error || data?.detail || `HTTP ${res.status}`);
        // 4xx detail is user-facing (e.g. a missing API key) -- show it,
        // not a generic failure.
        err.userMessage = res.status >= 400 && res.status < 500 ? data?.detail : null;
        throw err;
      }

      const isSuccessfulResponse = data?.success !== false && data?.status !== "error" && data?.error !== true;
      const fmt = data?.io_format || data?.ioFormat || data?.format || data?.output_format || data?.url || null;

      setActiveAgent({ ...agent, id: agent?.id ?? agent?.agent_id ?? agent?.name });
      persistActiveAgent({ ...agent, id: agent?.id ?? agent?.agent_id ?? agent?.name });
      setIoFormat((prev) => fmt ?? prev ?? null);
      setLlmSession(sessionId);
      setStatus(AGENT_STATUS.ACTIVE);
      inFlightRef.current = false;

      if (!isSuccessfulResponse && !fmt) {
        setError("");
        showMessage("Agent not activated", "error");
      } else {
        showMessage("Agent successfully activated", "success");
      }

      // navigate("/interact");

    } catch (e) {
      setError(e.message || "Activation failed.");
      setLlmSession(null);
      setStatus(AGENT_STATUS.ERROR);
      inFlightRef.current = false;
      showMessage(e.userMessage || "Agent not activated", "error");
      throw e;
    }
  }, [activeAgent, showMessage]);

  
  const clearError = useCallback(() => setError(""), []);

  // There was no way to un-set the active agent anywhere in the app --
  // activateAgent only ever sets it. Purely local state (the backend has no
  // persistent "active" concept beyond a single websocket connection), so
  // no API call needed, just reset what activateAgent set.
  const deactivateAgent = useCallback(() => {
    const agentId = activeAgent?.id;
    setActiveAgent(null);
    persistActiveAgent(null);
    setIoFormat(null);
    setLlmSession(null);
    setStatus(AGENT_STATUS.IDLE);
    setError("");
    showMessage("Agent deactivated", "info");

    // Persist to the real DB record too -- local state above is what
    // makes the UI feel instant, this is what syncActiveStatus (and other
    // tabs/devices) will actually see.
    if (agentId) {
      fetch(`${baseURL}api/deactivate/agent/${encodeURIComponent(agentId)}`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        // Best-effort -- if this fails, the next syncActiveStatus poll on
        // *this* tab already shows it inactive locally regardless; only a
        // different tab/device would still see it as active until the row
        // itself is actually closed server-side.
      });
    }
  }, [activeAgent, showMessage]);

  return (
    <AgentContext.Provider value={{
      activeAgent, ioFormat, llmSession, status, error, isVerified, username,
      activateAgent, deactivateAgent, clearError, verifySession,
    }}>
      {children}
    </AgentContext.Provider>
  );
}