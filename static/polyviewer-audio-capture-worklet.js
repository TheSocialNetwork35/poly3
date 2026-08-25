class PolyViewerAudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.channelBuffers = [];
    this.writeIndex = 0;
    this.chunkFrames = 8192;
    this.port.onmessage = (event) => {
      if (event.data?.type === "start") {
        this.recording = true;
        this.channelBuffers = [];
        this.writeIndex = 0;
      } else if (event.data?.type === "stop") {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: "stopped" });
      }
    };
  }

  process(inputs) {
    if (!this.recording) return true;
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;
    if (this.channelBuffers.length !== input.length) {
      this.flush();
      this.channelBuffers = Array.from(
        { length: input.length },
        () => new Float32Array(this.chunkFrames),
      );
    }
    let sourceIndex = 0;
    while (sourceIndex < input[0].length) {
      const copied = Math.min(input[0].length - sourceIndex, this.chunkFrames - this.writeIndex);
      for (let channel = 0; channel < input.length; channel += 1) {
        this.channelBuffers[channel].set(
          input[channel].subarray(sourceIndex, sourceIndex + copied),
          this.writeIndex,
        );
      }
      this.writeIndex += copied;
      sourceIndex += copied;
      if (this.writeIndex === this.chunkFrames) this.flush();
    }
    return true;
  }

  flush() {
    if (this.writeIndex === 0 || this.channelBuffers.length === 0) return;
    const channels = this.channelBuffers.map((buffer) => buffer.slice(0, this.writeIndex));
    this.port.postMessage({ type: "chunk", channels }, channels.map((channel) => channel.buffer));
    this.channelBuffers = Array.from(
      { length: this.channelBuffers.length },
      () => new Float32Array(this.chunkFrames),
    );
    this.writeIndex = 0;
  }
}

registerProcessor("polyviewer-audio-capture", PolyViewerAudioCaptureProcessor);
