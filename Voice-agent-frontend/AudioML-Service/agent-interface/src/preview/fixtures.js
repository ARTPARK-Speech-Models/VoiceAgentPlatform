// Preview-only fixtures: realistic mocked responses for every backend
// endpoint the logged-in pages call. Shapes mirror the FastAPI handlers in
// Voice-agent-backend/Orchestrator/src/crud.py + main.py. Not imported by
// the real app -- only by src/preview/main.jsx.
import catalog from "./catalog.json";

export const USERNAME = "demo-user";

const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ASR = { provider: "Vaani", model: "sravaani" };
const LLM = { provider: "Google", model: "gemini-3.7-flash" };
const TTS = { provider: "Google", model: "gemini-3.1-flash-tts-preview" };

const promptFor = (name) => catalog?.llm?.prompts?.find((p) => p.name === name)?.prompt;

const AGENT_DEFS = [
  {
    id: 1,
    name: "Aarogya Helpdesk",
    created_at: iso(3 * DAY + 4 * HOUR),
    language: "Hindi",
    voice: "Kore",
    temperature: 0.4,
    mcp_url: "http://localhost:8000/mcp/rag",
    keywords: ["Aarogya", "OPD", "paracetamol", "BP"],
    prompt:
      promptFor("Healthcare") ||
      "You are Vaani, a warm and trustworthy AI health assistant for the Aarogya district hospital helpdesk. Help callers book OPD appointments, explain symptoms in simple words and guide them to the right department. Never diagnose or prescribe. For emergencies, tell the caller to dial 108 immediately.",
  },
  {
    id: 2,
    name: "Kisan Mandi Bot",
    created_at: iso(9 * DAY + 2 * HOUR),
    language: "Hindi",
    voice: "Charon",
    temperature: 0.6,
    mcp_url: "http://localhost:8000/mcp/mandi",
    keywords: ["mandi", "quintal", "tamatar", "pyaaz", "gehun"],
    prompt:
      "You are Kisan Mitra, a friendly voice assistant for farmers. Answer questions about today's mandi (market) prices for crops such as wheat, onion, tomato and soybean using the mandi price tool. Speak in simple Hindi, quote prices per quintal, name the mandi and the date of the price, and suggest the nearest mandi with a better rate when one exists.\n\nOUTPUT FORMAT:\nYou are speaking out loud. Use plain spoken sentences only -- no markdown, no lists, no symbols.",
  },
  {
    id: 3,
    name: "Customer Care",
    created_at: iso(16 * DAY),
    language: "English",
    voice: "Aoede",
    temperature: 0.5,
    mcp_url: null,
    keywords: ["refund", "order ID", "SamVaani"],
    prompt:
      promptFor("Customer Care") ||
      "You are a polite customer care agent. Help callers track orders, raise refunds and resolve billing questions. Confirm the order ID before making any change.",
  },
  {
    id: 4,
    name: "Sales Assist",
    created_at: iso(24 * DAY + 6 * HOUR),
    language: "English",
    voice: "Puck",
    temperature: 0.7,
    mcp_url: null,
    keywords: ["demo", "pricing", "enterprise plan"],
    prompt:
      promptFor("Sales") ||
      "You are a helpful sales assistant. Qualify the lead, understand their use case and book a demo with the sales team.",
  },
];

export const agentList = AGENT_DEFS.map((a) => ({
  id: a.id,
  name: a.name,
  asr_provider_name: ASR.model,
  llm_provider_name: LLM.model,
  tts_provider_name: TTS.model,
  created_at: a.created_at,
}));

export function agentDetail(id) {
  const a = AGENT_DEFS.find((x) => String(x.id) === String(id));
  if (!a) return null;
  return {
    data: {
      id: a.id,
      name: a.name,
      agent_type: "A+L+T",
      created_at: a.created_at,
      asr: {
        model: ASR.model,
        provider: ASR.provider,
        keywords: a.keywords,
        end_of_turn_confidence: 0.7,
        end_of_turn_timeout: 1.2,
        min_speech_duration: 0.25,
      },
      llm: {
        model: LLM.model,
        provider: LLM.provider,
        prompt: a.prompt,
        temperature: a.temperature,
        max_tokens: 512,
        mcp_url: a.mcp_url,
      },
      tts: {
        model: TTS.model,
        provider: TTS.provider,
        language: a.language,
        speed: 1.0,
        speaker_audio: a.voice,
      },
    },
  };
}

