import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { baseURL } from "../url";
import { decodeTo16kMono, MAX_SECONDS } from "../utils/audioDecode";

// "Try it" pop-up for an ASR model on the Models page. Design follows the
// SraVaani Transcribe demo: aurora + grid backdrop, a glass "stage" with a
// status pill, a big word-by-word transcript, a mirrored frequency
// visualizer and a central mic orb whose halo follows your voice; metrics
// and a session history below. Record (Space toggles) or drop/choose a file
// -- transcription starts automatically. Audio is decoded in the browser to
// what POST /api/asr/inference expects (float32 PCM, mono, 16 kHz).

const INFERENCE_URL = baseURL + "api/asr/inference";
const MAX_UPLOAD_MB = 25;
const LANGUAGES = [
  "हिन्दी", "ಕನ್ನಡ", "தமிழ்", "తెలుగు", "বাংলা", "मराठी", "ગુજરાતી", "ਪੰਜਾਬੀ", "മലയാളം",
  "ଓଡ଼ିଆ", "অসমীয়া", "नेपाली", "मैथिली", "भोजपुरी", "English",
];

const CSS = `
.asrt-aurora{position:absolute;inset:-30% -10% auto;height:80%;pointer-events:none;z-index:0;
  background:radial-gradient(38% 50% at 18% 32%,rgba(37,99,235,.18),transparent 70%),radial-gradient(34% 46% at 78% 22%,rgba(79,70,229,.16),transparent 70%),radial-gradient(30% 40% at 50% 62%,rgba(59,130,246,.14),transparent 70%);
  filter:blur(40px);animation:asrt-drift 18s ease-in-out infinite alternate}
@keyframes asrt-drift{to{transform:translate3d(3%,3%,0) scale(1.06)}}
.asrt-grid{position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.6;
  background-image:linear-gradient(rgba(15,23,42,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.08) 1px,transparent 1px);background-size:48px 48px;
  -webkit-mask-image:radial-gradient(ellipse 70% 45% at 50% 0%,#000 25%,transparent 75%);mask-image:radial-gradient(ellipse 70% 45% at 50% 0%,#000 25%,transparent 75%)}
.asrt-glass{background:rgba(255,255,255,.86);border:1px solid rgba(15,23,42,.1);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);
  box-shadow:0 30px 60px -32px rgba(15,23,42,.25),inset 0 1px 0 rgba(255,255,255,.9)}
.asrt-grad{background:linear-gradient(90deg,#1d4ed8,#2563eb 45%,#4f46e5);-webkit-background-clip:text;background-clip:text;color:transparent}
.asrt-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.asrt-track{display:flex;gap:8px;width:max-content;animation:asrt-scroll 40s linear infinite}
@keyframes asrt-scroll{to{transform:translateX(-50%)}}
.asrt-stage{transition:border-color .4s,box-shadow .4s}
.asrt-stage.is-live{border-color:rgba(37,99,235,.38);box-shadow:0 30px 60px -32px rgba(15,23,42,.25),0 0 0 4px rgba(37,99,235,.08),0 0 90px -20px rgba(37,99,235,.45)}
.asrt-pulse{width:8px;height:8px;border-radius:50%}
.asrt-pulse.anim{animation:asrt-pulse 1s infinite}
@keyframes asrt-pulse{50%{opacity:.35}}
.asrt-w{display:inline-block;animation:asrt-word .5s cubic-bezier(.2,.7,.2,1) both}
@keyframes asrt-word{from{opacity:0;filter:blur(8px);transform:translateY(6px)}}
@media (prefers-reduced-motion: reduce){.asrt-w{animation:none}}
.asrt-dots i{display:inline-block;width:6px;height:6px;margin-left:5px;border-radius:50%;background:currentColor;animation:asrt-bounce 1.2s infinite}
.asrt-dots i:nth-child(2){animation-delay:.15s}.asrt-dots i:nth-child(3){animation-delay:.3s}
@keyframes asrt-bounce{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-6px);opacity:1}}
.asrt-orb{position:relative;width:78px;height:78px;border:0;border-radius:50%;display:grid;place-items:center;color:#fff;cursor:pointer;
  background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 55%,#4f46e5 100%);box-shadow:0 16px 36px -10px rgba(37,99,235,.7),inset 0 1px 0 rgba(255,255,255,.4);
  transition:transform .25s cubic-bezier(.2,.7,.2,1),box-shadow .25s,filter .25s}
.asrt-orb:hover:not(:disabled){transform:scale(1.07)}
.asrt-orb:active:not(:disabled){transform:scale(.96)}
.asrt-orb:disabled{cursor:not-allowed;filter:grayscale(.5);opacity:.65}
.asrt-halo{position:absolute;inset:-6px;z-index:-1;border-radius:50%;background:#2563eb;opacity:0;transform:scale(calc(1 + var(--lvl,0) * .55));transition:opacity .3s,transform .07s linear}
.asrt-orb.live{background:linear-gradient(135deg,#f87171,#dc2626);box-shadow:0 16px 40px -10px rgba(220,38,38,.75),inset 0 1px 0 rgba(255,255,255,.35)}
.asrt-orb.live .asrt-halo{opacity:.3;background:#dc2626}
.asrt-orb.live::after{content:"";position:absolute;inset:0;z-index:-1;border-radius:50%;border:2px solid #dc2626;animation:asrt-ripple 1.8s ease-out infinite}
@keyframes asrt-ripple{from{transform:scale(1);opacity:.7}to{transform:scale(1.9);opacity:0}}
.asrt-spin{width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:asrt-rot .8s linear infinite}
@keyframes asrt-rot{to{transform:rotate(360deg)}}
.asrt-chip{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(15,23,42,.1);background:rgba(255,255,255,.9);color:#334155;font-size:13px;font-weight:600;transition:background .2s,border-color .2s,color .2s}
.asrt-chip:hover:not(:disabled){border-color:rgba(37,99,235,.4);color:#1d4ed8}
.asrt-chip:disabled{opacity:.45;cursor:not-allowed}
.asrt-chip.on{background:#2563eb;border-color:#2563eb;color:#fff}
.asrt-drop{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border-radius:inherit;border:2px dashed #2563eb;background:rgba(248,250,252,.8);backdrop-filter:blur(6px);color:#0f172a;font-size:19px;font-weight:700;pointer-events:none}
`;
if (typeof document !== "undefined") {
  let tag = document.getElementById("asrt-styles");
  if (!tag) { tag = document.createElement("style"); tag.id = "asrt-styles"; document.head.appendChild(tag); }
  if (tag.textContent !== CSS) tag.textContent = CSS;
}

