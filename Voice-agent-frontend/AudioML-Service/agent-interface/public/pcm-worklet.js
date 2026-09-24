// AudioWorkletProcessor that forwards raw mono Float32 PCM samples from the
// mic to the main thread, one process() callback's worth of samples per
// message. Loaded via audioCtx.audioWorklet.addModule("/pcm-worklet.js")
// in VoiceAgentWidget.jsx -- must live in public/ so
// Vite serves it at that exact root path in both dev and build.
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      // input[0] is a Float32Array view into a buffer the audio engine
      // reuses across callbacks -- copy it before transferring ownership.
      const channelData = input[0].slice();
      this.port.postMessage(channelData.buffer, [channelData.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
