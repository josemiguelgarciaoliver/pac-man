export type SoundName = 'start' | 'waka' | 'eat_fruit' | 'eat_ghost' | 'extra_life' | 'intermission' | 'death';
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
