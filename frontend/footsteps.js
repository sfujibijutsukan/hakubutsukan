// A short, filtered noise brush suggests socks sliding across tatami.
// Audio is synthesized locally and only unlocked by a user gesture.
export class TatamiFootsteps {
  constructor(createContext = () => new (window.AudioContext || window.webkitAudioContext)()) {
    this.createContext = createContext;
    this.context = null;
    this.buffer = null;
    this.enabled = false;
    this.distance = 0;
    this.moving = false;
    this.left = true;
    this.voices = new Set();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * .22), this.context.sampleRate);
        const samples = this.buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1);
      }
      if (this.context.state === 'suspended' || this.context.state === 'interrupted') this.context.resume().catch(() => {});
    } catch { /* Audio support or permission must never block the gallery. */ }
  }

  advance(distance) {
    if (!this.enabled || this.context?.state !== 'running' || distance < .0005) {
      this.stop(); return;
    }
    // Follow actual travel, not key presses: turning or pushing into a wall is silent.
    this.distance += distance;
    if (!this.moving || this.distance >= .95) {
      this.play(); this.distance %= .95;
    }
    this.moving = true;
  }

  play() {
    const context = this.context, now = context.currentTime;
    const source = context.createBufferSource(); source.buffer = this.buffer;
    source.playbackRate.value = this.left ? .96 : 1.04;
    const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = this.left ? 1650 : 1850; filter.Q.value = .65;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.13, now + .025);
    gain.gain.exponentialRampToValueAtTime(.001, now + .19);
    gain.gain.linearRampToValueAtTime(0, now + .23);
    const pan = context.createStereoPanner(); pan.pan.value = this.left ? -.12 : .12;
    source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(context.destination);
    const voice = { source, filter, gain, pan, stopping: false }; this.voices.add(voice);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); this.voices.delete(voice); };
    source.start(now); source.stop(now + .24); this.left = !this.left;
  }

  stop() {
    this.distance = 0; this.moving = false;
    if (!this.context) return;
    for (const voice of this.voices) {
      if (voice.stopping) continue;
      voice.stopping = true;
      const now = this.context.currentTime;
      if (voice.gain.gain.cancelAndHoldAtTime) voice.gain.gain.cancelAndHoldAtTime(now);
      else { voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(voice.gain.gain.value, now); }
      voice.gain.gain.linearRampToValueAtTime(0, now + .025);
      voice.source.stop(now + .03);
    }
  }
}
