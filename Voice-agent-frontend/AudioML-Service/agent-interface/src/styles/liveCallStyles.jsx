/* ─── Styles ────────────────────────────────────────────────────── */
export const LC_CSS = `
  @keyframes lc-ring-1   { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.22);opacity:.2} }
  @keyframes lc-ring-2   { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.42);opacity:.1} }
  @keyframes lc-ring-3   { 0%,100%{transform:scale(1);opacity:.2} 50%{transform:scale(1.62);opacity:.05} }
  @keyframes lc-blob     { 0%,100%{border-radius:60% 40% 30% 70%/60% 30% 70% 40%} 25%{border-radius:30% 60% 70% 40%/50% 60% 30% 60%} 50%{border-radius:50% 60% 30% 40%/40% 40% 60% 50%} 75%{border-radius:40% 30% 60% 70%/60% 50% 40% 30%} }
  @keyframes lc-bar      { 0%,100%{transform:scaleY(.18)} 50%{transform:scaleY(1)} }
  @keyframes lc-idle     { 0%,100%{opacity:.45;transform:scale(1)} 50%{opacity:.9;transform:scale(1.04)} }
  @keyframes lc-card-in  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lc-char-in  { from{opacity:0} to{opacity:1} }
  @keyframes lc-dot      { 0%,100%{transform:translateY(0);opacity:.3} 50%{transform:translateY(-5px);opacity:1} }
  @keyframes lc-status   { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lc-comet    { 0%{transform:rotate(0deg) translateX(32px) rotate(0deg)} 100%{transform:rotate(360deg) translateX(32px) rotate(-360deg)} }
  @keyframes lc-fade-in  { from{opacity:0} to{opacity:1} }
  @keyframes lc-speaking-glow { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.4)} 50%{box-shadow:0 0 0 14px rgba(34,197,94,0)} }

  .lc-ring-1 { animation:lc-ring-1 1.8s ease-in-out infinite; }
  .lc-ring-2 { animation:lc-ring-2 1.8s ease-in-out infinite .22s; }
  .lc-ring-3 { animation:lc-ring-3 1.8s ease-in-out infinite .44s; }
  .lc-blob   { animation:lc-blob   3.4s ease-in-out infinite; }
  .lc-bar-1  { animation:lc-bar .8s ease-in-out infinite 0s; }
  .lc-bar-2  { animation:lc-bar .8s ease-in-out infinite .12s; }
  .lc-bar-3  { animation:lc-bar .8s ease-in-out infinite .25s; }
  .lc-bar-4  { animation:lc-bar .8s ease-in-out infinite .12s; }
  .lc-bar-5  { animation:lc-bar .8s ease-in-out infinite 0s; }
  .lc-dot-1  { animation:lc-dot .9s ease-in-out infinite 0s; }
  .lc-dot-2  { animation:lc-dot .9s ease-in-out infinite .18s; }
  .lc-dot-3  { animation:lc-dot .9s ease-in-out infinite .36s; }
  .lc-idle   { animation:lc-idle 2.8s ease-in-out infinite; }
  .lc-card-in { animation:lc-card-in .28s cubic-bezier(.22,1,.36,1) forwards; }
  .lc-status { animation:lc-status .22s ease; }
  .lc-fade   { animation:lc-fade-in .3s ease; }
  .lc-speaking-glow { animation:lc-speaking-glow 1.4s ease-in-out infinite; }

  .lc-scroll::-webkit-scrollbar { width:4px; height:4px; }
  .lc-scroll::-webkit-scrollbar-track { background:transparent; }
  .lc-scroll::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:99px; }
  .lc-scroll::-webkit-scrollbar-thumb:hover { background:#cbd5e1; }

  .lc-call-btn {
    height:46px; padding:0 28px; border-radius:14px; border:none;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:600;
    cursor:pointer; display:inline-flex; align-items:center; gap:9px;
    transition:filter .15s, transform .1s, box-shadow .15s;
  }
  .lc-call-btn:hover:not(:disabled) { filter:brightness(1.08); }
  .lc-call-btn:active:not(:disabled) { transform:scale(.96); }
  .lc-call-btn:disabled { opacity:.5; cursor:not-allowed; filter:none; }

  .lc-end-btn {
    height:46px; padding:0 28px; border-radius:14px;
    border:1.5px solid #fecaca;
    background:#fff; color:#dc2626;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:600;
    cursor:pointer; display:inline-flex; align-items:center; gap:9px;
    transition:background .15s, transform .1s;
  }
  .lc-end-btn:hover { background:#fef2f2; }
  .lc-end-btn:active { transform:scale(.96); }

  .lc-msg-char { animation:lc-char-in .06s ease both; display:inline; }

  .lc-card {
    background:#fff;
    border:1px solid #e2e8f0;
    border-radius:14px;
    box-shadow:0 2px 12px rgba(0,0,0,.05);
    overflow:hidden;
  }
  .lc-card-header {
    padding:9px 14px;
    border-bottom:1px solid #f1f5f9;
    background:#f8fafc;
    display:flex; align-items:center; justify-content:space-between;
  }
  .lc-card-body {
    padding:13px 15px;
    font-size:14px; line-height:1.75;
    color:#334155;
    font-family:'Inter',sans-serif;
    word-break:break-word;
    white-space:pre-wrap;
    overflow-x:auto;
    max-width:100%;
  }
  .lc-streaming-cursor {
    display:inline-block; width:2px; height:1em;
    background:#3b82f6; border-radius:1px;
    margin-left:2px; vertical-align:text-bottom;
    animation:lc-bar .7s ease-in-out infinite;
  }
`;