const fmtClock = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function micErrorMessage(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow the microphone for this site in your browser's address bar, then try again — or drop an audio file instead.";
  }
  if (name === "NotFoundError") return "No microphone was found. Connect one, or drop an audio file instead.";
  if (name === "NotReadableError") return "Your microphone is being used by another app. Close it and try again.";
  return err?.message || "Couldn't start the microphone.";
}

/* ─── icons ─── */
const Svg = ({ size = 18, children, fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === "none" ? "currentColor" : "none"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const MicIcon = ({ size }) => <Svg size={size}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></Svg>;
const StopIcon = ({ size }) => <Svg size={size} fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5" /></Svg>;
const UploadIcon = ({ size }) => <Svg size={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Svg>;
const CopyIcon = ({ size }) => <Svg size={size}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>;
const CheckIcon = ({ size }) => <Svg size={size}><polyline points="20 6 9 17 4 12" /></Svg>;
const TrashIcon = ({ size }) => <Svg size={size}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></Svg>;
const WaveIcon = ({ size }) => <Svg size={size}><path d="M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h0" /></Svg>;
const FileIcon = ({ size }) => <Svg size={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></Svg>;
const ClockIcon = ({ size }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></Svg>;
const BoltIcon = ({ size }) => <Svg size={size}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></Svg>;
const LayersIcon = ({ size }) => <Svg size={size}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></Svg>;
const GaugeIcon = ({ size }) => <Svg size={size}><path d="M12 14 16 9" /><path d="M3.3 17a9 9 0 1 1 17.4 0" /></Svg>;

function CopyChip({ text, small = false }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* blocked */ }
  }
  return (
    <button type="button" className={`asrt-chip ${small ? "!h-7 !px-2.5 !text-xs" : ""}`} disabled={!text} onClick={copy} aria-label="Copy transcript">
      {done ? <CheckIcon size={14} /> : <CopyIcon size={14} />}<span>{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

// Mirrored frequency bars (low frequencies in the centre); idle = a slow
// breathing wave. Also writes smoothed loudness to --lvl on levelTarget so
// the orb halo reacts to the voice without re-rendering React every frame.
function Visualizer({ analyser, levelTarget }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const BARS = 64;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const heights = new Float32Array(BARS);
    let raf;
    const draw = (t) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (data) analyser.getByteFrequencyData(data);
      const mid = (BARS - 1) / 2;
      let sum = 0;
      for (let i = 0; i < BARS; i++) {
        const d = Math.abs(i - mid) / mid;
        let v;
        if (data) {
          const lo = 2 + Math.floor(Math.pow(d, 1.4) * 110);
          const raw = Math.max(data[lo], data[lo + 1], data[lo + 2]) / 255;
          v = Math.max(0, (raw - 0.3) / 0.7) * (1 - d * 0.35);
        } else {
          v = 0.05 + 0.035 * (1 + Math.sin(t / 700 - d * 5)) * (1 - d * 0.6);
        }
        heights[i] += (v - heights[i]) * (v > heights[i] ? 0.5 : 0.16);
        sum += heights[i];
      }
      const gap = w < 500 ? 3 : 4;
      const bw = Math.max(1.5, (w - gap * (BARS - 1)) / BARS);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#60a5fa"); grad.addColorStop(0.5, "#2563eb"); grad.addColorStop(1, "#4f46e5");
      ctx.fillStyle = grad;
      ctx.globalAlpha = data ? 1 : 0.35;
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(bw, heights[i] * h);
        const x = i * (bw + gap);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, (h - bh) / 2, bw, bh, bw / 2); else ctx.rect(x, (h - bh) / 2, bw, bh);
        ctx.fill();
      }
      levelTarget?.current?.style.setProperty("--lvl", data ? Math.min(1, (sum / BARS) * 2.2).toFixed(3) : "0");
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, levelTarget]);
  return <canvas ref={canvasRef} className="block w-full h-16" aria-hidden="true" />;
}

function Words({ text }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <p className="m-0 text-[clamp(20px,2.6vw,30px)] font-medium leading-[1.6] tracking-[-0.005em] text-slate-900 [overflow-wrap:anywhere]">
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="asrt-w" style={{ animationDelay: `${Math.min(i * 0.035, 1.2)}s` }}>{w}</span>{" "}
        </Fragment>
      ))}
    </p>
  );
}

