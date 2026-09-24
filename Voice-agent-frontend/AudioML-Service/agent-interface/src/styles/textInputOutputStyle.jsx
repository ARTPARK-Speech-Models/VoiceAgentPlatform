/* ─── Extra styles (prefixed ttc- to avoid collisions) ────────── */
export const CHAT_CSS = `
  @keyframes ttc-msg-in {
    from { opacity: 0; transform: translateY(8px) scale(.97); }
    to   { opacity: 1; transform: translateY(0)  scale(1);   }
  }
  @keyframes ttc-cursor-blink {
    0%,100% { opacity: 1; } 50% { opacity: 0; }
  }
  @keyframes ttc-thinking-dot {
    0%,80%,100% { transform: translateY(0);   opacity: .35; }
    40%         { transform: translateY(-4px); opacity: 1;   }
  }

  .ttc-msg    { animation: ttc-msg-in .28s cubic-bezier(.34,1.1,.64,1) both; }
  .ttc-cursor { display: inline-block; width: 2px; height: 1em;
                background: currentColor; margin-left: 2px; vertical-align: text-bottom;
                animation: ttc-cursor-blink .7s step-end infinite; }

  .ttc-scroll::-webkit-scrollbar       { width: 4px; }
  .ttc-scroll::-webkit-scrollbar-track { background: transparent; }
  .ttc-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }

  .ttc-textarea::-webkit-scrollbar       { width: 3px; }
  .ttc-textarea::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
`;