// ── Calls ────────────────────────────────────────────────────────────────────
const TRANSCRIPTS = {
  1: [
    [
      ["user", "Namaste, mujhe kal ke liye OPD appointment chahiye."],
      ["assistant", "Namaste! Zaroor. Aap kis vibhag mein dikhana chahte hain -- general medicine, bacchon ka vibhag, ya koi aur?"],
      ["user", "General medicine. Mujhe teen din se bukhar hai."],
      ["assistant", "Samajh gayi. Kal subah das baje general medicine OPD mein jagah hai. Kya main aapka naam aur mobile number le sakti hoon?"],
      ["user", "Ramesh Kumar, nau aath aath do, teen chaar paanch, chhe saat aath."],
      ["assistant", "Dhanyavaad Ramesh ji. Aapka appointment kal subah das baje confirm ho gaya hai. Tab tak paani khoob peejiye aur agar saans lene mein takleef ho to turant 108 par call kijiye."],
    ],
    [
      ["user", "What are the OPD timings on Sunday?"],
      ["assistant", "On Sundays the OPD is open from 9 AM to 1 PM for general medicine and paediatrics only. Emergency services are available 24 hours."],
      ["user", "Okay, and do I need to bring my old reports?"],
      ["assistant", "Yes, please bring any previous prescriptions and test reports, along with a photo ID. It helps the doctor understand your history quickly."],
    ],
    [
      ["user", "मेरे पापा का बीपी बहुत हाई आ रहा है, एक सौ अस्सी बाई एक सौ दस।"],
      ["assistant", "यह काफ़ी ज़्यादा है। क्या उन्हें सीने में दर्द, चक्कर या धुंधला दिखाई दे रहा है?"],
      ["user", "थोड़ा चक्कर आ रहा है।"],
      ["assistant", "कृपया देर न करें, उन्हें तुरंत नज़दीकी इमरजेंसी में ले जाइए या 108 पर कॉल कीजिए।"],
    ],
    [
      ["user", "Is the blood test lab open now?"],
      ["assistant", "Yes, the pathology lab is open until 6 PM today. Fasting tests like blood sugar are best done before 10 AM."],
    ],
  ],
  2: [
    [
      ["user", "आज इंदौर मंडी में प्याज़ का क्या भाव है?"],
      ["assistant", "आज इंदौर मंडी में प्याज़ का मॉडल भाव चौदह सौ पचास रुपये प्रति क्विंटल है। न्यूनतम बारह सौ और अधिकतम सोलह सौ रुपये रहा।"],
      ["user", "और देवास में?"],
      ["assistant", "देवास मंडी में आज प्याज़ पंद्रह सौ बीस रुपये प्रति क्विंटल बिक रहा है, जो इंदौर से थोड़ा बेहतर है।"],
    ],
    [
      ["user", "उज्जैन में गेहूं का रेट बताओ।"],
      ["assistant", "उज्जैन मंडी में आज गेहूं का मॉडल भाव दो हज़ार चार सौ साठ रुपये प्रति क्विंटल है। सरकारी समर्थन मूल्य दो हज़ार तीन सौ पचहत्तर रुपये है।"],
    ],
    [
      ["user", "Tamatar ka bhaav gir kyun raha hai?"],
      ["assistant", "Is hafte aas-paas ke zilon se aavak badhne ki wajah se tamatar ke daam gire hain. Aaj Bhopal mein aath sau rupaye prati quintal ka bhaav hai."],
      ["user", "Theek hai, dhanyavaad."],
      ["assistant", "Aapka swagat hai! Achhi fasal ki shubhkaamnaayein."],
    ],
  ],
  3: [
    [
      ["user", "Hi, I haven't received my order yet. It's been a week."],
      ["assistant", "I'm sorry about the delay. Could you share your order ID so I can check the status?"],
      ["user", "It's SV 4 4 7 1 9."],
      ["assistant", "Thanks. Order SV44719 is with the courier and is out for delivery today. You'll get an SMS with the delivery agent's number shortly."],
    ],
    [
      ["user", "I was charged twice for my subscription."],
      ["assistant", "I can help with that. I see two charges of 499 rupees on the 14th. I've raised a refund for the duplicate charge -- it will reach your account in 5 to 7 working days."],
      ["user", "Great, thank you."],
      ["assistant", "You're welcome! Is there anything else I can help you with?"],
    ],
  ],
  4: [
    [
      ["user", "Hi, we're a hospital chain looking for a Hindi voice agent."],
      ["assistant", "That's a great fit. How many locations do you have, and roughly how many patient calls do you handle per day?"],
      ["user", "Twelve hospitals, maybe three thousand calls a day."],
      ["assistant", "Thanks! Our enterprise plan covers that volume with on-premise ASR. Can I book a 30 minute demo with our solutions team this Thursday?"],
      ["user", "Thursday at 3 works."],
      ["assistant", "Done -- you'll receive a calendar invite for Thursday at 3 PM. Looking forward to it!"],
    ],
    [
      ["user", "What's the pricing for the starter plan?"],
      ["assistant", "The starter plan is free for up to 500 minutes a month. Beyond that it's billed per minute of call time, and you only pay for the LLM and TTS usage."],
    ],
  ],
};

