/**
 * HomePage.jsx -- public landing page ("/").
 *
 * Visual language follows vaani.iisc.ac.in: a light hero (near-white
 * background, navy headline, key phrase in brand blue with a hand-drawn
 * swoosh underneath, slate body copy), then a vivid blue band with soft
 * sky/violet glows holding the feature cards. No <Navbar /> -- this page
 * owns its own auth CTAs (Get Started / Login, or Dashboard once verified).
 *
 * Requirements: <AgentProvider> above this in the tree (useAgent() for
 * isVerified + verifySession); AuthModal, same one Sidebar/Navbar use.
 */

import { Fragment, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAgent } from "../context/AgentContext";
import AuthModal from "../components/AuthModal";
import { Button } from "../components/ui";

/* ─── Rotating headline phrase ───────────────────────────────────────── */
// "Build voice agents that <phrase>" -- each one maps to something the
// platform does today (real-time pipeline, Indic ASR, per-agent config).
const PHRASES = ["respond in real time", "understand Indic speech", "you fully control"];
const CYCLE_MS = 3800;

/* ─── Keyframes, injected once at module load (never from an effect) ── */
if (typeof document !== "undefined" && !document.getElementById("home-keyframes-v3")) {
  const el = document.createElement("style");
  el.id = "home-keyframes-v3";
  el.textContent = `
    @keyframes home-phrase {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .home-phrase { animation: home-phrase .45s ease backwards; }
    @keyframes home-rise {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .home-rise { animation: home-rise .6s ease backwards; }
    @keyframes home-swoosh {
      from { stroke-dashoffset: 240; }
      to   { stroke-dashoffset: 0; }
    }
    .home-swoosh path { stroke-dasharray: 240; animation: home-swoosh .8s .15s ease-out backwards; }
    /* Reduced motion: no entrance animation at all -- content is simply there. */
    @media (prefers-reduced-motion: reduce) {
      .home-phrase, .home-rise, .home-swoosh path { animation: none !important; }
    }
  `;
  document.head.appendChild(el);
}

const cx = (...parts) => parts.filter(Boolean).join(" ");

