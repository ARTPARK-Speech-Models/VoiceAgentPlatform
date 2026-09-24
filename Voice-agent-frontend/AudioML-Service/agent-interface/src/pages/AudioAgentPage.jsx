import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Auth from "../components/Auth";
import AuthModal from "../components/AuthModal";
import VoiceInputOutput from "../components/VoiceInputOutput";
import { useAgent } from "../context/AgentContext";

export default function AudioAgentPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("login");
  const navigate = useNavigate();
  const { isVerified } = useAgent();

  const handleLoginClick = useCallback(() => {
    setModalTab("login");
    setModalOpen(true);
  }, []);

  const handleRegisterClick = useCallback(() => {
    setModalTab("register");
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    // logout handler if needed
  }, []);

  return (
    <div className="voice-app" style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <Auth onLoginClick={handleLoginClick} onRegisterClick={handleRegisterClick} onLogout={handleLogout} />
      <AuthModal isOpen={modalOpen} defaultTab={modalTab} onClose={handleModalClose} onSuccess={handleAuthSuccess} />
      
      {/* ── Hero ── */}
      <div className="hero-bg" style={{ padding: "48px 24px 44px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 50%,rgba(255,255,255,.07) 0%,transparent 60%),radial-gradient(ellipse at 80% 30%,rgba(255,255,255,.05) 0%,transparent 55%)", pointerEvents: "none" }} />
        <button
          onClick={() => navigate("/agents")}
          style={{
            position: "absolute", top: 16, left: 16,
            background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)",
            borderRadius: 99, padding: "5px 13px",
            color: "rgba(255,255,255,.8)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            fontFamily: "'Inter',sans-serif", transition: "background .15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.12)"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Dashboard
        </button> */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 99, padding: "5px 14px", marginBottom: 18 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.85)", letterSpacing: ".04em" }}>AI-Powered Voice Interface</span>
          </div>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: "clamp(28px,5vw,48px)", fontWeight: 400, color: "#fff", lineHeight: 1.18, marginBottom: 14, textShadow: "0 2px 20px rgba(0,0,0,.15)" }}>
            Speak your thoughts,<br />
            <em style={{ color: "#bfdbfe" }}>hear the future.</em>
          </h1>
          <p style={{ fontSize: "clamp(14px,2vw,16px)", color: "rgba(255,255,255,.72)", maxWidth: 420, margin: "0 auto", fontWeight: 300, lineHeight: 1.65 }}>
            A fully configurable voice pipeline — choose your ASR, LLM, and TTS models and start talking instantly.
          </p>
        </div>
      </div>

      {/* ── Create Agent Button ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "20px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", justifyContent: "center" , columnGap: 15}}>
          <button
            type="button"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 32px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 16px rgba(59, 130, 246, 0.3)",
              fontFamily: "'Inter', sans-serif",
              textTransform: "uppercase",
              letterSpacing: ".05em"
            }}
            onMouseEnter={(e) => {
              e.target.style.boxShadow = "0 6px 24px rgba(59, 130, 246, 0.4)";
              e.target.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.target.style.boxShadow = "0 4px 16px rgba(59, 130, 246, 0.3)";
              e.target.style.transform = "translateY(0)";
            }}
            onClick={() => navigate("/create")}
          >
            Create Your Own Agent
          </button>

          <button
            type="button"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 32px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 16px rgba(59, 130, 246, 0.3)",
              fontFamily: "'Inter', sans-serif",
              textTransform: "uppercase",
              letterSpacing: ".05em"
            }}
            onMouseEnter={(e) => {
              e.target.style.boxShadow = "0 6px 24px rgba(59, 130, 246, 0.4)";
              e.target.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.target.style.boxShadow = "0 4px 16px rgba(59, 130, 246, 0.3)";
              e.target.style.transform = "translateY(0)";
            }}
            onClick={() => {
                if(!isVerified) {
                    handleLoginClick();
                }
                else{
                  navigate("/agents")
                }
            }}
          >
            Choose Your Custom Agent
          </button>
        </div>
      </div>

      {/* ── Main Voice Interface ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <VoiceInputOutput defaultAgentName="default" requestPath="/for/web/get/a/job" />
      </div>
    </div>
  );
}