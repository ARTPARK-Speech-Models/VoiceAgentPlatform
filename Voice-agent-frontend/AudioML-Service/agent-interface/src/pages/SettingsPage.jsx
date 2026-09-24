import { useCallback, useEffect, useState } from "react";
import PageHero from "../components/PageHero";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { baseURL } from "../url";
import { Badge, Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton } from "../components/ui";

// The "/settings" route. Currently holds the per-user API keys, which used
// to be a step in both agent builders. Keys saved here are stored on the
// server for the signed-in user and apply to all of their agents at call
// time (resolution order: the agent's own key, from older agents -> the
// user's key saved here -> the platform default). The server never returns
// raw keys, only a masked form.
const API_KEYS_URL = baseURL + "api/settings/api-keys";
const JSON_HEADERS = {
  "ngrok-skip-browser-warning": "true",
  "Content-Type": "application/json",
};

// Colored-initial badges per provider (same look as the old builder
// section). Unknown providers from the server fall back to slate.
const PROVIDER_META = {
  "Sarvam AI": { icon: "S", color: "bg-orange-500" },
  Deepgram: { icon: "D", color: "bg-blue-600" },
  ElevenLabs: { icon: "E", color: "bg-yellow-500" },
  OpenAI: { icon: "O", color: "bg-green-600" },
  Azure: { icon: "A", color: "bg-sky-500" },
  Google: { icon: "G", color: "bg-red-500" },
  AssemblyAI: { icon: "As", color: "bg-purple-600" },
  "Hugging Face": { icon: "HF", color: "bg-yellow-600" },
};

function providerMeta(name) {
  return PROVIDER_META[name] || { icon: (name || "?").slice(0, 2), color: "bg-slate-400" };
}