function ArrowRight({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ─── Brand lockup (logo + name) ─────────────────────────────────────── */
function BrandLockup() {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <img src="/vaanilogo.webp" alt="" className="w-10 h-10 sm:w-11 sm:h-11 object-contain flex-shrink-0" />
      <div className="leading-tight min-w-0">
        <p className="text-slate-900 font-semibold text-[15px] sm:text-base tracking-tight">SamVaani</p>
        <p className="text-slate-500 text-[10.5px] sm:text-[11px] font-medium uppercase tracking-wider truncate">Voice Agent Platform</p>
      </div>
    </div>
  );
}

/* ─── Blue phrase with a hand-drawn swoosh underline ─────────────────── */
function SwooshPhrase({ children, animKey }) {
  return (
    <span key={animKey} className="home-phrase relative inline-block text-blue-600">
      <span className="relative z-10">{children}</span>
      <svg
        className="home-swoosh absolute left-0 -bottom-1 sm:-bottom-2 w-full h-3 sm:h-4"
        viewBox="0 0 220 16"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 11 C 50 4, 120 2, 216 8" stroke="#93c5fd" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/* ─── ASR -> LLM -> TTS pipeline visual ──────────────────────────────── */
const PIPELINE = [
  {
    label: "ASR",
    sub: "Speech → text",
    tone: "bg-sky-50 text-sky-600 ring-sky-100",
    icon: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></>,
  },
  {
    label: "LLM",
    sub: "Understands & replies",
    tone: "bg-blue-50 text-blue-600 ring-blue-100",
    icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="13" y2="13" /></>,
  },
  {
    label: "TTS",
    sub: "Text → voice",
    tone: "bg-violet-50 text-violet-600 ring-violet-100",
    icon: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>,
  },
];

function PipelineVisual() {
  return (
    <figure className="w-full max-w-2xl mx-auto rounded-2xl bg-white border border-slate-200/80 shadow-lg shadow-slate-900/[0.04] px-3 py-4 sm:px-6 sm:py-5">
      <figcaption className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3 sm:mb-4">
        How every call flows
      </figcaption>
      <ol className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-3">
        {PIPELINE.map((step, i) => (
          <Fragment key={step.label}>
            <li className="h-full min-w-0 flex flex-col items-center text-center rounded-xl bg-slate-50 border border-slate-100 px-1.5 py-3 sm:px-3">
              <span className={cx("w-9 h-9 sm:w-10 sm:h-10 rounded-xl ring-1 flex items-center justify-center mb-2", step.tone)} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{step.icon}</svg>
              </span>
              <span className="text-slate-900 text-sm font-semibold">{step.label}</span>
              <span className="text-slate-500 text-[11px] sm:text-xs leading-snug mt-0.5">{step.sub}</span>
            </li>
            {i < PIPELINE.length - 1 && (
              <li className="text-slate-400" aria-hidden="true"><ArrowRight size={14} /></li>
            )}
          </Fragment>
        ))}
      </ol>
    </figure>
  );
}

/* ─── Feature cards (what the platform actually does today) ──────────── */
const CARDS = [
  {
    title: "Build agents visually",
    desc: "Pick speech recognition, language model and voice, write the prompt, and launch — no code.",
    icon: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></>,
  },
  {
    title: "Indian-language speech",
    desc: "SraVaani speech recognition is tuned for Indic speech, so callers can talk the way they naturally do.",
    icon: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></>,
  },
  {
    title: "Compare ASR models",
    desc: "Evaluation mode runs several speech models on the same call and shows their transcripts and latency side by side.",
    icon: <><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" /></>,
  },
  {
    title: "Call analytics",
    desc: "Every call is logged with transcript, latency, tokens and cost — live while you talk, and in history after.",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  },
];

function FeatureCards() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 w-full text-left">
      {CARDS.map((card, i) => (
        <li
          key={card.title}
          className="home-rise rounded-2xl bg-white p-5 sm:p-6 shadow-xl shadow-blue-950/15 ring-1 ring-white/60 transition-transform duration-300 hover:-translate-y-1"
          style={{ animationDelay: `${0.1 + i * 0.07}s` }}
        >
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{card.icon}</svg>
          </div>
          <h3 className="text-slate-900 font-semibold text-[15px] mb-1.5">{card.title}</h3>
          <p className="text-slate-600 text-sm leading-relaxed">{card.desc}</p>
        </li>
      ))}
    </ul>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function Home() {
  const { isVerified, verifySession } = useAgent();
  const navigate = useNavigate();

  const [phraseIndex, setPhraseIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("login");

  // Rotate the highlighted phrase (subscription to a timer -- setState only
  // in the callback). Skipped entirely for reduced-motion users.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = setInterval(() => setPhraseIndex((i) => (i + 1) % PHRASES.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const openLogin = useCallback(() => { setModalTab("login"); setModalOpen(true); }, []);
  const openRegister = useCallback(() => { setModalTab("register"); setModalOpen(true); }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  const handleAuthSuccess = useCallback(async () => {
    await verifySession();
    setModalOpen(false);
    // "/agents" is the agent hub (stats, create, activate).
    navigate("/agents");
  }, [verifySession, navigate]);

  const goToDashboard = useCallback(() => navigate("/agents"), [navigate]);

  return (
    <div className="relative isolate min-h-screen w-full flex flex-col bg-slate-50 text-slate-900 font-sans overflow-x-hidden">
      {/* soft brand glow behind the nav + hero (one layer, so no seam) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1100px] -z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 22%, rgba(37,99,235,.09) 0%, transparent 70%), radial-gradient(ellipse 35% 30% at 85% 60%, rgba(139,92,246,.06) 0%, transparent 70%), radial-gradient(ellipse 35% 30% at 12% 65%, rgba(56,189,248,.07) 0%, transparent 70%)",
        }}
      />

      {/* ── Top nav ── */}
      <header className="relative z-20 w-full">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 h-16 sm:h-20">
          <BrandLockup />
          {isVerified ? (
            <Button variant="secondary" size="md" onClick={goToDashboard}>
              Dashboard <ArrowRight size={14} />
            </Button>
          ) : (
            <Button variant="secondary" size="md" onClick={openLogin}>Login</Button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* ── Light hero ── */}
        <section className="relative z-10 px-4 sm:px-6 pt-6 sm:pt-12 pb-14 sm:pb-20 text-center" aria-labelledby="home-title">
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            <div className="home-rise w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white shadow-xl shadow-blue-900/10 ring-1 ring-slate-200/80 flex items-center justify-center">
              <img src="/vaanilogo.webp" alt="Vaani logo" className="w-[78%] h-[78%] object-contain" />
            </div>

            <p className="home-rise mt-6 inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-xs font-semibold text-blue-700" style={{ animationDelay: ".05s" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" aria-hidden="true" />
              SamVaani · Voice Agent Platform
            </p>

            <h1
              id="home-title"
              className="home-rise mt-5 text-slate-900 font-semibold tracking-tight leading-[1.1] text-[34px] sm:text-5xl lg:text-6xl"
              style={{ animationDelay: ".08s" }}
            >
              <span className="sr-only">Build voice agents that respond in real time, understand Indic speech, and that you fully control.</span>
              <span aria-hidden="true">
                Build voice agents that
                <span className="block mt-1 sm:mt-2 min-h-[2.3em] sm:min-h-[1.2em]">
                  <SwooshPhrase animKey={phraseIndex}>{PHRASES[phraseIndex]}</SwooshPhrase>
                </span>
              </span>
            </h1>

            <p className="home-rise mt-3 sm:mt-5 max-w-2xl text-slate-600 text-base sm:text-lg leading-relaxed" style={{ animationDelay: ".12s" }}>
              Pick speech recognition, a language model and a voice, write the prompt, and launch — no code.
              Every call is logged with its transcript and latency.
            </p>

            <div className="home-rise mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full sm:w-auto" style={{ animationDelay: ".16s" }}>
              {isVerified ? (
                <Button size="lg" onClick={goToDashboard} className="px-7">
                  Go to Dashboard <ArrowRight />
                </Button>
              ) : (
                <>
                  <Button size="lg" onClick={openRegister} className="px-7">
                    Get Started <ArrowRight />
                  </Button>
                  <Button size="lg" variant="secondary" onClick={openLogin} className="px-7">Login</Button>
                </>
              )}
            </div>

            <div className="home-rise mt-12 sm:mt-14 w-full" style={{ animationDelay: ".2s" }}>
              <PipelineVisual />
            </div>
          </div>
        </section>

        {/* ── Blue band: feature cards ── */}
        <section className="relative isolate overflow-hidden bg-blue-600 text-white" aria-labelledby="home-features-title">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(ellipse 50% 60% at 8% 10%, rgba(56,189,248,.45) 0%, transparent 65%), radial-gradient(ellipse 50% 60% at 95% 95%, rgba(139,92,246,.45) 0%, transparent 65%), linear-gradient(160deg, #2563eb 0%, #1d4ed8 100%)",
            }}
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/85">What you can do today</p>
            <h2 id="home-features-title" className="mt-3 text-2xl sm:text-4xl font-semibold tracking-tight">
              Build, test and monitor voice agents in one place
            </h2>
            <p className="mt-3 mx-auto max-w-2xl text-white/85 text-sm sm:text-base leading-relaxed">
              From the first prompt to the hundredth call — configure the pipeline, talk to your agent, and compare how speech models perform.
            </p>

            <div className="mt-10 sm:mt-12">
              <FeatureCards />
            </div>

            {/* closing CTA card */}
            <div className="mt-10 sm:mt-12 mx-auto max-w-3xl rounded-2xl bg-white text-left shadow-xl shadow-blue-950/20 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-semibold text-lg">
                  {isVerified ? "Your workspace is ready" : "Ready to build your first agent?"}
                </p>
                <p className="text-slate-600 text-sm mt-1 leading-relaxed">
                  {isVerified
                    ? "Pick up where you left off — your agents, calls and settings are on the dashboard."
                    : "Sign in with Google — a new account is created automatically."}
                </p>
              </div>
              {isVerified ? (
                <Button size="lg" onClick={goToDashboard} className="px-6">Go to Dashboard <ArrowRight /></Button>
              ) : (
                <Button size="lg" onClick={openRegister} className="px-6">Get Started <ArrowRight /></Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <div className="flex items-center gap-2">
            <img src="/vaanilogo.webp" alt="" className="w-7 h-7 object-contain" />
            <span className="text-slate-700 text-sm font-semibold">SamVaani</span>
          </div>
          <p className="text-slate-500 text-xs">Voice Agent Platform · ASR → LLM → TTS</p>
        </div>
      </footer>

      <AuthModal
        isOpen={modalOpen}
        defaultTab={modalTab}
        onClose={closeModal}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
