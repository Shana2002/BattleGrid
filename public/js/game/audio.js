export class GameAudio {
  constructor(enabled = false) {
    this.enabled = enabled;
    this.context = null;
  }

  unlock() {
    if (!this.enabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      this.context ??= new AudioContext();
      this.context.resume().catch(() => {});
    } catch { /* Audio is optional; gameplay must work without it. */ }
  }

  play(type) {
    if (!this.enabled || !this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    const settings = {
      shot: [130, 45, 0.07, "sawtooth", 0.035],
      hit: [240, 70, 0.10, "triangle", 0.05],
      pickup: [460, 840, 0.13, "sine", 0.05],
      spawn: [280, 560, 0.18, "sine", 0.045],
      zombie: [85, 38, 0.16, "sawtooth", 0.025],
      wave: [180, 360, 0.32, "triangle", 0.045],
      clear: [440, 880, 0.28, "sine", 0.045],
    }[type];
    if (!settings) return;
    const [start, end, duration, wave, gain] = settings;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(volume);
    volume.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
  }
}
