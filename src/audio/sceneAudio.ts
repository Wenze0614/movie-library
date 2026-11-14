'use client';
import type { LofiJazz } from './LofiJazz';
import type { RainSound } from './RainSound';

/**
 * One audio engine shared by the jazz and the rain, so the two mix, and the
 * engine sleeps (costing no CPU) only when both are quiet.
 *
 * Browsers only allow sound after a user gesture, so nothing plays until a
 * scene button is clicked or a volume slider touched; rain that was restored
 * on page load starts its sound on the next such gesture.
 */
let ctx: AudioContext | null = null;
let jazz: LofiJazz | null = null;
let rain: RainSound | null = null;
let rainWanted = false;
let unlocked = false;
let sleepTimer: ReturnType<typeof setTimeout> | undefined;

export type SoundKind = 'jazz' | 'rain';

/**
 * Each sound has its own volume, a gain in front of the speakers. The slider
 * position (0–1) is squared into loudness so the quiet end fades smoothly,
 * and it's remembered in this browser.
 */
const VOLUME_KEYS: Record<SoundKind, string> = { jazz: 'cinema.volume.jazz', rain: 'cinema.volume.rain' };
const volumes: Record<SoundKind, number> = { jazz: 1, rain: 1 };
const buses: Partial<Record<SoundKind, GainNode>> = {};
let volumesLoaded = false;
const loudness = (position: number) => position * position;

function loadVolumes() {
  if (volumesLoaded) return;
  volumesLoaded = true;
  try {
    for (const kind of Object.keys(VOLUME_KEYS) as SoundKind[]) {
      const saved = localStorage.getItem(VOLUME_KEYS[kind]);
      const value = saved === null ? NaN : Number(saved);
      if (value >= 0 && value <= 1) volumes[kind] = value;
    }
  } catch {}
}

function context() {
  ctx ??= new AudioContext({ latencyHint: 'playback' });
  return ctx;
}

/** The volume control a sound plays through (made with the audio engine). */
function bus(kind: SoundKind) {
  if (!buses[kind]) {
    loadVolumes();
    const gain = context().createGain();
    gain.gain.value = loudness(volumes[kind]);
    gain.connect(context().destination);
    buses[kind] = gain;
  }
  return buses[kind];
}

async function wake() {
  clearTimeout(sleepTimer);
  const c = context();
  if (c.state === 'suspended') await c.resume();
}

function sleepWhenQuiet() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (!jazz?.playing && !rain?.playing) void ctx?.suspend();
  }, 2500);
}

async function loadJazz() {
  if (!jazz) {
    const { LofiJazz } = await import('./LofiJazz');
    jazz = new LofiJazz(context(), bus('jazz'));
  }
  return jazz;
}

async function startRain() {
  if (!rain) {
    const { RainSound } = await import('./RainSound');
    rain = new RainSound(context(), bus('rain'));
  }
  await wake();
  rain.start();
}

export const sceneAudio = {
  /** Call from a click on a scene button. */
  async unlock() {
    if (unlocked) return;
    unlocked = true;
    if (rainWanted) await startRain();
  },

  /**
   * Call from the first touch of a volume slider (pointer or key down): starts
   * the audio engine while the browser still counts it as a gesture, so the
   * sound the slider turns on can play. Sleeps again if nothing does.
   */
  async prime() {
    const woke = wake(); // resumes right away, inside the gesture
    try {
      await this.unlock();
      await woke;
    } catch (err) {
      console.error('Audio could not start:', err);
    }
    sleepWhenQuiet();
  },

  /** Whether a gesture has let sound start yet. */
  get unlocked() {
    return unlocked;
  },

  /** Whether the jazz is playing right now. */
  get jazzPlaying() {
    return jazz?.playing ?? false;
  },

  /** Plays or pauses the jazz; resolves to whether it's now playing. */
  async toggleJazz() {
    await this.unlock();
    const j = await loadJazz();
    if (j.playing) {
      await j.pause();
      sleepWhenQuiet();
      return false;
    }
    await wake();
    await j.play();
    return true;
  },

  /** Plays the jazz if it isn't already; resolves to true. */
  async playJazz() {
    await this.unlock();
    const j = await loadJazz();
    if (!j.playing) {
      await wake();
      await j.play();
    }
    return true;
  },

  /** A sound's volume, 0–1 (the slider position). */
  volume(kind: SoundKind) {
    loadVolumes();
    return volumes[kind];
  },

  /** Sets a sound's volume (0–1). Doesn't start the audio engine; it applies once the sound plays. */
  setVolume(kind: SoundKind, position: number) {
    loadVolumes();
    volumes[kind] = Math.min(1, Math.max(0, position));
    try {
      localStorage.setItem(VOLUME_KEYS[kind], String(volumes[kind]));
    } catch {}
    const gain = buses[kind];
    // A short glide rather than a jump, so moving the slider never clicks.
    if (gain && ctx) gain.gain.setTargetAtTime(loudness(volumes[kind]), ctx.currentTime, 0.04);
  },

  async setRain(on: boolean) {
    rainWanted = on;
    if (!unlocked) return;
    if (on) await startRain();
    else if (rain) {
      await rain.stop();
      sleepWhenQuiet();
    }
  },
};
