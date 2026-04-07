// Web Audio API synth-based sound effects — no files needed
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.12, slide = 0) {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + duration);
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(); osc.stop(c.currentTime + duration);
  } catch { }
}

function playNoise(duration: number, volume = 0.08) {
  try {
    const c = getCtx();
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(); src.stop(c.currentTime + duration);
  } catch { }
}

export const SFX = {
  shoot: () => {
    playTone(1200, 0.05, 'sine', 0.06, -800);
    playTone(600, 0.07, 'triangle', 0.04, -200);
    playNoise(0.04, 0.02);
  },
  hit: () => {
    playTone(300, 0.1, 'sawtooth', 0.1, -150);
  },
  kill: () => {
    playTone(200, 0.3, 'sawtooth', 0.15, -180);
    setTimeout(() => playTone(100, 0.2, 'square', 0.1), 100);
  },
  death: () => {
    playTone(400, 0.4, 'sawtooth', 0.15, -350);
    setTimeout(() => playTone(150, 0.3, 'square', 0.1), 150);
  },
  powerup: () => {
    playTone(600, 0.1, 'sine', 0.1);
    setTimeout(() => playTone(900, 0.15, 'sine', 0.1), 80);
  },
  abilityUse: () => {
    playTone(500, 0.12, 'triangle', 0.1, 300);
  },
  roundWin: () => {
    playTone(523, 0.15, 'sine', 0.12);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 120);
    setTimeout(() => playTone(784, 0.25, 'sine', 0.12), 240);
  },
  gameOver: () => {
    playTone(400, 0.2, 'sine', 0.12);
    setTimeout(() => playTone(350, 0.2, 'sine', 0.12), 200);
    setTimeout(() => playTone(300, 0.4, 'sine', 0.12), 400);
  },
  wallPlace: () => {
    playTone(200, 0.15, 'triangle', 0.08, 100);
    playNoise(0.1, 0.03);
  },
  grenadeBlast: () => {
    playTone(140, 0.2, 'sawtooth', 0.18, -90);
    setTimeout(() => playTone(90, 0.22, 'square', 0.15, -40), 40);
    playNoise(0.16, 0.08);
  },
};