function Metric({ icon, label, value, sub }) {
  return (
    <div className="asrt-glass rounded-[20px] px-4 py-3.5 flex items-start gap-3 min-w-0">
      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="m-0 text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="m-0 text-xl font-semibold text-slate-900 tabular-nums leading-tight">{value}</p>
        <p className="m-0 text-xs text-slate-500 truncate">{sub}</p>
      </div>
    </div>
  );
}

export default function AsrTryModal({ provider, modelLabel, evalModels = [], onClose }) {
  const [status, setStatus] = useState("idle"); // idle | recording | processing | done
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState(null);
  const [source, setSource] = useState(null); // { name, url, kind }
  const [results, setResults] = useState(null);
  const [stats, setStats] = useState(null); // { seconds, latencyMs }
  const [compare, setCompare] = useState(() => new Set());
  const [history, setHistory] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const panelRef = useRef(null);
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const recRef = useRef(null);
  const urlRef = useRef(null);
  const compareRef = useRef(compare);
  useEffect(() => { compareRef.current = compare; }, [compare]);

  const others = evalModels.filter(m => m.provider !== provider);
  const recording = status === "recording";
  const processing = status === "processing";
  const primary = results?.find(r => r.provider === provider);
  const primaryText = typeof primary?.text === "string" ? primary.text.trim() : "";
  const compared = results?.filter(r => r.provider !== provider) ?? [];

  const releaseMic = useCallback(() => {
    const r = recRef.current;
    if (!r) return;
    clearInterval(r.timer);
    r.stream.getTracks().forEach(t => t.stop());
    r.ctx.close().catch(() => {});
    recRef.current = null;
    setAnalyser(null);
  }, []);

  const transcribe = useCallback(async (blob, name, kind) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    setSource({ name, url, kind });
    setStatus("processing");
    setError("");
    setNote("");
    setResults(null);
    try {
      let decoded;
      try {
        decoded = await decodeTo16kMono(blob);
      } catch {
        throw new Error("Couldn't read that audio. Try a different file or format (WAV or MP3 work everywhere).");
      }
      if (decoded.trimmed) setNote(`Only the first ${MAX_SECONDS} seconds were transcribed.`);
      const chosen = [...compareRef.current];
      const form = new FormData();
      form.append("audio", new Blob([decoded.pcm.buffer], { type: "application/octet-stream" }), "audio.pcm");
      form.append("providers", [provider, ...chosen].join(","));
      const res = await fetch(INFERENCE_URL, { method: "POST", body: form, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : res.status === 401 ? "Please sign in again." : `Request failed (HTTP ${res.status}).`);
      }
      const list = data.results || [];
      const mine = list.find(r => r.provider === provider);
      setResults(list);
      setStats({ seconds: decoded.seconds, latencyMs: mine?.latency_ms ?? null, models: list.length });
      setStatus("done");
      if (typeof mine?.text === "string" && mine.text.trim()) {
        setHistory(h => [{ id: `${Date.now()}`, text: mine.text.trim(), name, kind, seconds: decoded.seconds, at: new Date() }, ...h].slice(0, 10));
      }
    } catch (e) {
      setError(e.message || "Transcription failed.");
      setStatus("idle");
    }
  }, [provider]);

  const stopRecording = useCallback(() => {
    const r = recRef.current;
    if (r && r.recorder.state !== "inactive") r.recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(an);
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        releaseMic();
        if (blob.size) transcribe(blob, "Microphone", "mic");
        else setStatus("idle");
      };
      const started = Date.now();
      const timer = setInterval(() => {
        const s = (Date.now() - started) / 1000;
        setElapsed(s);
        if (s >= MAX_SECONDS && recorder.state !== "inactive") recorder.stop();
      }, 200);
      recRef.current = { recorder, stream, ctx, timer };
      recorder.start();
      setElapsed(0);
      setAnalyser(an);
      setStatus("recording");
    } catch (e) {
      releaseMic();
      setError(micErrorMessage(e));
    }
  }, [releaseMic, transcribe]);

  const toggle = useCallback(() => {
    if (recording) stopRecording();
    else if (!processing) startRecording();
  }, [recording, processing, startRecording, stopRecording]);

  function pickFile(file) {
    setError("");
    if (!file || recording || processing) return;
    if (!file.type.startsWith("audio/") && !/\.(wav|mp3|m4a|aac|ogg|oga|opus|webm|flac)$/i.test(file.name)) {
      setError("That doesn't look like an audio file. Try WAV, MP3, M4A, OGG, WebM or FLAC.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_UPLOAD_MB} MB. Try a shorter clip.`);
      return;
    }
    transcribe(file, file.name, "file");
  }

  function clearAll() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setSource(null); setResults(null); setStats(null); setNote(""); setError(""); setStatus("idle");
  }

  function toggleCompare(name) {
    setCompare(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }

  // Escape closes (not mid-request), Space toggles recording, focus in/out,
  // no page scroll behind; always release the mic and object URLs.
  const onCloseRef = useRef(onClose);
  const toggleRef = useRef(toggle);
  const busyRef = useRef(processing);
  useEffect(() => { onCloseRef.current = onClose; toggleRef.current = toggle; busyRef.current = processing; });
  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape" && !busyRef.current) { onCloseRef.current(); return; }
      if (e.code === "Space" && !e.repeat && !["BUTTON", "INPUT", "SELECT", "TEXTAREA", "AUDIO"].includes(e.target.tagName)) {
        e.preventDefault();
        toggleRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const r = recRef.current;
      if (r) {
        clearInterval(r.timer);
        r.recorder.onstop = null;
        try { if (r.recorder.state !== "inactive") r.recorder.stop(); } catch { /* stopped */ }
        r.stream.getTracks().forEach(t => t.stop());
        r.ctx.close().catch(() => {});
        recRef.current = null;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, []);

  const pill = recording
    ? { cls: "text-red-600 bg-red-50", dot: "bg-red-600 anim", label: "Recording" }
    : processing
      ? { cls: "text-amber-700 bg-amber-50", dot: "bg-amber-500 anim", label: "Transcribing" }
      : { cls: "text-slate-600 bg-blue-50/70", dot: "bg-green-600", label: status === "done" ? "Done" : "Ready" };

  let body;
  if (processing) {
    body = (
      <div className="m-auto flex flex-col items-center gap-3 text-center py-6">
        <span className="w-9 h-9 rounded-full border-[3px] border-blue-100 border-t-blue-600 animate-spin" aria-hidden="true" />
        <h3 className="m-0 text-xl font-semibold text-slate-900">Transcribing {source?.kind === "file" ? source.name : "your recording"}</h3>
        <p className="m-0 text-sm text-slate-500">{modelLabel} is reading the audio{compare.size ? `, alongside ${compare.size} other model${compare.size > 1 ? "s" : ""}` : ""}.</p>
      </div>
    );
  } else if (recording) {
    body = (
      <div className="m-auto text-[22px] font-semibold text-slate-500 py-8">
        Listening<span className="asrt-dots"><i /><i /><i /></span>
      </div>
    );
  } else if (results) {
    body = primaryText ? (
      <Words key={source?.url} text={primaryText} />
    ) : (
      <p className="m-auto text-lg text-slate-500 py-8">{typeof primary?.text === "string" ? "No speech was detected in that audio." : `${modelLabel} couldn't transcribe this (it failed or timed out).`}</p>
    );
  } else {
    body = (
      <div className="m-auto flex flex-col items-center text-center gap-2.5 py-6 max-w-lg">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center"><WaveIcon size={24} /></div>
        <h3 className="m-0 text-2xl font-semibold tracking-tight text-slate-900">Tap the mic and start speaking</h3>
        <p className="m-0 text-[15px] text-slate-500 leading-relaxed">
          Speak in Hindi, Kannada, Tamil, Bengali, Marathi or English — or mix them. Stop, and the transcript appears here. You can also drop an audio recording anywhere on this panel.
        </p>
        <p className="m-0 text-sm text-slate-400"><kbd className="px-1.5 py-0.5 rounded-md border border-slate-300 bg-white text-slate-600 text-xs font-semibold">Space</kbd> to start / stop</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5" onClick={() => { if (!processing && !recording) onClose(); }}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asrt-title"
        className="relative bg-slate-50 w-full sm:max-w-5xl h-[100dvh] sm:h-[92vh] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asrt-aurora" aria-hidden="true" />
        <div className="asrt-grid" aria-hidden="true" />

        {/* Nav */}
        <div className="relative z-10 flex items-center gap-3 px-5 sm:px-7 pt-5">
          <img src="/vaanilogo.webp" alt="" className="w-9 h-9 rounded-xl object-contain bg-white shadow-sm" />
          <p id="asrt-title" className="m-0 text-lg font-bold tracking-tight text-slate-900">{modelLabel}</p>
          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-slate-300 text-slate-500">{provider}</span>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            aria-label="Close"
            className="ml-auto w-10 h-10 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 shadow-sm disabled:opacity-40"
          >
            <Svg size={18}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>
          </button>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-7 pb-6">
          {/* Hero */}
          <div className="text-center pt-5 pb-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 pl-1 pr-3 py-1 text-xs font-medium text-slate-600">
              <b className="rounded-full bg-blue-600 text-white px-2 py-0.5 text-[11px]">Try</b>
              Speech recognition for Indian languages
            </span>
            <h2 className="mt-3 mb-1 text-[clamp(26px,4vw,42px)] font-bold tracking-tight leading-[1.1] text-slate-900">
              Speak in any Indian language <br className="hidden sm:block" /><span className="asrt-grad">Watch it become text</span>
            </h2>
            <div className="asrt-marquee mt-4" aria-hidden="true">
              <div className="asrt-track">
                {[...LANGUAGES, ...LANGUAGES].map((l, i) => (
                  <span key={i} className="px-3 py-1 rounded-full border border-slate-200 bg-white/80 text-sm text-slate-600 whitespace-nowrap">{l}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Stage */}
          <section
            ref={stageRef}
            className={`asrt-glass asrt-stage relative rounded-[28px] px-4 sm:px-5 pt-4 pb-5 flex flex-col gap-3 ${recording ? "is-live" : ""}`}
            onDragOver={(e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`inline-flex items-center gap-2 h-8 px-3 rounded-full text-[12.5px] font-semibold ${pill.cls}`} aria-live="polite">
                <span className={`asrt-pulse ${pill.dot}`} />
                {pill.label}
                {recording && <span className="pl-2 border-l border-current/30 text-slate-900 font-medium tabular-nums">{fmtClock(elapsed)}</span>}
              </div>
              {source && !recording && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 min-w-0 max-w-[40%]">
                  {source.kind === "file" ? <FileIcon size={14} /> : <MicIcon size={14} />}<span className="truncate">{source.name}</span>
                </span>
              )}
              {others.length > 0 && (
                <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                  <span className="text-xs font-semibold text-slate-500">Compare</span>
                  {others.map(m => (
                    <button
                      key={m.provider}
                      type="button"
                      aria-pressed={compare.has(m.provider)}
                      onClick={() => toggleCompare(m.provider)}
                      disabled={recording || processing}
                      className={`asrt-chip !h-7 !px-2.5 !text-xs ${compare.has(m.provider) ? "on" : ""}`}
                      title={m.model}
                    >
                      {m.provider}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-[170px] max-h-[34vh] overflow-y-auto flex flex-col px-1" aria-live="polite">{body}</div>

            {source && !recording && !processing && (
              <audio src={source.url} controls className="w-full h-10" aria-label="Play the audio" />
            )}
            {note && <p className="m-0 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{note}</p>}
            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                <Svg size={16}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></Svg>
                <span>{error}</span>
              </div>
            )}

            <Visualizer analyser={analyser} levelTarget={stageRef} />

            {/* Dock */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex">
                <button type="button" className="asrt-chip" onClick={() => fileInputRef.current?.click()} disabled={recording || processing}>
                  <UploadIcon size={15} /><span className="hidden sm:inline">Audio file</span>
                </button>
              </div>
              <button type="button" className={`asrt-orb ${recording ? "live" : ""}`} onClick={toggle} disabled={processing} aria-label={recording ? "Stop recording" : "Start recording"}>
                <span className="asrt-halo" />
                {processing ? <span className="asrt-spin" /> : recording ? <StopIcon size={28} /> : <MicIcon size={30} />}
              </button>
              <div className="flex justify-end gap-2">
                <CopyChip text={primaryText} />
                <button type="button" className="asrt-chip" onClick={clearAll} disabled={recording || processing || (!results && !source)} aria-label="Clear">
                  <TrashIcon size={14} /><span className="hidden sm:inline">Clear</span>
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.opus,.webm,.flac"
              className="sr-only"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            {dragging && (
              <div className="asrt-drop"><UploadIcon size={28} />Drop audio to transcribe it</div>
            )}
          </section>

          {/* Compared models */}
          {compared.length > 0 && (
            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              {compared.map(r => (
                <div key={r.provider} className="asrt-glass rounded-[20px] p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="m-0 text-sm font-semibold text-slate-900">{r.provider}</p>
                    <span className="text-xs text-slate-500 font-mono truncate">{r.model}</span>
                    <span className="ml-auto text-xs text-slate-500 tabular-nums">{(r.latency_ms / 1000).toFixed(2)}s</span>
                  </div>
                  {typeof r.text === "string" ? (
                    <p className="m-0 text-[15px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{r.text.trim() || <em className="text-slate-400">No speech detected.</em>}</p>
                  ) : (
                    <p className="m-0 text-sm text-red-600">Failed or timed out — this model may not be configured on the server.</p>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Metrics */}
          <section className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric icon={<ClockIcon size={17} />} label="Audio" value={fmtClock(stats?.seconds)} sub="16 kHz mono" />
            <Metric icon={<GaugeIcon size={17} />} label="Latency" value={stats?.latencyMs != null ? `${(stats.latencyMs / 1000).toFixed(2)}s` : "–"} sub={modelLabel} />
            <Metric
              icon={<BoltIcon size={17} />}
              label="Speed"
              value={stats?.latencyMs && stats.seconds ? `${Math.max(1, Math.round(stats.seconds / (stats.latencyMs / 1000)))}×` : "–"}
              sub="faster than real time"
            />
            <Metric icon={<LayersIcon size={17} />} label="Models" value={stats?.models ?? 1 + compare.size} sub={stats ? "in the last run" : "selected"} />
          </section>

          {/* Session history */}
          {history.length > 0 && (
            <section className="mt-5">
              <div className="flex items-center mb-2.5">
                <h3 className="m-0 text-base font-semibold text-slate-900">Session history</h3>
                <button type="button" className="asrt-chip !h-7 !px-2.5 !text-xs ml-auto" onClick={() => setHistory([])}>
                  <TrashIcon size={13} /><span>Clear all</span>
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                {history.map(h => (
                  <article key={h.id} className="asrt-glass rounded-[20px] px-4 py-3">
                    <div className="flex items-center gap-2.5 flex-wrap text-xs text-slate-500 mb-1.5">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                        {h.kind === "file" ? <FileIcon size={13} /> : <MicIcon size={13} />}<span className="truncate max-w-[220px]">{h.kind === "file" ? h.name : "Microphone"}</span>
                      </span>
                      <span>{h.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="tabular-nums">{fmtClock(h.seconds)}</span>
                      <span className="ml-auto"><CopyChip text={h.text} small /></span>
                    </div>
                    <p className="m-0 text-[15px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{h.text}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