async function readError(res, fallback) {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
  } catch {
    // Non-JSON error body -- use the fallback below.
  }
  return `${fallback} (HTTP ${res.status})`;
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const LockIcon = ({ size = 20, stroke = "currentColor", strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const EyeIcon = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
);

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading API keys">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 border border-slate-200/70 rounded-xl px-4 py-3.5">
          <Skeleton className="w-9 h-9 flex-shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

// One provider row: name + usage, saved/not-set status, and inline
// Add/Replace (password input with show/hide) and Remove (inline confirm).
function ProviderRow({ provider, saved, onSaved, onRemoved, onError }) {
  const [mode, setMode] = useState(null); // null | "edit" | "confirm-remove"
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState("");
  const meta = providerMeta(provider.name);
  const inputId = `api-key-input-${provider.name.replace(/\s+/g, "-")}`;
  const errorId = `${inputId}-error`;

  const reset = () => { setMode(null); setValue(""); setReveal(false); setRowError(""); };

  const save = async () => {
    const key = value.trim();
    if (!key) { setRowError("Paste your API key first."); return; }
    setBusy(true);
    setRowError("");
    onError("");
    try {
      const res = await fetch(API_KEYS_URL, {
        method: "PUT",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ provider: provider.name, api_key: key }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't save the key"));
      const data = await res.json();
      onSaved(data, saved ? "replaced" : "saved");
      reset();
    } catch (e) {
      setRowError(e.message || "Couldn't save the key");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setRowError("");
    onError("");
    try {
      const res = await fetch(`${API_KEYS_URL}/${encodeURIComponent(provider.name)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't remove the key"));
      onRemoved(provider.name);
      reset();
    } catch (e) {
      setRowError(e.message || "Couldn't remove the key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`border rounded-xl px-4 py-3.5 transition-colors ${mode === "edit" ? "border-blue-200 bg-blue-50/40" : "border-slate-200/70 bg-white hover:border-slate-300"}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-9 h-9 rounded-lg ${meta.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`} aria-hidden="true">
            {meta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-slate-900 mr-1">{provider.name}</p>
              {saved ? <Badge tone="green" dot>Key saved</Badge> : <Badge>Not set</Badge>}
              {provider.in_use ? (
                provider.used_for && <Badge tone="blue">{provider.used_for}</Badge>
              ) : (
                <Badge tone="amber" className="cursor-help">
                  <span title="You can store this key now; no pipeline uses it yet.">Not used yet</span>
                </Badge>
              )}
            </div>
            {saved ? (
              <p className="text-xs text-slate-600 mt-1 break-all">
                <span className="font-mono">{saved.masked}</span>
                {formatDate(saved.updated_at) && <span className="text-slate-500 whitespace-nowrap"> · updated {formatDate(saved.updated_at)}</span>}
              </p>
            ) : !provider.in_use ? (
              <p className="text-xs text-slate-500 mt-1">You can store this key now; no pipeline uses it yet.</p>
            ) : null}
          </div>
        </div>

        {mode === null && (
          <div className="flex items-center gap-2 flex-shrink-0 pl-12 sm:pl-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setMode("edit"); onError(""); }}
              aria-label={`${saved ? "Replace" : "Add"} ${provider.name} API key`}
            >
              {saved ? "Replace" : "Add key"}
            </Button>
            {saved && (
              <Button
                variant="ghost"
                size="sm"
                className="hover:!text-red-600 hover:!bg-red-50"
                onClick={() => { setMode("confirm-remove"); onError(""); }}
                aria-label={`Remove ${provider.name} API key`}
              >
                Remove
              </Button>
            )}
          </div>
        )}

        {mode === "confirm-remove" && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap pl-12 sm:pl-0" role="group" aria-label={`Confirm removing ${provider.name} key`}>
            <span className="text-xs font-medium text-slate-700">Remove this key?</span>
            <Button variant="danger" size="sm" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>Cancel</Button>
          </div>
        )}
      </div>

      {mode === "edit" && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <label htmlFor={inputId} className="sr-only">{provider.name} API key</label>
            <input
              id={inputId}
              type={reveal ? "text" : "password"}
              name={`api-key-${provider.name}`}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              autoFocus
              value={value}
              onChange={e => { setValue(e.target.value); setRowError(""); }}
              onKeyDown={e => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") reset();
              }}
              placeholder={`Paste your ${provider.name} API key…`}
              aria-invalid={rowError ? true : undefined}
              aria-describedby={rowError ? errorId : undefined}
              className="w-full h-10 bg-white border border-slate-200 rounded-xl pl-3.5 pr-11 text-sm text-slate-900 font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition placeholder:text-slate-400 placeholder:font-sans"
            />
            <button
              type="button"
              onClick={() => setReveal(r => !r)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              title={reveal ? "Hide key" : "Show key"}
              aria-label={reveal ? "Hide key" : "Show key"}
              aria-pressed={reveal}
            >
              <EyeIcon open={reveal} />
            </button>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy} className="flex-1 sm:flex-none">
              {busy ? "Saving…" : "Save key"}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={busy} className="flex-1 sm:flex-none">Cancel</Button>
          </div>
        </div>
      )}

      {rowError && (
        <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-red-600">{rowError}</p>
      )}
    </li>
  );
}

function APIKeysCard() {
  const [providers, setProviders] = useState([]);
  const [keys, setKeys] = useState({}); // provider name -> {masked, updated_at}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // setState only after the request settles (not synchronously in the
  // effect body); `reload` (Retry button) flips loading on first.
  const fetchKeys = useCallback(() => {
    return fetch(API_KEYS_URL, {
      credentials: "include",
      headers: { "ngrok-skip-browser-warning": "true" },
    })
      .then(async res => {
        if (!res.ok) throw new Error(await readError(res, "Couldn't load your API keys"));
        const data = await res.json();
        setProviders(Array.isArray(data.providers) ? data.providers : []);
        setKeys(Object.fromEntries((data.keys || []).map(k => [k.provider, k])));
        setError("");
      })
      .catch(e => setError(e.message || "Couldn't load your API keys"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const reload = () => {
    setLoading(true);
    setError("");
    fetchKeys();
  };

  // Auto-hide the success message after a few seconds.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const handleSaved = (data, verb) => {
    setKeys(prev => ({ ...prev, [data.provider]: data }));
    setNotice(`${data.provider} key ${verb}.`);
  };

  const handleRemoved = (name) => {
    setKeys(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setNotice(`${name} key removed.`);
  };

  const handleRowError = (msg) => {
    setError(msg);
    if (msg) setNotice("");
  };

  const savedCount = providers.filter(p => keys[p.name]).length;

  return (
    <Card className="px-4 sm:px-6 py-5 min-w-0">
      <SectionHeading
        icon={<LockIcon size={18} />}
        title="API keys"
        description="Your third-party service credentials, used by all of your agents."
        className="flex-wrap"
      />

      <div className="flex flex-col gap-4">
        {error && (
          <ErrorState
            title="Couldn't load your API keys"
            message={error !== "Couldn't load your API keys" ? error : undefined}
            onRetry={!loading && providers.length === 0 ? reload : undefined}
          />
        )}

        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-medium text-emerald-800 flex items-center gap-2" role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {notice}
          </div>
        )}

        {loading ? (
          <SkeletonRows />
        ) : providers.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Providers</p>
              <p className="text-xs text-slate-600 tabular-nums">
                <span className="font-semibold text-slate-900">{savedCount}</span> of {providers.length} set
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {providers.map(p => (
                <ProviderRow
                  key={p.name}
                  provider={p}
                  saved={keys[p.name]}
                  onSaved={handleSaved}
                  onRemoved={handleRemoved}
                  onError={handleRowError}
                />
              ))}
            </ul>
          </div>
        ) : !error && (
          <EmptyState
            compact
            icon={<LockIcon size={22} />}
            title="No providers available"
            description="There are no third-party providers to store keys for right now."
          />
        )}
      </div>
    </Card>
  );
}

// Plain-language restatement of the resolution order described at the top
// of this file -- nothing here that the backend doesn't actually do.
function HowKeysWorkCard() {
  const steps = [
    { title: "Agent's own key", body: "Older agents may have a key set on the agent itself. If so, that key takes priority." },
    { title: "Your key from this page", body: "Otherwise the key you save here is used, for every one of your agents." },
    { title: "Platform default", body: "If neither is set, the platform's default key is used." },
  ];
  return (
    <Card className="px-4 sm:px-6 py-5 min-w-0">
      <SectionHeading icon={<InfoIcon />} title="How keys are used" description="Which key a call uses, in order of priority." />
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center flex-shrink-0 tabular-nums" aria-hidden="true">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{s.title}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-600 leading-relaxed">
        Saved keys are never shown in full again — only a masked form. To change one, replace it with a new key.
      </p>
    </Card>
  );
}

export default function SettingsPage() {
  const sidebarCollapsed = useSidebarCollapsed();
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 lg:pl-[var(--sidebar-w)]" style={{ "--sidebar-w": `${sidebarWidth}px` }}>
      <Sidebar />
      <PageHero crumbs={["Settings"]}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-white/85 text-xs font-semibold tracking-widest uppercase">Account</p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">Settings</h1>
          </div>
        </div>
        <p className="text-blue-50/90 text-sm sm:text-base leading-relaxed max-w-2xl">
          Account-wide preferences, including the API keys all of your agents use.
        </p>
      </PageHero>

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full min-w-0">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          <div className="xl:col-span-2 min-w-0">
            <APIKeysCard />
          </div>
          <HowKeysWorkCard />
        </div>
      </main>
    </div>
  );
}