const DURATIONS = [142, 76, 118, 38, 94, 52, 121, 87, 164, 47, 203, 29];
const START_OFFSETS = [
  25 * MIN, 3 * HOUR, 7 * HOUR, 26 * HOUR, 30 * HOUR, 2 * DAY + 3 * HOUR,
  2 * DAY + 9 * HOUR, 3 * DAY + 1 * HOUR, 4 * DAY + 5 * HOUR, 5 * DAY + 2 * HOUR,
  6 * DAY + 7 * HOUR, 8 * DAY,
];

// Interleave agents so the consolidated list (newest first) mixes them.
const ORDER = [
  [1, 0], [2, 0], [3, 0], [1, 1], [4, 0], [2, 1],
  [1, 2], [3, 1], [4, 1], [2, 2], [1, 3], [3, 0],
];

function seeded(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const calls = ORDER.map(([agentId, tIdx], i) => {
  const id = 212 - i;
  const transcript = TRANSCRIPTS[agentId][tIdx];
  const started = NOW - START_OFFSETS[i];
  const duration = DURATIONS[i];
  const lang = agentId === 3 || agentId === 4 ? "en" : (tIdx === 1 && agentId === 1) || (tIdx === 3 && agentId === 1) ? "en" : "hi";
  let t = started;
  const messages = transcript.map(([role, text], k) => {
    t += Math.round((duration * 1000) / transcript.length) - (k % 2 ? 0 : 400);
    return { role, text, ts: new Date(t).toISOString() };
  });
  const nTurns = transcript.filter(([r]) => r === "user").length;
  const latency_per_turn = Array.from({ length: nTurns }, (_, k) => {
    const r = seeded(id * 10 + k);
    const asr = +(180 + r * 140).toFixed(1);
    const ttft = +(420 + seeded(id * 7 + k) * 380).toFixed(1);
    const tts = +(310 + seeded(id * 3 + k) * 260).toFixed(1);
    const prompt_tokens = 1450 + k * 180 + Math.round(r * 90);
    const completion_tokens = 38 + Math.round(seeded(id + k) * 40);
    return {
      turn: k + 1,
      req_id: `req-${id}-${k + 1}`,
      asr_ms: asr,
      llm_ttft_ms: ttft,
      llm_total_ms: +(ttft + 250 + r * 300).toFixed(1),
      tool_calls: agentId === 2 && k === 0 ? 1 : 0,
      tts_ttfb_ms: tts,
      e2e_ms: +(asr + ttft + tts + 60).toFixed(1),
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    };
  });
  const prompt_tokens = latency_per_turn.reduce((s, x) => s + x.prompt_tokens, 0);
  const completion_tokens = latency_per_turn.reduce((s, x) => s + x.completion_tokens, 0);
  const tts_prompt_tokens = completion_tokens + 12 * nTurns;
  const tts_output_tokens = Math.round(duration * 12.5);
  const token_usage = {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
    estimated_cost_usd: +((prompt_tokens * 0.3 + completion_tokens * 2.5) / 1e6).toFixed(6),
    asr_cost_usd: 0.0,
    tts_prompt_tokens,
    tts_output_tokens,
    tts_cost_usd: +((tts_prompt_tokens * 0.5 + tts_output_tokens * 10) / 1e6).toFixed(6),
  };
  const summarize = (key) => {
    const vals = latency_per_turn.map((x) => x[key]).filter((v) => v != null);
    if (!vals.length) return null;
    return {
      n: vals.length,
      min_ms: Math.min(...vals),
      max_ms: Math.max(...vals),
      avg_ms: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
    };
  };
  const asr_eval_results = agentId === 1 || agentId === 2
    ? transcript
        .filter(([r]) => r === "user")
        .map(([, text], k) => ({
          turn_id: `turn-${id}-${k + 1}`,
          results: evalResults(text, id * 13 + k, k),
        }))
    : null;
  const tool_call_count = latency_per_turn.reduce((s, x) => s + x.tool_calls, 0);
  return {
    id,
    agent_id: agentId,
    agent_name: AGENT_DEFS.find((a) => a.id === agentId).name,
    summary: `${messages.length} message(s) exchanged`,
    started_at: new Date(started).toISOString(),
    ended_at: new Date(started + duration * 1000).toISOString(),
    duration,
    language: lang,
    tool_call_count,
    disconnect_reason: i === 5 ? "error: ASR stream timeout" : "client_disconnected",
    token_usage,
    recording_available: null,
    messages,
    latency_summary: {
      asr: summarize("asr_ms"),
      llm_total: summarize("llm_total_ms"),
      llm_without_tool: summarize("llm_total_ms"),
      llm_tool_call_only: null,
      llm_ttft: summarize("llm_ttft_ms"),
      tts: summarize("tts_ttfb_ms"),
      e2e: summarize("e2e_ms"),
    },
    latency_per_turn,
    asr_eval_results,
  };
});

function evalResults(text, seed, k) {
  const variants = {
    Vaani: text,
    Google: text.replace(/\.$/, ""),
    "Google-Latest": text,
    OpenAI: text.toLowerCase(),
    Sarvam: text.replace(/,/g, ""),
  };
  const base = { Vaani: 240, Google: 780, "Google-Latest": 690, OpenAI: 910, Sarvam: 540 };
  const models = {
    Vaani: "SraVaani-1.0",
    Google: "gemini-2.5-flash",
    "Google-Latest": "gemini-3.5-flash-lite",
    OpenAI: "gpt-4o-mini-transcribe",
    Sarvam: "saarika:v2.5",
  };
  return Object.keys(variants).map((p, j) => ({
    provider: p,
    model: models[p],
    text: variants[p],
    latency_ms: +(base[p] + seeded(seed + j) * 220).toFixed(1),
    is_primary: p === "Vaani",
    feedback: p === "Vaani" && k % 2 === 0 ? "up" : p === "OpenAI" && k === 1 ? "down" : null,
  }));
}

export const ALL_CALLS = calls;

const LIST_FIELDS = [
  "id", "summary", "started_at", "ended_at", "duration", "language",
  "tool_call_count", "disconnect_reason", "token_usage",
];

export function listAllCalls({ limit = 25, offset = 0, empty = false } = {}) {
  const src = empty ? [] : calls;
  return {
    total: src.length,
    calls: src.slice(offset, offset + limit).map((c) => ({
      ...pick(c, LIST_FIELDS),
      agent_id: c.agent_id,
      agent_name: c.agent_name,
    })),
  };
}

export function listAgentCalls(agentId, { limit = 25, offset = 0, empty = false } = {}) {
  const src = empty ? [] : calls.filter((c) => String(c.agent_id) === String(agentId));
  return {
    total: src.length,
    calls: src.slice(offset, offset + limit).map((c) => ({
      ...pick(c, LIST_FIELDS),
      recording_available: c.recording_available,
    })),
  };
}

export function callDetail(agentId, callId) {
  const c = calls.find((x) => String(x.id) === String(callId) && String(x.agent_id) === String(agentId))
    || calls.find((x) => String(x.id) === String(callId));
  if (!c) return null;
  return pick(c, [
    ...LIST_FIELDS, "messages", "latency_summary", "latency_per_turn",
    "asr_eval_results", "recording_available",
  ]);
}

export function statsSummary({ agentId = null, empty = false } = {}) {
  const src = empty ? [] : calls.filter((c) => agentId == null || String(c.agent_id) === String(agentId));
  const sum = (f) => src.reduce((s, c) => s + (f(c) || 0), 0);
  return {
    total_calls: src.length,
    total_duration_seconds: sum((c) => c.duration),
    agents_with_calls: new Set(src.map((c) => c.agent_id)).size,
    total_tokens: sum((c) => c.token_usage?.total_tokens),
    total_cost_usd: src.length ? +sum((c) => c.token_usage?.estimated_cost_usd).toFixed(4) : null,
    total_asr_cost_usd: src.length ? 0.0 : null,
    total_tts_cost_usd: src.length ? +sum((c) => c.token_usage?.tts_cost_usd).toFixed(4) : null,
  };
}

// ── Evaluation summary (GET /api/asr-eval/summary) ───────────────────────────
export function asrEvalSummary({ empty = false } = {}) {
  const src = empty ? [] : calls.filter((c) => c.asr_eval_results);
  const stats = {};
  const turnsNewest = [];
  const detailsNewest = [];
  for (const c of src) {
    for (const turn of c.asr_eval_results) {
      const point = {};
      const results = [];
      for (const r of turn.results) {
        const s = (stats[r.provider] ||= {
          provider: r.provider, model: r.model, turns: 0, sum: 0, n: 0, thumbs_up: 0, thumbs_down: 0,
        });
        s.turns += 1;
        if (r.latency_ms != null) { s.sum += r.latency_ms; s.n += 1; }
        if (r.feedback === "up") s.thumbs_up += 1;
        if (r.feedback === "down") s.thumbs_down += 1;
        point[r.provider] = r.latency_ms;
        results.push({ ...r });
      }
      turnsNewest.push(point);
      detailsNewest.push({
        call_id: c.id,
        agent_id: c.agent_id,
        agent_name: c.agent_name,
        turn_id: turn.turn_id,
        started_at: c.started_at,
        results,
      });
    }
  }
  const turns = turnsNewest.reverse();
  turns.forEach((p, i) => { p.turnIndex = i + 1; });
  const vals = Object.values(stats);
  return {
    providers: vals.map((s) => ({
      provider: s.provider,
      model: s.model,
      turns: s.turns,
      avg_latency_ms: s.n ? +(s.sum / s.n).toFixed(1) : null,
      thumbs_up: s.thumbs_up,
      thumbs_down: s.thumbs_down,
    })),
    turns,
    turn_details: detailsNewest.reverse(),
    provider_models: Object.fromEntries(vals.map((s) => [s.provider, s.model])),
    calls_scanned: src.length,
  };
}

export const asrEvalModels = {
  providers: [
    { provider: "Vaani", model: "SraVaani-1.0" },
    { provider: "Google", model: "gemini-2.5-flash" },
    { provider: "Google-Latest", model: "gemini-3.5-flash-lite" },
    { provider: "OpenAI", model: "gpt-4o-mini-transcribe" },
    { provider: "Sarvam", model: "saarika:v2.5" },
    { provider: "Muse", model: "muse-asr-v1" },
  ],
};

// ── Prompt history ───────────────────────────────────────────────────────────
export function promptHistory(agentId) {
  const d = agentDetail(agentId);
  if (!d) return null;
  const current = d.data.llm.prompt;
  const first = current.split("\n")[0];
  return {
    current_prompt: current,
    versions: [
      { id: agentId * 10 + 2, prompt_text: first + "\nKeep answers under three sentences.", changed_by: USERNAME, created_at: iso(1 * DAY + 2 * HOUR) },
      { id: agentId * 10 + 1, prompt_text: first, changed_by: USERNAME, created_at: iso(2 * DAY + 5 * HOUR) },
    ],
  };
}

export function promptDiff(agentId, versionId) {
  const h = promptHistory(agentId);
  const v = h?.versions.find((x) => String(x.id) === String(versionId));
  if (!v) return null;
  const oldL = v.prompt_text.split("\n");
  const newL = h.current_prompt.split("\n");
  const rows = [];
  rows.push({ tag: "equal", old: oldL[0], new: newL[0] });
  const n = Math.max(oldL.length, newL.length);
  for (let i = 1; i < n; i++) {
    const o = oldL[i] ?? null;
    const nw = newL[i] ?? null;
    rows.push({ tag: o == null ? "insert" : nw == null ? "delete" : o === nw ? "equal" : "replace", old: o, new: nw });
  }
  return { version_id: Number(versionId), rows };
}

// ── Settings ─────────────────────────────────────────────────────────────────
export const apiKeys = {
  providers: [
    { name: "Google", in_use: true, used_for: "Gemini LLM & TTS" },
    { name: "Sarvam", in_use: false, used_for: null },
    { name: "OpenAI", in_use: false, used_for: null },
    { name: "Deepgram", in_use: false, used_for: null },
    { name: "ElevenLabs", in_use: false, used_for: null },
    { name: "Azure", in_use: false, used_for: null },
    { name: "AssemblyAI", in_use: false, used_for: null },
    { name: "Hugging Face", in_use: false, used_for: null },
  ],
  keys: [
    { provider: "Google", masked: "AIza••••••••x7Qk", updated_at: iso(5 * DAY) },
  ],
};

export const voiceReferences = [
  { id: 1, name: "Priya (Hindi, female)", transcript: "Namaste, main aapki kaise madad kar sakti hoon?" },
];

export { catalog };

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (k in o) out[k] = o[k];
  return out;
}
