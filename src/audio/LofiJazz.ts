/**
 * A tiny generative lo-fi jazz combo built on the Web Audio API: a warm
 * electric piano comping through happy jazz progressions, a vibraphone
 * playing phrased melodies, upright bass, brushed drums, vinyl crackle and
 * tape wobble.
 *
 * Everything is synthesized and composed on the fly, so the music is
 * original (no licences), needs no audio files and never loops exactly.
 *
 * It works with a realtime AudioContext (the site) or an OfflineAudioContext
 * (rendering a clip): scheduling is driven by `scheduleUntil(time)`.
 */

const BPM = 70;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
/** Where the off-beat eighth falls inside a beat (0.5 = straight, ~0.66 = triplet swing). */
const SWING = 0.63;
/** Progressions are written in C; this transposes them (−2 = B♭, a warm jazz key). */
const KEY = -2;
/** Master volume while playing. */
const PLAY_LEVEL = 1;

interface Chord {
  bass: number;
  /** Rootless piano voicing (MIDI notes). */
  keys: number[];
}

const c = (bass: number, keys: number[]): Chord => ({ bass, keys });

// Voicings, written in C.
const Dm9 = c(38, [53, 57, 60, 64]);
const G13 = c(43, [53, 57, 59, 64]);
const G9sus = c(43, [53, 57, 60, 64]);
const Cmaj9 = c(36, [52, 55, 59, 62]);
const C69 = c(36, [52, 57, 62, 67]);
const A13 = c(45, [55, 59, 61, 66]);
const Em9 = c(40, [55, 59, 62, 66]);
const Em7 = c(40, [55, 59, 62, 64]);
const Am9 = c(45, [55, 59, 60, 64]);
const Fmaj9 = c(41, [52, 55, 57, 60]);
const D9 = c(38, [54, 57, 60, 64]);

/** Four-bar loops, one chord per bar, leaning bright and major. */
const PROGRESSIONS: Chord[][] = [
  [Dm9, G13, Cmaj9, A13], // ii – V – I – VI
  [Em9, A13, Dm9, G13], // iii – VI – ii – V
  [C69, Fmaj9, Em7, A13], // I – IV – iii – VI
  [Cmaj9, Am9, Dm9, G13], // I – vi – ii – V
  [Fmaj9, Em7, Dm9, G9sus], // IV – iii – ii – V
  [Cmaj9, D9, Dm9, G13], // I – II – ii – V
];

/** Piano rhythms: [eighth-note slot 0–7, length in beats]. Slot 7 anticipates the next chord. */
const COMPING: [number, number][][] = [
  [[0, 3.6]],
  [[0, 1.5], [3, 2.4]],
  [[1, 1.2], [4, 2.8]],
  [[0, 2], [5, 2.2]],
  [[0, 2.8], [7, 1.2]],
  [[2, 1], [4, 1], [7, 1.2]],
];
/** Lighter patterns used while the vibraphone is playing a phrase. */
const COMPING_SPARSE = [COMPING[0], COMPING[1], COMPING[3]];

/** Two-bar melody rhythms: [eighth slot 0–15, length in eighths]. */
const PHRASES: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 3], [8, 1], [9, 1], [10, 4]],
  [[1, 1], [2, 1], [3, 2], [6, 2], [9, 1], [10, 1], [11, 1], [12, 4]],
  [[0, 2], [2, 1], [3, 1], [4, 2], [6, 4], [12, 1], [13, 1], [14, 2]],
  [[2, 1], [3, 1], [4, 1], [5, 1], [6, 3], [10, 2], [12, 4]],
  [[0, 3], [3, 1], [4, 1], [5, 3], [8, 1], [9, 1], [10, 1], [11, 1], [12, 4]],
  [[1, 1], [2, 2], [4, 1], [5, 1], [6, 6]],
  [[0, 1], [1, 1], [2, 2], [5, 1], [6, 2], [8, 2], [11, 1], [12, 3]],
];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MELODY_LOW = 64;
const MELODY_HIGH = 84;

