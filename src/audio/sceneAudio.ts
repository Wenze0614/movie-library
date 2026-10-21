'use client';
import type { LofiJazz } from './LofiJazz';
import type { RainSound } from './RainSound';

/**
 * One audio engine shared by the jazz and the rain, so the two mix, and the
 * engine sleeps (costing no CPU) only when both are quiet.
 *
 * Browsers only allow sound after a user gesture, so nothing plays until a
 * scene button has been clicked; rain that was restored on page load starts
 * its sound on the next such click.
 */
let ctx: AudioContext | null = null;
let jazz: LofiJazz | null = null;
let rain: RainSound | null = null;
let rainWanted = false;
let unlocked = false;
let sleepTimer: ReturnType<typeof setTimeout> | undefined;

function context() {
  ctx ??= new AudioContext({ latencyHint: 'playback' });
  return ctx;
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

async function startRain() {
  if (!rain) {
    const { RainSound } = await import('./RainSound');
    rain = new RainSound(context());
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

  /** Plays or pauses the jazz; resolves to whether it's now playing. */
  async toggleJazz() {
    await this.unlock();
    if (!jazz) {
      const { LofiJazz } = await import('./LofiJazz');
      jazz = new LofiJazz(context());
    }
    if (jazz.playing) {
      await jazz.pause();
      sleepWhenQuiet();
      return false;
    }
    await wake();
    await jazz.play();
    return true;
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
