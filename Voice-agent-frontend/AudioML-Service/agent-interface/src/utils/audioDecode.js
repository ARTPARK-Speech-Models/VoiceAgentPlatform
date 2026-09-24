// Browser-side audio prep for POST /api/asr/inference, which expects raw
// float32 PCM, mono, 16 kHz.
export const TARGET_RATE = 16000;
export const MAX_SECONDS = 60;

// Any browser-decodable audio blob -> Float32Array PCM, mono, 16 kHz
// (first MAX_SECONDS only). Returns { pcm, seconds, trimmed }.
export async function decodeTo16kMono(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const seconds = Math.min(decoded.duration, MAX_SECONDS);
    const frames = Math.max(1, Math.ceil(seconds * TARGET_RATE));
    const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return { pcm: rendered.getChannelData(0), seconds, trimmed: decoded.duration > MAX_SECONDS };
  } finally {
    ctx.close().catch(() => {});
  }
}

