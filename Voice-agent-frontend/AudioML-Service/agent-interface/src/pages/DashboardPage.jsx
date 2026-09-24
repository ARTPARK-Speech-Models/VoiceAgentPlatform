import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AgentCard from "../components/AgentCard";
import PageHero from "../components/PageHero";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import { Button, Card, ErrorState, SectionHeading, Skeleton, StatCard } from "../components/ui";
import { useAgent } from "../context/AgentContext";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { baseURL } from "../url";

// The "/agents" route -- the single agent hub. It absorbed the old
// Workspace page ("/workspace", which redirects here now): summary stats,
// every agent as a card (open / activate / deactivate), and the
// create-agent entry point. With zero agents it becomes a first-run
// "create your first agent" panel with templates from the prompt catalog.
const AGENTS_API_URL = baseURL + "api/get/agent/list";
const CALL_STATS_API_URL = baseURL + "api/agent-stats/summary";
const CATALOG_API_URL = baseURL + "api/catalog";
const FETCH_OPTS = { headers: { "ngrok-skip-browser-warning": "true" }, credentials: "include" };

function formatDuration(totalSeconds) {
  if (!totalSeconds) return "0m";
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function templateHref(name) {
  return `/create?template=${encodeURIComponent(name)}`;
}

/* ─── Icons ─────────────────────────────────────────────────────────── */
const GridIcon = ({ size = 18, stroke = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);
const PlusIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

// Picks an icon for a catalog prompt by its name; unknown names get a
// generic chat bubble.
function TemplateIcon({ name }) {
  const n = name.toLowerCase();
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (n.includes("health") || n.includes("medic") || n.includes("clinic")) {
    return <svg {...common}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" /></svg>;
  }
  if (n.includes("sales") || n.includes("lead")) {
    return <svg {...common}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
  }
  if (n.includes("knowledge") || n.includes("faq") || n.includes("doc")) {
    return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
  }
  if (n.includes("care") || n.includes("support") || n.includes("service")) {
    return <svg {...common}><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>;
  }
  return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}

const TEMPLATE_TONES = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-violet-50 text-violet-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-600",
];

/* ─── Summary stats ─────────────────────────────────────────────────── */
// Total/active agent counts plus total calls and total call duration across
// every agent's call history (GET /api/agent-stats/summary -- one aggregate
// query server-side rather than paging every agent's call list).
function SummaryStats({ agents, activeAgent, callStats, loading }) {
  const active = activeAgent ? agents.find(a => String(a.id) === String(activeAgent.id)) : null;
  const newest = agents.reduce((best, a) => {
    const t = Date.parse(a.createdAt);
    return !best || (t && t > Date.parse(best.createdAt)) ? a : best;
  }, null);

  const statsLoading = loading || callStats.status === "loading";
  const statsFailed = callStats.status === "error";
  const totalCalls = callStats.data?.total_calls ?? 0;
  const totalSeconds = callStats.data?.total_duration_seconds ?? 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        label="Total agents"
        value={agents.length}
        hint={newest ? `Latest: ${newest.name}` : "None yet"}
        loading={loading}
        icon={<GridIcon />}
      />
      <StatCard
        label="Active now"
        value={active ? 1 : 0}
        hint={active ? active.name : "None — activate one below"}
        tone={active ? "live" : "default"}
        loading={loading}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
      />
      <StatCard
        label="Total calls"
        value={statsFailed ? null : totalCalls}
        hint={statsFailed ? "Call stats unavailable" : totalCalls === 0 ? "No calls yet" : "Across all agents"}
        loading={statsLoading}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.42 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6 6l.78-.85a2 2 0 0 1 2.1-.45c.907.34 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z" /></svg>}
      />
      <StatCard
        label="Total call time"
        value={statsFailed ? null : formatDuration(totalSeconds)}
        hint={
          statsFailed
            ? "Call stats unavailable"
            : totalCalls === 0
              ? "No calls yet"
              : `Avg ${formatDuration(totalSeconds / totalCalls)} per call`
        }
        loading={statsLoading}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>}
      />
    </div>
  );
}

/* ─── Skeleton grid while agents load ───────────────────────────────── */
function SkeletonCards() {
  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <Card key={i} className="p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </Card>
      ))}
    </div>
  );
}

