export type SoundName = 'start' | 'waka' | 'eat_fruit' | 'eat_ghost' | 'extra_life' | 'intermission' | 'death';
/** Efectos sintetizados de las mecánicas de nivel. */
export type SfxKind = 'explosion' | 'zap' | 'teleport' | 'tick' | 'gate' | 'spike' | 'poison' | 'boost' | 'rage' | 'summon' | 'shoot' | 'gun' | 'aleix' | 'aina' | 'collect' | 'rescue' | 'hint' | 'decoy' | 'ankh';
export type AmbientKind = 'siren' | 'power' | 'eyes';

const FILES: SoundName[] = ['start', 'waka', 'eat_fruit', 'eat_ghost', 'extra_life', 'intermission', 'death'];
const MUTE_KEY = 'pacman.muted';

interface Loop {
  kind: AmbientKind;
  stage: number;
  gain: GainNode;
  nodes: OscillatorNode[];
}

/**
 * Audio con Web Audio API. Los efectos son los WAV del arcade (public/assets/audio);
 * la sirena, el estado asustado y los ojos son bucles sintetizados que cambian según el juego.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loop: Loop | null = null;
  private wakaEnd = 0;
  private noise: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* sin almacenamiento */
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      void this.loadAll();
    } catch {
      this.ctx = null; // navegador sin Web Audio: el juego sigue sin sonido
    }
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      FILES.map(async (name) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}assets/audio/${name}.wav`);
          const data = await res.arrayBuffer();
          this.buffers.set(name, await ctx.decodeAudioData(data));
        } catch {
          /* un sonido que no carga no debe romper el juego */
        }
      }),
    );
  }

  /** Debe llamarse dentro de un gesto del usuario (iOS/Safari lo exigen). */
  unlock(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx) void this.ctx.resume();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  }

  /** Duración en segundos (0 si aún no cargó). */
  duration(name: SoundName): number {
    return this.buffers.get(name)?.duration ?? 0;
  }

  play(name: SoundName, volume = 1): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !this.master || !buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    src.start();
  }

  /** El "waka" dura casi un segundo: se encadena sin solaparse mientras se siguen comiendo puntos. */
  waka(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.currentTime < this.wakaEnd) return;
    this.play('waka', 0.9);
    this.wakaEnd = ctx.currentTime + this.duration('waka') * 0.95;
  }

  private noiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  /** Efectos cortos generados al vuelo (explosiones, disparos, portales…): no necesitan archivos. */
  sfx(kind: SfxKind): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + delay + dur);
      gain.gain.setValueAtTime(vol, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      osc.connect(gain).connect(master);
      osc.start(t + delay);
      osc.stop(t + delay + dur + 0.02);
    };
    const burst = (dur: number, vol: number, f0: number, f1: number) => {
      const buf = this.noiseBuffer();
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(f0, t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(gain).connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    };
    switch (kind) {
      case 'explosion':
        burst(0.75, 0.9, 2400, 70);
        tone('sine', 130, 32, 0.65, 0.8);
        break;
      case 'zap':
        tone('sawtooth', 1600, 160, 0.24, 0.16);
        burst(0.1, 0.12, 6000, 1500);
        break;
      case 'teleport':
        tone('sine', 240, 1400, 0.2, 0.22);
        tone('triangle', 1400, 300, 0.2, 0.14, 0.2);
        break;
      case 'tick':
        tone('square', 920, 920, 0.05, 0.1);
        break;
      case 'gate':
        tone('square', 150, 60, 0.14, 0.18);
        burst(0.08, 0.15, 900, 200);
        break;
      case 'spike':
        burst(0.1, 0.28, 3200, 1200);
        break;
      case 'ankh':
        // Acorde solemne que sube y una onda de aire.
        for (const f of [220, 277, 330, 440]) tone('triangle', f, f * 1.01, 0.9, 0.12);
        tone('sine', 660, 1320, 0.7, 0.1, 0.1);
        burst(0.5, 0.18, 800, 3200);
        break;
      case 'gun':
        // Pistola: clic metálico de montar el arma y una carga que sube.
        burst(0.05, 0.3, 5000, 2500);
        tone('square', 180, 180, 0.04, 0.12, 0.05);
        tone('sawtooth', 320, 1100, 0.26, 0.12, 0.1);
        break;
      case 'aleix':
        // Aleix: juguetón, como un "bip-bop" rápido.
        tone('square', 700, 1050, 0.09, 0.12);
        tone('square', 1050, 700, 0.09, 0.12, 0.09);
        tone('square', 700, 1400, 0.14, 0.12, 0.18);
        break;
      case 'aina':
        // Aina: dos campanitas suaves.
        tone('sine', 988, 988, 0.22, 0.16);
        tone('sine', 1319, 1319, 0.3, 0.16, 0.12);
        tone('sine', 1976, 1976, 0.25, 0.07, 0.12);
        break;
      case 'collect':
        tone('sine', 880, 1320, 0.1, 0.16);
        tone('sine', 1320, 1760, 0.14, 0.14, 0.09);
        break;
      case 'rescue':
        for (const [k, f] of [523, 659, 784, 1047].entries()) tone('triangle', f, f, 0.16, 0.16, k * 0.1);
        tone('sine', 1568, 1568, 0.4, 0.1, 0.4);
        break;
      case 'hint':
        tone('sine', 600, 1500, 0.28, 0.14);
        tone('sine', 900, 2100, 0.2, 0.06, 0.05);
        break;
      case 'decoy':
        tone('triangle', 420, 180, 0.2, 0.2);
        tone('triangle', 620, 300, 0.16, 0.12, 0.18);
        break;
      case 'shoot':
        tone('sawtooth', 1500, 240, 0.14, 0.14);
        tone('square', 900, 300, 0.1, 0.06);
        break;
      case 'summon':
        tone('sine', 523, 523, 0.12, 0.16);
        tone('sine', 659, 659, 0.12, 0.16, 0.1);
        tone('sine', 784, 784, 0.12, 0.16, 0.2);
        tone('triangle', 1047, 1047, 0.25, 0.14, 0.3);
        break;
      case 'rage':
        tone('sawtooth', 70, 200, 0.45, 0.22);
        tone('square', 140, 420, 0.3, 0.08, 0.05);
        burst(0.18, 0.2, 1800, 300);
        break;
      case 'boost':
        tone('sine', 280, 2000, 0.32, 0.2);
        tone('sawtooth', 560, 2600, 0.28, 0.08, 0.04);
        break;
      case 'poison':
        tone('sawtooth', 200, 55, 0.55, 0.18);
        tone('sine', 420, 110, 0.5, 0.12, 0.05);
        break;
    }
  }

  /** Bucle de fondo: sirena (stage 0–4 según puntos restantes), asustado u ojos. null lo detiene. */
  setAmbient(kind: AmbientKind | null, stage = 0): void {
    if (this.loop && this.loop.kind === kind && this.loop.stage === stage) return;
    this.stopLoop();
    const ctx = this.ctx;
    if (!kind || !ctx || !this.master) return;

    const params = {
      siren: { type: 'triangle', base: 330 + stage * 55, rate: 1.6 + stage * 0.35, depth: 110, vol: 0.1 },
      power: { type: 'square', base: 380, rate: 9, depth: 150, vol: 0.045 },
      eyes: { type: 'sine', base: 900, rate: 5.5, depth: 380, vol: 0.09 },
    }[kind] as { type: OscillatorType; base: number; rate: number; depth: number; vol: number };

    const osc = ctx.createOscillator();
    osc.type = params.type;
    osc.frequency.value = params.base;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = params.rate;
    const depth = ctx.createGain();
    depth.gain.value = params.depth;
    lfo.connect(depth).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(params.vol, ctx.currentTime + 0.04);
    osc.connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.loop = { kind, stage, gain, nodes: [osc, lfo] };
  }

  private stopLoop(): void {
    const ctx = this.ctx;
    const l = this.loop;
    if (!ctx || !l) return;
    const t = ctx.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0, t + 0.04);
    for (const n of l.nodes) n.stop(t + 0.06);
    this.loop = null;
  }
}
