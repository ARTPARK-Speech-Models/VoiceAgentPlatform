import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Suspense, lazy, useEffect, useRef } from 'react'
// Landing page ships in the main bundle (first thing most visitors see);
// every other page is its own chunk, loaded when its route is opened.
import Home from "./pages/HomePage"
const VoiceChatbot = lazy(() => import("./pages/AudioAgentPage"))
const DashboardPage = lazy(() => import("./pages/DashboardPage"))
const CallHistoryPage = lazy(() => import("./pages/CallHistoryPage"))
const EvaluationPage = lazy(() => import("./pages/EvaluationPage"))
const ModelCardsPage = lazy(() => import("./pages/ModelCardsPage"))
const SettingsPage = lazy(() => import("./pages/SettingsPage"))
const CreateVoiceAgent = lazy(() => import("./pages/CreateVoiceAgentPage"))
const CreateVoiceAgentFlow = lazy(() => import("./pages/CreateVoiceAgentFlowPage"))
const AgentInteract = lazy(() => import("./pages/CustomAgentIntraction"))
const AgentDetails = lazy(() => import("./pages/AgentDetails"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))


import { useAgent } from "./context/AgentContext"
import { useMessageBanner } from "./context/MessageBannerContext"

const ProtectedRoute = ({ element }) => {
  const { isVerified } = useAgent();
  const { showMessage } = useMessageBanner();
 
  // Guards against firing the banner more than once for the same
  // "not verified" state — without this, re-renders while isVerified
  // stays false would queue the message repeatedly.
  const hasNotifiedRef = useRef(false);
 
  useEffect(() => {
    if (isVerified === false && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      showMessage("Login to your account", "info");
    }
    if (isVerified === true) {
      // reset so a future logout on this same mounted route can notify again
      hasNotifiedRef.current = false;
    }
  }, [isVerified, showMessage]);
 
  // null = verification check still in flight (initial mount)
  if (isVerified === null) return <PageLoading />;
 
  return isVerified ? element : <Navigate to="/" replace />;
};



function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span className="w-8 h-8 rounded-full border-[3px] border-blue-100 border-t-blue-600 animate-spin" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-500">Loading…</span>
      </div>
    </div>
  );
}

// Browser-tab title per route ("Agents · SamVaani").
const PAGE_TITLES = [
  [/^\/$/, null],
  [/^\/agents/, "Agents"],
  [/^\/detail\//, "Agent details"],
  [/^\/create-flow/, "Flow builder"],
  [/^\/create/, "Create agent"],
  [/^\/call-history/, "Call history"],
  [/^\/evaluation/, "Evaluation"],
  [/^\/models/, "Models"],
  [/^\/settings/, "Settings"],
];

function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = PAGE_TITLES.find(([re]) => re.test(pathname));
    const label = match ? match[1] : "Page not found";
    document.title = label ? `${label} · SamVaani` : "SamVaani · Voice Agent Platform";
  }, [pathname]);
}

// Keyboard users: first Tab stop jumps past the sidebar/hero to the page's
// main content (the first <main>, else whatever follows the hero banner).
function SkipToContent() {
  function skip(e) {
    e.preventDefault();
    const target =
      document.querySelector("main") ||
      document.querySelector(".page-hero")?.nextElementSibling;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
    target.scrollIntoView({ block: "start" });
  }
  return (
    <a
      href="#main"
      onClick={skip}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-blue-700 focus:shadow-lg focus:ring-2 focus:ring-blue-600"
    >
      Skip to content
    </a>
  );
}

export default function App() {
  usePageTitle();


  // No global voice widget -- "Talk to voice agent" lives only on the
  // active agent's own details page (AgentDetails.jsx mounts it), so the
  // launcher always calls the agent you're looking at.

  return (
    <>
      <SkipToContent />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/first" element={<VoiceChatbot />} />
        {/* <Route path="/create" element={<CreateVoiceAgent />} /> */}
        {/* "/agents" is the single agent hub (DashboardPage.jsx). The older
            "/workspace", "/dashboard" and "/agent-dashboard" URLs all
            redirect to it. */}
        <Route path="/workspace" element={<Navigate to="/agents" replace />} />
        <Route path="/agents" element={<ProtectedRoute element={<DashboardPage />} />} />
        <Route path="/agent-dashboard" element={<Navigate to="/agents" replace />} />
        <Route path="/dashboard" element={<Navigate to="/agents" replace />} />
        <Route path="/call-history" element={<ProtectedRoute element={<CallHistoryPage />} />} />
        <Route path="/evaluation" element={<ProtectedRoute element={<EvaluationPage />} />} />
        <Route path="/models" element={<ProtectedRoute element={<ModelCardsPage />} />} />
        <Route path="/model-cards" element={<Navigate to="/models" replace />} />
        <Route path="/settings" element={<ProtectedRoute element={<SettingsPage />} />} />
        <Route path="/create" element={<ProtectedRoute element={<CreateVoiceAgent />} />} />
        <Route path="/create-flow" element={<ProtectedRoute element={<CreateVoiceAgentFlow />} />} />
        <Route path="/interact" element={<ProtectedRoute element={<AgentInteract />} />} />
        <Route path="/detail/:id" element={<ProtectedRoute element={<AgentDetails />} />} />
        {/* Anything else -> friendly 404 (keep this last). */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </>
  )
}