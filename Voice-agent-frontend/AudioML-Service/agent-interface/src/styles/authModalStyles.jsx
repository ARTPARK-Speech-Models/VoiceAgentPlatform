// Styles for AuthModal.jsx. Header uses the vaani.iisc.ac.in blue band
// (brand blue #2563eb -> #1d4ed8 with soft sky/violet glows); the sign-in
// button itself is the shared ui.jsx Button. Font is the app-wide Inter.
export const MODAL_STYLES = `
  @keyframes modal-zoom-in {
    from { opacity: 0; transform: scale(0.94) translateY(10px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }
  @keyframes modal-zoom-out {
    from { opacity: 1; transform: scale(1)    translateY(0); }
    to   { opacity: 0; transform: scale(0.94) translateY(10px); }
  }
  @keyframes backdrop-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes backdrop-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-7px); }
    40%     { transform: translateX(7px); }
    60%     { transform: translateX(-5px); }
    80%     { transform: translateX(5px); }
  }
  @keyframes success-pop {
    0%   { transform: scale(0); opacity: 0; }
    60%  { transform: scale(1.12); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes dot-bounce {
    0%,80%,100% { transform: translateY(0); opacity: .5; }
    40%         { transform: translateY(-5px); opacity: 1; }
  }

  .am-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    animation: backdrop-in .2s ease forwards;
  }
  .am-backdrop.closing { animation: backdrop-out .2s ease forwards; }
  .am-blur-layer {
    position: absolute;
    inset: 0;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    background: rgba(15, 23, 42, 0.5);
  }

  .am-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 400px;
    background: #ffffff;
    border-radius: 20px;
    box-shadow: 0 24px 60px rgba(15,23,42,.25), 0 6px 20px rgba(15,23,42,.1);
    overflow: hidden;
    animation: modal-zoom-in .26s cubic-bezier(0.34,1.2,0.64,1) forwards;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  }
  .am-card.closing { animation: modal-zoom-out .2s ease forwards; }
  .am-card.shake   { animation: shake 0.42s ease; }

  /* ── Header: blue band ── */
  .am-header {
    position: relative;
    padding: 28px 28px 24px;
    text-align: center;
    color: #fff;
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  }
  .am-header-glow {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 90% at 0% 0%, rgba(56,189,248,.4) 0%, transparent 65%),
      radial-gradient(ellipse 60% 90% at 100% 100%, rgba(139,92,246,.4) 0%, transparent 65%);
    pointer-events: none;
  }
  .am-logo {
    position: relative;
    width: 60px; height: 60px;
    margin: 0 auto 14px;
    border-radius: 18px;
    background: #fff;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 8px 22px rgba(15,23,42,.22);
  }
  .am-logo img { width: 78%; height: 78%; object-fit: contain; }

  .am-title {
    position: relative;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #fff;
    margin: 0 0 4px;
  }
  .am-subtitle {
    position: relative;
    font-size: 13.5px;
    color: rgba(255,255,255,.88);
    margin: 0;
  }

  /* ── Close button ── */
  .am-close {
    position: absolute;
    top: 12px; right: 12px;
    width: 34px; height: 34px;
    border-radius: 9999px;
    border: 1px solid rgba(255,255,255,.3);
    background: rgba(255,255,255,.12);
    color: #fff;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
    z-index: 2;
  }
  .am-close:hover { background: rgba(255,255,255,.24); }

  /* ── Body ── */
  .am-body { padding: 24px 24px 22px; }

  /* ── Error banner ── */
  .am-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    padding: 11px 14px;
    font-size: 13px;
    color: #b91c1c;
    margin-bottom: 16px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    line-height: 1.5;
  }
  .am-error-icon { flex-shrink: 0; margin-top: 1px; }

  /* ── Loading dots (on the white sign-in button) ── */
  .am-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #2563eb;
    display: inline-block;
  }
  .am-dot:nth-child(1) { animation: dot-bounce .9s ease-in-out infinite 0s; }
  .am-dot:nth-child(2) { animation: dot-bounce .9s ease-in-out infinite .15s; }
  .am-dot:nth-child(3) { animation: dot-bounce .9s ease-in-out infinite .3s; }

  /* ── Success state ── */
  .am-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 8px 0 4px;
    text-align: center;
  }
  .am-success-icon {
    width: 54px; height: 54px;
    border-radius: 50%;
    background: #059669;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 18px rgba(5,150,105,.3);
    animation: success-pop .4s cubic-bezier(.34,1.56,.64,1) forwards;
  }
  .am-success-title { font-size: 18px; font-weight: 600; color: #0f172a; margin: 0; }
  .am-success-sub   { font-size: 13px; color: #64748b; margin: 0; }

  /* ── Footer note ── */
  .am-footer-note {
    text-align: center;
    font-size: 12.5px;
    line-height: 1.5;
    color: #64748b;
    margin: 14px 0 0;
  }
`;