const mtof = (m: number) => 440 * Math.pow(2, (m + KEY - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const pcDistance = (a: number, b: number) => Math.min((a - b + 12) % 12, (b - a + 12) % 12);

/** Notes a melody can use over a chord: its tones, plus scale notes that don't rub against them. */
function melodyNotes(chord: Chord) {
  const tones = new Set([chord.bass, ...chord.keys].map((n) => n % 12));
  const allowed = new Set([...tones, ...MAJOR.filter((s) => [...tones].every((t) => pcDistance(s, t) >= 2))]);
  const all: number[] = [];
  const chordTones: number[] = [];
  for (let n = MELODY_LOW; n <= MELODY_HIGH; n++) {
    if (allowed.has(n % 12)) all.push(n);
    // Favour the sweet tones for landing notes: 3rds, 6ths/13ths, 7ths, 9ths (not the root).
    if (tones.has(n % 12) && n % 12 !== chord.bass % 12) chordTones.push(n);
  }
  return { all, chordTones };
}

const nearest = (xs: number[], target: number) => xs.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), xs[0]);

export class LofiJazz {
  private master: GainNode;
  private keysBus: GainNode;
  private vibesBus: GainNode;
  private bassBus: GainNode;
  private drumBus: GainNode;
  private reverbSend: GainNode;
  private wobble: OscillatorNode;
  private wobbleDepth: GainNode;
  private noise: AudioBuffer;
  private crackle: AudioBufferSourceNode | null = null;

  private bar = 0;
  private nextBarTime = 0;
  private progression = PROGRESSIONS[0];
  private melodyPitch = 72;
  private phraseActive = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  playing = false;

  constructor(private ctx: BaseAudioContext) {
    // Master: warm low-pass → soft saturation → gentle compression → volume.
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    tone.Q.value = 0.4;
    const warmth = ctx.createWaveShaper();
    warmth.curve = softClip();
    warmth.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.25;
    tone.connect(warmth).connect(comp).connect(this.master).connect(ctx.destination);

    // A small room for everything to sit in.
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.8, 2.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.34;
    this.reverbSend.connect(reverb).connect(tone);

    this.keysBus = this.bus(0.6, 0.85, tone, 2600);
    this.vibesBus = this.bus(0.7, 1.3, tone, 4200);
    this.bassBus = this.bus(0.48, 0.12, tone);
    this.drumBus = this.bus(0.55, 0.35, tone, 4800);

    // Electric piano chorus: a short delay swayed by a slow LFO.
    const chorus = ctx.createDelay(0.05);
    chorus.delayTime.value = 0.014;
    const chorusLfo = ctx.createOscillator();
    chorusLfo.frequency.value = 0.35;
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.0025;
    chorusLfo.connect(chorusDepth).connect(chorus.delayTime);
    chorusLfo.start();
    const chorusMix = ctx.createGain();
    chorusMix.gain.value = 0.45;
    this.keysBus.connect(chorus).connect(chorusMix).connect(tone);

    // Vibraphone motor: a gentle tremolo on the whole vibes bus.
    const motor = ctx.createOscillator();
    motor.frequency.value = 4.6;
    const motorDepth = ctx.createGain();
    motorDepth.gain.value = 0.18;
    motor.connect(motorDepth).connect(this.vibesBus.gain);
    motor.start();

    // Tape wobble: every pitched oscillator's detune follows this slow LFO (± cents).
    this.wobble = ctx.createOscillator();
    this.wobble.frequency.value = 0.55;
    this.wobbleDepth = ctx.createGain();
    this.wobbleDepth.gain.value = 6;
    this.wobble.connect(this.wobbleDepth);
    this.wobble.start();

    this.noise = noiseBuffer(ctx, 2);
  }

