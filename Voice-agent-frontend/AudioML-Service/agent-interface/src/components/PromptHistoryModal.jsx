import { useState, useEffect, useCallback, useRef } from "react";
import { baseURL } from "../url";
import { Button, EmptyState, ErrorState, Skeleton } from "./ui";

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* Unified-style diff rows from the backend's difflib opcodes (issue #35).
 * "replace" comes through as a paired old (red) then new (green) line. */
function DiffView({ rows }) {
  return (
    <div className="font-mono text-[12.5px] leading-relaxed border border-slate-200 rounded-xl overflow-hidden">
      {rows.map((r, i) => {
        if (r.tag === "equal") {
          return <div key={i} className="px-3 py-px text-slate-600 whitespace-pre-wrap break-words">{r.old}</div>;
        }
        return (
          <div key={i}>
            {r.old != null && (r.tag === "delete" || r.tag === "replace") && (
              <div className="px-3 py-px bg-red-50 text-red-800 whitespace-pre-wrap break-words">− {r.old}</div>
            )}
            {r.new != null && (r.tag === "insert" || r.tag === "replace") && (
              <div className="px-3 py-px bg-emerald-50 text-emerald-800 whitespace-pre-wrap break-words">+ {r.new}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VersionRow({ agentId, version, onRolledBack }) {
  const [expanded, setExpanded] = useState(false);
  const [diff, setDiff] = useState(null);
  const [diffError, setDiffError] = useState("");
  const [rollingBack, setRollingBack] = useState(false);
  const [confirmingRollback, setConfirmingRollback] = useState(false);

  async function toggleDiff() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (diff) return;
    try {
      const res = await fetch(`${baseURL}api/agent/${agentId}/prompt-history/${version.id}/diff`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDiff((await res.json()).rows);
    } catch (e) {
      setDiffError(e.message || "Failed to load diff");
    }
  }

  async function rollback() {
    if (!confirmingRollback) { setConfirmingRollback(true); return; }
    setRollingBack(true);
    try {
      const res = await fetch(`${baseURL}api/agent/${agentId}/prompt-history/${version.id}/rollback`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onRolledBack();
    } catch (e) {
      setDiffError(e.message || "Rollback failed");
      setRollingBack(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2.5 bg-slate-50">
        <div className="flex-1 min-w-[140px]">
          <p className="text-sm font-semibold text-slate-700 m-0">{fmtDateTime(version.created_at)}</p>
          {version.changed_by && <p className="text-xs text-slate-500 mt-0.5 mb-0">by {version.changed_by}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={toggleDiff} aria-expanded={expanded}>
          {expanded ? "Hide diff" : "View diff"}
        </Button>
        <Button
          variant={confirmingRollback ? "danger" : "secondary"}
          size="sm"
          onClick={rollback}
          disabled={rollingBack}
        >
          {rollingBack ? "Rolling back…" : confirmingRollback ? "Confirm rollback?" : "Roll back to this"}
        </Button>
      </div>
      {expanded && (
        <div className="px-4 py-3 border-t border-slate-200">
          {diffError && <p className="text-sm text-red-600 m-0">{diffError}</p>}
          {!diffError && !diff && (
            <div className="space-y-2" aria-label="Loading diff">
              <Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-2/3" />
            </div>
          )}
          {diff && <DiffView rows={diff} />}
        </div>
      )}
    </div>
  );
}

export default function PromptHistoryModal({ agentId, onClose, onRolledBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const closeRef = useRef(null);

  const load = useCallback(() => {
    fetch(`${baseURL}api/agent/${agentId}/prompt-history`, { credentials: "include" })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((d) => { setData(d); setError(""); })
      .catch(e => setError(e.message || "Failed to load prompt history"));
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  // Escape closes; focus starts on the close button and returns to
  // whatever opened the modal afterwards. onClose goes through a ref so a
  // parent passing an inline arrow doesn't re-run this (and re-steal
  // focus) on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, []);

  function handleRolledBack() {
    load();
    onRolledBack();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-5 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-history-title"
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="min-w-0">
            <h2 id="prompt-history-title" className="text-base font-semibold text-slate-900 m-0">Prompt version history</h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-0">View what changed between saves, or roll back to an earlier prompt.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close prompt history"
            className="ml-auto w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex flex-col gap-2.5">
          {error && <ErrorState title="Couldn't load prompt history" message={error} onRetry={() => { setError(""); load(); }} />}
          {!error && !data && (
            <div className="space-y-2.5" aria-label="Loading prompt history">
              <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
            </div>
          )}
          {data && data.versions.length === 0 && (
            <EmptyState
              compact
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
              }
              title="No earlier versions yet"
              description="A version is saved here each time the prompt is edited, so you can compare or roll back later."
            />
          )}
          {data && data.versions.map(v => (
            <VersionRow key={v.id} agentId={agentId} version={v} onRolledBack={handleRolledBack} />
          ))}
        </div>
      </div>
    </div>
  );
}