/* ─── Create Agent tile -- dashed, always first in the grid ─────────── */
function CreateAgentCard({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full h-full min-h-[220px] rounded-2xl border-2 border-dashed border-slate-300 bg-white/40 hover:border-blue-400 hover:bg-blue-50/50 transition-colors duration-200 flex flex-col items-center justify-center gap-3 p-6"
    >
      <span className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-colors duration-200" aria-hidden="true">
        <PlusIcon size={22} />
      </span>
      <span className="text-sm font-semibold text-slate-600 group-hover:text-blue-700 transition-colors">Create an agent</span>
      <span className="text-xs text-slate-500 text-center">Set up a new ASR → LLM → TTS pipeline</span>
    </button>
  );
}

/* ─── Template cards (from the catalog's LLM prompts) ───────────────── */
function TemplateCard({ template, index, onPick }) {
  const preview = template.prompt?.replace(/\s+/g, " ").trim();
  return (
    <button
      type="button"
      onClick={() => onPick(template.name)}
      className="group text-left flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition"
    >
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TEMPLATE_TONES[index % TEMPLATE_TONES.length]}`}>
          <TemplateIcon name={template.name} />
        </span>
        <span className="text-sm font-semibold text-slate-900 leading-tight">{template.name}</span>
      </div>
      {preview && <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{preview}</p>}
      <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 group-hover:text-blue-700">
        Use this template <ArrowIcon />
      </span>
    </button>
  );
}

function TemplateGrid({ templates, onPick }) {
  if (templates.status === "loading") {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
      </div>
    );
  }
  if (templates.status === "error" || templates.items.length === 0) {
    return (
      <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
        {templates.status === "error"
          ? "Templates couldn't be loaded right now — you can still start from scratch."
          : "No templates are available yet — start from scratch instead."}
      </p>
    );
  }
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      {templates.items.map((t, i) => <TemplateCard key={t.name} template={t} index={i} onPick={onPick} />)}
    </div>
  );
}

/* ─── First-run panel (zero agents) ─────────────────────────────────── */
const STEPS = [
  { title: "Pick a template", body: "Start from a ready-made system prompt, or from scratch." },
  { title: "Configure ASR → LLM → TTS", body: "Choose how your agent listens, thinks and speaks." },
  { title: "Talk to it", body: "Activate the agent and start a call to try it out." },
];

function FirstRun({ templates, onPickTemplate, onCreate }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-100 bg-gradient-to-br from-blue-50/80 via-white to-white">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Welcome</p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Create your first voice agent</h2>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
              A voice agent turns speech into text (ASR), decides what to say with a language model (LLM), and speaks
              the reply (TTS). You can set one up in three steps.
            </p>
          </div>
          <Button size="lg" onClick={onCreate} className="w-full sm:w-auto">
            <PlusIcon /> Start from scratch
          </Button>
        </div>

        <ol className="mt-6 grid gap-3 grid-cols-1 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3 rounded-xl bg-white border border-slate-200/70 px-4 py-3">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0" aria-hidden="true">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  <span className="sr-only">Step {i + 1}: </span>{step.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="px-5 sm:px-8 py-6">
        <SectionHeading
          title="Start from a template"
          description="Each template pre-fills the agent's system prompt. You can edit everything before creating it."
        />
        <TemplateGrid templates={templates} onPick={onPickTemplate} />
      </div>
    </Card>
  );
}

/* ─── Compact template row (when agents already exist) ──────────────── */
function TemplateRow({ templates, onPick }) {
  if (templates.status !== "ready" || templates.items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500 mr-1">Start from a template:</span>
      {templates.items.map(t => (
        <Button key={t.name} variant="secondary" size="sm" onClick={() => onPick(t.name)}>
          {t.name}
        </Button>
      ))}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // Independent of the agents fetch -- a slow/failed aggregate query never
  // blocks the agent grid; the stat tiles say why they show "—".
  const [callStats, setCallStats] = useState({ status: "loading", data: null });
  const [templates, setTemplates] = useState({ status: "loading", items: [] });

  const { activeAgent, activateAgent, deactivateAgent, error: activationError } = useAgent();
  const navigate = useNavigate();
  const sidebarCollapsed = useSidebarCollapsed();
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  useEffect(() => {
    let cancelled = false;
    async function fetchAgents() {
      try {
        const res = await fetch(AGENTS_API_URL, FETCH_OPTS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const rawAgents = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
            ? json
            : Array.isArray(json?.agents)
              ? json.agents
              : [];

        const normalizedAgents = rawAgents.map((agent, index) => ({
          id: agent?.id ?? agent?.agent_id ?? agent?.name ?? `${index}`,
          name: agent?.name ?? agent?.agent_name ?? "Unnamed Agent",
          asrModel: agent?.asr_provider_name ?? agent?.asrModel ?? agent?.asr ?? "—",
          llmModel: agent?.llm_provider_name ?? agent?.llmModel ?? agent?.llm ?? "—",
          ttsModel: agent?.tts_provider_name ?? agent?.ttsModel ?? agent?.tts ?? "—",
          createdAt: agent?.created_at ?? agent?.createdAt ?? new Date().toISOString(),
          ...agent,
        }));

        if (!cancelled) setAgents(normalizedAgents);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load agents.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAgents();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    fetch(CALL_STATS_API_URL, FETCH_OPTS)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => { if (!cancelled) setCallStats({ status: "ready", data }); })
      .catch(() => { if (!cancelled) setCallStats({ status: "error", data: null }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Prompt catalog (public endpoint) -> template cards.
  useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_API_URL, FETCH_OPTS)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const items = (data?.llm?.prompts ?? []).filter(p => p?.name);
        if (!cancelled) setTemplates({ status: "ready", items });
      })
      .catch(() => { if (!cancelled) setTemplates({ status: "error", items: [] }); });
    return () => { cancelled = true; };
  }, []);

  function retry() {
    setError("");
    setLoading(true);
    setCallStats({ status: "loading", data: null });
    setReloadKey(k => k + 1);
  }

  function handleCardClick(agent) {
    navigate(`/detail/${agent.id ?? agent.name}`);
  }

  async function handleActivate(agent) {
    await activateAgent(agent, navigate);
  }

  function handleCreateAgent() {
    navigate("/create");
  }

  function handlePickTemplate(name) {
    navigate(templateHref(name));
  }

  const isFirstRun = !loading && !error && agents.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 lg:pl-[var(--sidebar-w)]" style={{ "--sidebar-w": `${sidebarWidth}px` }}>
      <Sidebar />
      <PageHero crumbs={["Agents"]}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center" aria-hidden="true">
            <GridIcon size={24} stroke="white" />
          </div>
          <div>
            <p className="text-white/80 text-xs font-semibold tracking-widest uppercase">Your workspace</p>
            <h1 className="font-sans font-semibold tracking-tight text-3xl sm:text-4xl text-white leading-tight">Agents</h1>
          </div>
        </div>
        <p className="text-white/90 text-sm leading-relaxed max-w-xl">
          All of your voice agents in one place — create, activate and open them from here.
        </p>
      </PageHero>

      {/* ── Content area ── */}
      <main className="flex-1 flex flex-col gap-6 px-4 sm:px-6 py-6 sm:py-8 w-full min-w-0">
        {activationError && (
          <ErrorState title="Couldn't change the active agent" message={activationError} />
        )}

        {error && (
          <ErrorState title="Couldn't load your agents" message={error} onRetry={retry} />
        )}

        {isFirstRun && (
          <FirstRun templates={templates} onPickTemplate={handlePickTemplate} onCreate={handleCreateAgent} />
        )}

        {(loading || agents.length > 0) && !isFirstRun && (
          <>
            <SummaryStats agents={agents} activeAgent={activeAgent} callStats={callStats} loading={loading} />

            <section aria-labelledby="your-agents-heading" className="flex flex-col gap-4">
              <SectionHeading
                className="!mb-0"
                icon={<GridIcon />}
                title={<span id="your-agents-heading">Your Agents</span>}
                description="Open an agent to see its details, or activate one to take calls."
                action={
                  <Button size="sm" onClick={handleCreateAgent} aria-label="Create a new agent">
                    <PlusIcon size={12} /> <span className="hidden sm:inline">New agent</span>
                  </Button>
                }
              />

              {!loading && <TemplateRow templates={templates} onPick={handlePickTemplate} />}

              {loading ? (
                <SkeletonCards />
              ) : (
                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                  <CreateAgentCard onClick={handleCreateAgent} />
                  {agents.map((agent, i) => (
                    <AgentCard
                      key={agent.id ?? agent.name ?? i}
                      agent={agent}
                      isActive={Boolean(activeAgent) && String(activeAgent.id) === String(agent.id)}
                      onClick={() => handleCardClick(agent)}
                      onActivate={handleActivate}
                      onDeactivate={deactivateAgent}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
