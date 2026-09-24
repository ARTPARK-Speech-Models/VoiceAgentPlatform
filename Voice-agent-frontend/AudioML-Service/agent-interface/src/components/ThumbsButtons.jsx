// Shared by CallHistorySection.jsx (post-call, persisted via
// asr-eval-feedback) and VoiceAgentWidget.jsx (live, see each caller for
// how/whether it persists) -- one visual for rating
// an ASR model's output, feedback is "up" | "down" | null.
function ThumbButton({ active, label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
        active ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

export default function ThumbsButtons({ feedback, onVote }) {
  return (
    <div className="flex gap-0.5">
      <ThumbButton active={feedback === "up"} label="Good transcription" onClick={() => onVote(feedback === "up" ? null : "up")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={feedback === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 10v12" /><path d="M15 5.88 14 10h6.5a2 2 0 0 1 1.94 2.5l-2.4 8A2 2 0 0 1 18 22H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1.5L14 2a2.07 2.07 0 0 1 2 2.11z" />
        </svg>
      </ThumbButton>
      <ThumbButton active={feedback === "down"} label="Bad transcription" onClick={() => onVote(feedback === "down" ? null : "down")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={feedback === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 14V2" /><path d="M9 18.12 10 14H3.5a2 2 0 0 1-1.94-2.5l2.4-8A2 2 0 0 1 6 2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1.5L10 22a2.07 2.07 0 0 1-2-2.11z" />
        </svg>
      </ThumbButton>
    </div>
  );
}