  /** A mix bus: level, reverb send, and an optional low-pass to keep it warm. */
  private bus(level: number, reverb: number, out: AudioNode, lowpass?: number) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    let tail: AudioNode = g;
    if (lowpass) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpass;
      lp.Q.value = 0.3;
      g.connect(lp);
      tail = lp;
    }
    tail.connect(out);
    const send = this.ctx.createGain();
    send.gain.value = reverb;
    tail.connect(send).connect(this.reverbSend);
    return g;
  }

  // ---------------------------------------------------------------- transport

  /** Starts (or resumes) playing in a realtime context, fading in. */
  async play() {
    const ctx = this.ctx as AudioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    this.playing = true;
    const now = ctx.currentTime;
    this.nextBarTime = now + 0.08;
    this.startCrackle(now);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(PLAY_LEVEL, now + 1.5);
    this.scheduleUntil(now + 1.2);
    // Generous lookahead, so a busy main thread never causes gaps.
    this.timer = setInterval(() => this.scheduleUntil(ctx.currentTime + 1.2), 150);
  }

  /** Fades out and stops scheduling (the shared engine decides when to sleep). */
  async pause() {
    const ctx = this.ctx as AudioContext;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.7);
    await new Promise((r) => setTimeout(r, 750));
    if (!this.playing) {
      this.crackle?.stop();
      this.crackle = null;
    }
  }

  async dispose() {
    if (this.timer) clearInterval(this.timer);
    if ('close' in this.ctx) await (this.ctx as AudioContext).close();
  }

  /** Renders a clip offline (used to check the mix; the site plays live). */
  static async renderClip(seconds: number, sampleRate = 44100) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const band = new LofiJazz(ctx);
    band.master.gain.setValueAtTime(0, 0);
    band.master.gain.linearRampToValueAtTime(PLAY_LEVEL, 1.5);
    band.master.gain.setValueAtTime(PLAY_LEVEL, seconds - 2);
    band.master.gain.linearRampToValueAtTime(0, seconds);
    band.startCrackle(0);
    band.nextBarTime = 0.05;
    band.scheduleUntil(seconds);
    return ctx.startRendering();
  }

  scheduleUntil(until: number) {
    while (this.nextBarTime < until) {
      this.scheduleBar(this.bar, this.nextBarTime);
      this.nextBarTime += BAR;
      this.bar++;
    }
  }

  // ---------------------------------------------------------------- arrangement

  private scheduleBar(bar: number, t: number) {
    // New progression every 8 bars (sometimes keeps the same one).
    if (bar % 8 === 0 && (bar === 0 || Math.random() < 0.65)) this.progression = pick(PROGRESSIONS);
    const chord = this.progression[bar % 4];
    const next = this.progression[(bar + 1) % 4];

    // Intro: piano alone, then bass, then drums and the melody. A drum break now and then.
    const withBass = bar >= 2;
    const withDrums = bar >= 4 && !(bar % 16 === 15 && Math.random() < 0.5);

    // Melody in two-bar phrases, with the occasional breath between them.
    if (bar % 2 === 0) {
      this.phraseActive = bar >= 4 && Math.random() < 0.8;
      if (this.phraseActive) this.melodyPhrase(t, chord, next);
    }

    this.compBar(t, chord, next, this.phraseActive);
    if (withBass) this.bassBar(t, chord, next);
    if (withDrums) this.drumBar(t, bar);
  }

  private slot(t: number, eighth: number) {
    const beat = Math.floor(eighth / 2);
    return t + beat * BEAT + (eighth % 2 ? SWING * BEAT : 0) + rand(0, 0.012);
  }

  private compBar(t: number, chord: Chord, next: Chord, sparse: boolean) {
    for (const [eighth, beats] of pick(sparse ? COMPING_SPARSE : COMPING)) {
      const voicing = eighth === 7 ? next : chord; // anticipate the next chord
      const at = this.slot(t, eighth);
      const vel = rand(0.5, 0.75) * (eighth === 0 ? 1 : 0.85) * (sparse ? 0.85 : 1);
      voicing.keys.forEach((note, i) => this.epiano(at + i * rand(0.006, 0.016), note, vel, beats * BEAT, rand(-0.3, 0.3)));
    }
  }

  private bassBar(t: number, chord: Chord, next: Chord) {
    this.bass(this.slot(t, 0), chord.bass, 0.95, BEAT * 1.8);
    const r = Math.random();
    const second = r < 0.4 ? chord.bass + 7 : r < 0.7 ? chord.bass + 12 : chord.bass;
    this.bass(this.slot(t, 4), second, 0.75, BEAT * 1.4);
    if (Math.random() < 0.45) {
      // Chromatic approach into the next bar's root.
      const target = next.bass + (next.bass - chord.bass > 6 ? -12 : 0);
      this.bass(this.slot(t, 7), target + (Math.random() < 0.5 ? 1 : -1), 0.6, BEAT * 0.4);
    }
  }

  private drumBar(t: number, bar: number) {
    this.kick(this.slot(t, 0), 0.8);
    if (Math.random() < 0.35) this.kick(this.slot(t, 5), 0.45);
    this.kick(this.slot(t, 4), 0.6);
    // Brush swishes on 2 and 4, with the odd ghost note.
    this.brush(this.slot(t, 2), 0.7);
    this.brush(this.slot(t, 6), 0.75);
    if (Math.random() < 0.3) this.brush(this.slot(t, 7), 0.25);
    // Ride: "ding, ding-da ding, ding-da".
    for (const [eighth, vel] of [[0, 0.5], [2, 0.7], [3, 0.35], [4, 0.5], [6, 0.7], [7, 0.35]] as const) {
      if (bar % 2 === 1 && eighth === 3 && Math.random() < 0.5) continue;
      this.ride(this.slot(t, eighth), vel);
    }
    // Hi-hat foot on 2 and 4.
    this.hat(this.slot(t, 2), 0.4);
    this.hat(this.slot(t, 6), 0.4);
  }

  /**
   * A two-bar vibraphone phrase. Strong beats land on sweet chord tones,
   * weak beats move stepwise through notes that sit well over the chord, the
   * line rises then falls (or the reverse), and it ends on a held chord tone.
   */
  private melodyPhrase(t: number, first: Chord, second: Chord) {
    const rhythm = pick(PHRASES);
    const rising = Math.random() < 0.5;
    const notes = [melodyNotes(first), melodyNotes(second)];
    let pitch = this.melodyPitch;

    rhythm.forEach(([slot, length], k) => {
      const { all, chordTones } = notes[slot < 8 ? 0 : 1];
      const last = k === rhythm.length - 1;
      const strong = slot % 2 === 0;
      const dir = (k < rhythm.length / 2) === rising ? 1 : -1;

      if (last || (strong && Math.random() < 0.75)) {
        pitch = nearest(chordTones, pitch + dir * pick([1, 2, 3]));
      } else {
        const i = all.indexOf(nearest(all, pitch));
        const step = Math.random() < 0.15 ? -dir : dir * pick([1, 1, 1, 2]);
        pitch = all[Math.max(0, Math.min(all.length - 1, i + step))];
      }
      // Drift back towards the middle of the range so lines don't stick at the edges.
      if (pitch > 80 && dir > 0) pitch = nearest(chordTones, pitch - 5);
      if (pitch < 67 && dir < 0) pitch = nearest(chordTones, pitch + 5);

      const at = this.slot(t + (slot >= 8 ? BAR : 0), slot % 8);
      const dur = (length * BEAT) / 2 + (last ? BEAT : 0);
      const vel = (strong ? rand(0.7, 0.85) : rand(0.55, 0.7)) * (last ? 0.9 : 1);
      // A bluesy slide up from a half step below, now and then.
      if (strong && length >= 2 && Math.random() < 0.22) this.vibes(at - 0.055, pitch - 1, vel * 0.55, 0.05);
      this.vibes(at, pitch, vel, dur);
    });
    this.melodyPitch = pitch;
  }

  // ---------------------------------------------------------------- instruments

  private osc(type: OscillatorType, freq: number, t: number, wobble = true) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (wobble) this.wobbleDepth.connect(o.detune);
    return o;
  }

  private release(oscs: OscillatorNode[], out: AudioNode) {
    oscs[0].onended = () => {
      for (const o of oscs) {
        try {
          this.wobbleDepth.disconnect(o.detune);
        } catch {
          // not connected (wobble-free oscillator)
        }
      }
      out.disconnect();
    };
  }

  /** Warm FM electric piano: a sine carrier, a gentle decaying modulator and a soft tine. */
  private epiano(t: number, midi: number, vel: number, dur: number, pan: number) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const end = t + dur;
    const carrier = this.osc('sine', f, t);
    const mod = this.osc('sine', f, t);
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * 1.25 * vel, t);
    modGain.gain.setTargetAtTime(f * 0.08, t, 0.3);
    mod.connect(modGain).connect(carrier.frequency);

    const tine = this.osc('sine', f * 7.02, t);
    const tineGain = ctx.createGain();
    tineGain.gain.setValueAtTime(0.0001, t);
    tineGain.gain.exponentialRampToValueAtTime(0.02 * vel, t + 0.006);
    tineGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    const amp = ctx.createGain();
    const peak = 0.12 * vel;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    amp.gain.setTargetAtTime(peak * 0.38, t + 0.01, 0.7);
    amp.gain.setTargetAtTime(0.0001, end, 0.16);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    carrier.connect(amp);
    tine.connect(tineGain).connect(amp);
    amp.connect(panner).connect(this.keysBus);
    for (const o of [carrier, mod, tine]) {
      o.start(t);
      o.stop(end + 1);
    }
    this.release([carrier, mod, tine], amp);
  }

  /** Vibraphone: a pure bar tone with a soft 4th-partial shimmer and a long ring. */
  private vibes(t: number, midi: number, vel: number, dur: number) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const fundamental = this.osc('sine', f, t);
    const shimmer = this.osc('sine', f * 4, t);
    const strike = this.osc('sine', f * 9.8, t, false);

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.0001, t);
    shimmerGain.gain.exponentialRampToValueAtTime(0.035 * vel, t + 0.004);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const strikeGain = ctx.createGain();
    strikeGain.gain.setValueAtTime(0.0001, t);
    strikeGain.gain.exponentialRampToValueAtTime(0.008 * vel, t + 0.002);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);

    const amp = ctx.createGain();
    const peak = 0.15 * vel;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    amp.gain.setTargetAtTime(0.0001, t + 0.005, 1.1); // natural ring
    amp.gain.setTargetAtTime(0.0001, t + dur, 0.35); // damper

    const panner = ctx.createStereoPanner();
    panner.pan.value = rand(-0.2, 0.2);
    fundamental.connect(amp);
    shimmer.connect(shimmerGain).connect(amp);
    strike.connect(strikeGain).connect(amp);
    amp.connect(panner).connect(this.vibesBus);
    const stop = t + Math.min(dur + 1.5, 4);
    for (const o of [fundamental, shimmer, strike]) {
      o.start(t);
      o.stop(stop);
    }
    this.release([fundamental, shimmer, strike], amp);
  }

  /** Upright bass: a soft triangle with a woody thump, low-passed. */
  private bass(t: number, midi: number, vel: number, dur: number) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const o = this.osc('triangle', f * 1.015, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, t);
    lp.frequency.setTargetAtTime(340, t, 0.12);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.012);
    amp.gain.setTargetAtTime(0.2 * vel, t + 0.012, 0.3);
    amp.gain.setTargetAtTime(0.0001, t + dur, 0.09);
    o.connect(lp).connect(amp).connect(this.bassBus);
    o.start(t);
    o.stop(t + dur + 0.6);
    this.release([o], amp);
  }

  private kick(t: number, vel: number) {
    const ctx = this.ctx;
    const o = this.osc('sine', 100, t, false);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(amp).connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.4);
    this.release([o], amp);
  }

  private noiseHit(t: number, opts: { type: BiquadFilterType; freq: number; q: number; attack: number; decay: number; level: number }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(opts.level, t + opts.attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.decay);
    src.connect(filter).connect(amp).connect(this.drumBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + opts.attack + opts.decay + 0.05);
    src.onended = () => amp.disconnect();
  }

  private brush(t: number, vel: number) {
    this.noiseHit(t, { type: 'bandpass', freq: rand(1500, 2100), q: 0.7, attack: 0.04, decay: 0.24, level: 0.3 * vel });
  }

  private ride(t: number, vel: number) {
    this.noiseHit(t, { type: 'highpass', freq: 5200, q: 0.5, attack: 0.003, decay: 0.45, level: 0.07 * vel });
  }

  private hat(t: number, vel: number) {
    this.noiseHit(t, { type: 'highpass', freq: 7000, q: 0.5, attack: 0.002, decay: 0.05, level: 0.06 * vel });
  }

  /** Looping vinyl: a soft hiss with sparse pops. */
  private startCrackle(t: number) {
    if (this.crackle) return;
    const ctx = this.ctx;
    const seconds = 4;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.012;
        if (Math.random() < 0.00018) d[i] += (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.6);
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const amp = ctx.createGain();
    amp.gain.value = 0.1;
    src.connect(hp).connect(amp).connect(this.master);
    src.start(t);
    this.crackle = src;
  }
}

// ---------------------------------------------------------------- helpers

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Stereo reverb tail: decaying noise. */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Gentle tape-style saturation. */
function softClip() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
  }
  return curve;
}
