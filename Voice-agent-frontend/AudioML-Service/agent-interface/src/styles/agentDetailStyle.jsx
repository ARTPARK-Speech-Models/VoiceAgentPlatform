// Page-specific CSS for AgentDetails that Tailwind can't express cleanly:
// keyframed entrance/modal animations, the Start/Stop engine button's
// gradient + halo states, the launching comet, the hero glass surface,
// the collapsed-prompt fade and the confirm input's match states.
// Everything else on the page is Tailwind + the shared UI kit.
export const DETAIL_CSS = `
  @keyframes agent-detail-rise  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
  @keyframes agent-detail-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes agent-detail-pop   { 0%{transform:scale(.6);opacity:0} 70%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
  @keyframes agent-detail-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
  @keyframes agent-detail-modal-in  { from{opacity:0;transform:scale(.88) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes agent-detail-modal-out { from{opacity:1;transform:scale(1) translateY(0)} to{opacity:0;transform:scale(.88) translateY(10px)} }
  @keyframes agent-detail-overlay-in { from{opacity:0} to{opacity:1} }
  @keyframes agent-detail-comet { 0%{transform:rotate(0deg) translateX(38px) rotate(0deg);opacity:1} 100%{transform:rotate(360deg) translateX(38px) rotate(-360deg);opacity:1} }
  @keyframes agent-detail-label-fade { from{opacity:0;transform:translateY(2px)} to{opacity:1;transform:translateY(0)} }
  @keyframes agent-detail-dot { 0%,100%{opacity:.35;transform:translateY(0)} 50%{opacity:1;transform:translateY(-3px)} }
  @keyframes agent-detail-shimmer { from{background-position:200% 0} to{background-position:-200% 0} }
  .agent-detail-label-fade { display:inline-block; animation:agent-detail-label-fade .18s ease both; }

  .agent-detail-page-rise  { animation: agent-detail-rise .45s cubic-bezier(.22,1,.36,1) both; }
  .agent-detail-section-rise { animation: agent-detail-rise .4s cubic-bezier(.22,1,.36,1) both; }
  .agent-detail-pop        { animation: agent-detail-pop  .3s cubic-bezier(.34,1.56,.64,1) forwards; }
  .agent-detail-shake      { animation: agent-detail-shake .4s ease; }

  .agent-detail-overlay { position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.52);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:16px;animation:agent-detail-overlay-in .2s ease; }
  .agent-detail-modal   { background:#fff;border-radius:20px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 24px 64px rgba(15,23,42,.2),0 4px 16px rgba(15,23,42,.1);animation:agent-detail-modal-in .28s cubic-bezier(.34,1.4,.64,1) forwards; }
  .agent-detail-modal.closing { animation:agent-detail-modal-out .18s ease forwards; }

  /* Solid filled circle, white symbol -- classic media-button look: green
     fill for play (idle), red fill for stop (active), each with a soft halo. */
  .agent-detail-engine-btn-idle    { background:linear-gradient(145deg,#4ade80,#16a34a);box-shadow:0 0 0 6px rgba(74,222,128,.18),0 10px 28px -6px rgba(22,163,74,.6),inset 0 1px 0 rgba(255,255,255,.35); }
  .agent-detail-engine-btn-running { background:linear-gradient(145deg,#cbd5e1,#94a3b8);box-shadow:0 0 0 6px rgba(255,255,255,.12),0 10px 28px -8px rgba(15,23,42,.45); }
  .agent-detail-engine-btn-success { background:linear-gradient(145deg,#f87171,#dc2626);box-shadow:0 0 0 6px rgba(248,113,113,.2),0 10px 28px -6px rgba(220,38,38,.6),inset 0 1px 0 rgba(255,255,255,.3); }
  /* Stop's armed-confirm state (issue #37) -- a visible pulse, so the
     "one more click actually stops it" window reads as active. */
  @keyframes agent-detail-confirm-pulse { 0%,100% { box-shadow:0 10px 28px -6px rgba(220,38,38,.6),0 0 0 0 rgba(239,68,68,.55); } 50% { box-shadow:0 10px 28px -6px rgba(220,38,38,.6),0 0 0 12px rgba(239,68,68,0); } }
  .agent-detail-engine-btn-confirm { animation:agent-detail-confirm-pulse 1s ease-in-out infinite; }
  .agent-detail-engine-btn { width:84px;height:84px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:filter .15s,transform .15s,box-shadow .2s;position:relative;z-index:1;box-sizing:border-box; }
  .agent-detail-engine-btn:hover:not(:disabled) { filter:brightness(1.08);transform:translateY(-1px) scale(1.03); }
  .agent-detail-engine-btn:active:not(:disabled) { transform:scale(.94); }

  /* Live-call animation around the Start/Stop button (AgentDetails'
     EngineButton): listening = wave flows IN, thinking = arc circles the
     button, speaking = wave flows OUT. Bars keep fixed positions; the peak
     travels because each bar's pulse is delayed along the row. */
  @keyframes agent-detail-eq { 0%,100%{transform:scaleY(.22);opacity:.35} 50%{transform:scaleY(1);opacity:1} }
  .agent-detail-eq-bar { width:4px;height:40px;border-radius:9999px;background:rgba(255,255,255,.9);transform-origin:center;animation:agent-detail-eq 1.05s ease-in-out infinite;box-shadow:0 0 8px rgba(255,255,255,.35); }
  .agent-detail-eq-bar-wide { background:rgba(219,234,254,.95);box-shadow:none; }
  @keyframes agent-detail-ring-in  { 0%{transform:scale(1.85);opacity:0} 35%{opacity:.55} 100%{transform:scale(1);opacity:0} }
  @keyframes agent-detail-ring-out { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(1.95);opacity:0} }
  .agent-detail-ring { position:absolute;inset:8px;border-radius:9999px;border:2px solid rgba(255,255,255,.75);pointer-events:none; }
  .agent-detail-ring-in  { animation:agent-detail-ring-in 1.6s ease-in infinite; }
  .agent-detail-ring-out { animation:agent-detail-ring-out 1.6s ease-out infinite; }
  .agent-detail-think-ring { position:absolute;inset:-2px;border-radius:9999px;pointer-events:none;
    background:conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0) 150deg, rgba(186,230,253,.9) 300deg, #fff 360deg);
    -webkit-mask:radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
            mask:radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
    animation:agent-detail-spin 1.1s linear infinite;filter:drop-shadow(0 0 6px rgba(186,230,253,.8)); }
  @keyframes agent-detail-orbit { from{transform:rotate(0deg) translateX(52px)} to{transform:rotate(-360deg) translateX(52px)} }
  .agent-detail-orbit-dot { position:absolute;top:50%;left:50%;width:8px;height:8px;margin:-4px;border-radius:9999px;background:#e0f2fe;box-shadow:0 0 10px #bae6fd;animation:agent-detail-orbit 1.6s linear infinite; }
  @keyframes agent-detail-breathe { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:.8;transform:scale(1.12)} }
  .agent-detail-breathe { position:absolute;inset:8px;border-radius:9999px;border:2px solid rgba(255,255,255,.6);animation:agent-detail-breathe 1.4s ease-in-out infinite;pointer-events:none; }

  .agent-detail-comet-ring { position:absolute;width:100px;height:100px;border-radius:50%;pointer-events:none; }
  .agent-detail-comet-ring::before { content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:rgba(99,102,241,.85);top:50%;left:50%;margin:-7px;animation:agent-detail-comet 1s linear infinite; }

  .agent-detail-dot1,.agent-detail-dot2,.agent-detail-dot3 { border-radius:50%;background:rgba(255,255,255,.9);display:inline-block;width:9px;height:9px; }
  .agent-detail-dot1 { animation:agent-detail-dot 1s ease-in-out infinite 0s; }
  .agent-detail-dot2 { animation:agent-detail-dot 1s ease-in-out infinite .18s; }
  .agent-detail-dot3 { animation:agent-detail-dot 1s ease-in-out infinite .36s; }

  .agent-detail-glass { background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 12px 32px -16px rgba(2,6,23,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px); }

  /* 3 lines at 14.5px / 1.65 (issue #34), with a fade into the card. */
  .agent-detail-prompt-text.collapsed { max-height:44px; }
  .agent-detail-prompt-text.collapsed::after { content:'';position:absolute;bottom:0;left:0;right:0;height:22px;background:linear-gradient(180deg,rgba(255,255,255,0),#fff); }

  .agent-detail-confirm-input { width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15.5px;color:#0f172a;background:#f8fafc;outline:none;transition:border-color .15s,box-shadow .15s; }
  .agent-detail-confirm-input:focus { border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.12);background:#fff; }
  .agent-detail-confirm-input.match { border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.1);background:#fff; }

  .agent-detail-skeleton { background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:agent-detail-shimmer 1.4s linear infinite;border-radius:8px; }
  .agent-detail-skeleton-dark { background:linear-gradient(90deg,rgba(255,255,255,.08) 25%,rgba(255,255,255,.18) 50%,rgba(255,255,255,.08) 75%);background-size:200% 100%;animation:agent-detail-shimmer 1.4s linear infinite;border-radius:8px; }
`;
