export const keyframes = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap');

  @keyframes shimmer-ring-1 {
    0%,100%{transform:scale(1);opacity:.65}50%{transform:scale(1.2);opacity:.25}
  }
  @keyframes shimmer-ring-2 {
    0%,100%{transform:scale(1);opacity:.45}50%{transform:scale(1.38);opacity:.12}
  }
  @keyframes shimmer-ring-3 {
    0%,100%{transform:scale(1);opacity:.25}50%{transform:scale(1.58);opacity:.06}
  }
  @keyframes blob-morph {
    0%,100%{border-radius:60% 40% 30% 70%/60% 30% 70% 40%}
    25%{border-radius:30% 60% 70% 40%/50% 60% 30% 60%}
    50%{border-radius:50% 60% 30% 40%/40% 40% 60% 50%}
    75%{border-radius:40% 30% 60% 70%/60% 50% 40% 30%}
  }
  @keyframes spin {
    from{transform:rotate(0deg)}to{transform:rotate(360deg)}
  }
  @keyframes idle-float {
    0%,100%{transform:translateY(0) scale(1);opacity:.55}
    50%{transform:translateY(-7px) scale(1.05);opacity:1}
  }
  @keyframes wave-bar {
    0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}
  }
  @keyframes fade-up {
    from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}
  }
  @keyframes cancel-pop {
    from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}
  }
  @keyframes hero-shimmer {
    0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}
  }
  @keyframes dot-blink {
    0%,100%{opacity:.2}50%{opacity:1}
  }

  .ring-1{animation:shimmer-ring-1 1.7s ease-in-out infinite}
  .ring-2{animation:shimmer-ring-2 1.7s ease-in-out infinite .22s}
  .ring-3{animation:shimmer-ring-3 1.7s ease-in-out infinite .44s}
  .blob-anim{animation:blob-morph 3.2s ease-in-out infinite}
  .spin-anim{animation:spin 1s linear infinite}
  .idle-float{animation:idle-float 3s ease-in-out infinite}
  .wave-1{animation:wave-bar 0.85s ease-in-out infinite 0s}
  .wave-2{animation:wave-bar 0.85s ease-in-out infinite .12s}
  .wave-3{animation:wave-bar 0.85s ease-in-out infinite .26s}
  .wave-4{animation:wave-bar 0.85s ease-in-out infinite .12s}
  .wave-5{animation:wave-bar 0.85s ease-in-out infinite 0s}
  .fade-up{animation:fade-up 0.35s ease forwards}
  .cancel-pop{animation:cancel-pop 0.22s cubic-bezier(0.34,1.56,.64,1) forwards}

  .voice-app *{box-sizing:border-box;margin:0}
  .voice-app{font-family:'Inter',sans-serif}

  .hero-bg{
    background:linear-gradient(135deg,#0d47a1 0%,#1565c0 30%,#0277bd 60%,#01579b 100%);
    background-size:200% 200%;
    animation:hero-shimmer 8s ease infinite;
  }

  .config-select{
    appearance:none;
    background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 9px center;
    border:1px solid #e2e8f0;
    border-radius:8px;
    padding:7px 28px 7px 11px;
    font-size:13px;
    font-family:'Inter',sans-serif;
    color:#334155;
    cursor:pointer;
    transition:border-color .15s,box-shadow .15s;
    width:100%;
  }
  .config-select:hover{border-color:#93c5fd}
  .config-select:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}

  .mic-btn{
    width:76px;height:76px;border-radius:50%;border:none;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    transition:transform .15s ease,filter .15s ease;
    position:relative;z-index:10;
  }
  .mic-btn:hover{filter:brightness(1.08)}
  .mic-btn:active{transform:scale(.92)}

  .cancel-x-btn{
    width:34px;height:34px;border-radius:50%;
    border:1px solid #fecaca;background:#fff;
    cursor:pointer;display:flex;align-items:center;justify-content:center;
    color:#ef4444;font-size:15px;font-weight:500;
    transition:background .15s,color .15s,border-color .15s;
    position:absolute;top:-10px;right:-10px;
  }
  .cancel-x-btn:hover{background:#fef2f2;border-color:#f87171}

  .status-pill{
    display:inline-flex;align-items:center;gap:5px;
    font-size:11.5px;font-weight:500;letter-spacing:.02em;
    padding:4px 11px;border-radius:99px;
  }
  .status-dot{width:6px;height:6px;border-radius:50%}
  .blink .status-dot{animation:dot-blink 1.2s ease-in-out infinite}

  .transcript-card{
    background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;
    padding:16px 20px;font-size:14px;line-height:1.7;color:#475569;
    width:100%;max-width:520px;
  }
`;


