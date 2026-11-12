/**
 * Soft, synthesized rain: a gentle hiss that swells in slow gusts, a low
 * patter underneath, and little drops tapping on the window glass.
 * No audio files, like the jazz. Works in a realtime or an offline context.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Overall level: about 11 dB under the jazz, so it sits behind the music. */
const LEVEL = 0.6;

/** Stereo pink-ish noise (Paul Kellet's filter): softer than white noise, like real rain. */
function pinkNoise(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

export class RainSound {
  playing = false;
  private out: GainNode;
  private noise: AudioBuffer;
  private taps: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTap = 0;

  /** `output`: where the rain goes (the speakers, or a volume control in front of them). */
  constructor(
    private ctx: BaseAudioContext,
    output: AudioNode = ctx.destination,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(output);
    this.taps = ctx.createGain();
    this.taps.gain.value = 1;
    this.taps.connect(this.out);
    this.noise = pinkNoise(ctx, 6);
  }

  /** Builds the continuous layers starting at `t`. */
  private startBed(t: number) {
    const ctx = this.ctx;
    const loop = (offset: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.start(t, offset);
      this.sources.push(src);
      return src;
    };

    // The hiss of rain falling, swelling gently in slow gusts.
    const hiss = loop(0);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 450;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4800;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.32;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.07;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 0.08;
    gust.connect(gustDepth).connect(hissGain.gain);
    gust.start(t);
    this.sources.push(gust);
    hiss.connect(hp).connect(lp).connect(hissGain).connect(this.out);

    // A low, soft patter underneath.
    const patter = loop(2.7);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 700;
    const patterGain = ctx.createGain();
    patterGain.gain.value = 0.22;
    patter.connect(low).connect(patterGain).connect(this.out);
  }

  /** Little drops tapping the glass, scheduled up to `until`. */
  private scheduleTaps(until: number) {
    const ctx = this.ctx;
    while (this.nextTap < until) {
      const t = this.nextTap;
      this.nextTap += -Math.log(1 - Math.random()) / 9; // ~9 taps a second, at random
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(2200, 5500);
      bp.Q.value = 1.4;
      const amp = ctx.createGain();
      const level = rand(0.04, 0.16);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(level, t + 0.001);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.015, 0.04));
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.8, 0.8);
      src.connect(bp).connect(amp).connect(pan).connect(this.taps);
      src.start(t, rand(0, 5));
      src.stop(t + 0.06);
      src.onended = () => pan.disconnect();

      // Now and then a fuller "plip" as a bigger drop lands.
      if (Math.random() < 0.06) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(rand(1400, 2200), t);
        o.frequency.exponentialRampToValueAtTime(rand(700, 1000), t + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.012, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        o.connect(g).connect(pan);
        o.start(t);
        o.stop(t + 0.08);
      }
    }
  }

  /** Fades the rain in (realtime). */
  start() {
    if (this.playing) return;
    const ctx = this.ctx as AudioContext;
    this.playing = true;
    const now = ctx.currentTime;
    this.startBed(now);
    this.nextTap = now + 0.2;
    this.scheduleTaps(now + 0.6);
    this.timer = setInterval(() => this.scheduleTaps(ctx.currentTime + 0.6), 150);
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(LEVEL, now + 2.5);
  }

  /** Fades the rain out, then stops everything. */
  async stop() {
    if (!this.playing) return;
    const ctx = this.ctx as AudioContext;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 2);
    await new Promise((r) => setTimeout(r, 2100));
    if (this.playing) return; // turned back on while fading
    for (const s of this.sources) s.stop();
    this.sources = [];
  }

  /** Renders a clip offline (used to check the mix). */
  static async renderClip(seconds: number, sampleRate = 44100) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const rain = new RainSound(ctx);
    rain.out.gain.value = LEVEL;
    rain.startBed(0);
    rain.nextTap = 0.1;
    rain.scheduleTaps(seconds);
    return ctx.startRendering();
  }
}
