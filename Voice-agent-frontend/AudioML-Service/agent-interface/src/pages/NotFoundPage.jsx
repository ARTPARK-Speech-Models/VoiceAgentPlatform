import { useLocation, useNavigate } from "react-router-dom";
import { useAgent } from "../context/AgentContext";
import { Button, Card } from "../components/ui";

// Catch-all route (App.jsx `path="*"`). Signed-in users are sent back to the
// agent hub; everyone else to the public landing page.
export default function NotFoundPage() {
  const { isVerified } = useAgent();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const home = isVerified ? "/agents" : "/";
  const homeLabel = isVerified ? "Back to Agents" : "Back to home";

  return (
    <main className="relative isolate min-h-screen flex flex-col items-center justify-center bg-slate-50 font-sans px-4 py-12 text-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 20%, rgba(37,99,235,.08) 0%, transparent 70%), radial-gradient(ellipse 30% 30% at 85% 80%, rgba(139,92,246,.06) 0%, transparent 70%)",
        }}
      />

      <img src="/vaanilogo.webp" alt="SamVaani" className="w-14 h-14 object-contain mb-8" />

      <Card className="w-full max-w-md px-6 py-10 sm:px-10">
        <p className="text-6xl sm:text-7xl font-semibold tracking-tight text-blue-600 tabular-nums">404</p>
        <h1 className="mt-4 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          We couldn&apos;t find anything at{" "}
          <code className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[13px] break-all">{pathname}</code>.
          It may have moved, or the link may be mistyped.
        </p>
        <div className="mt-7 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => navigate(-1)}>Go back</Button>
          <Button onClick={() => navigate(home, { replace: true })}>{homeLabel}</Button>
        </div>
      </Card>
    </main>
  );
}
