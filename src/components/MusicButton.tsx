'use client';
import { useCallback, useRef, useState } from 'react';
import { sceneAudio } from '@/audio/sceneAudio';

/** What the CD should show right away (given what's playing now), and the change to make. */
type Step = { optimistic: (playingNow: boolean) => boolean; action: () => Promise<unknown> };

/**
 * The jazz's on/off state, shared by the CD (which toggles it) and its volume
 * slider (which turns it on when moved). The audio engine starts on the first
 * click, since browsers only allow sound after a user gesture.
 */
export function useJazz() {
  const [playing, setPlaying] = useState(false);
  const busy = useRef(false);
  // A click or slider turn while the music is still fading: done once it settles (the latest wins).
  const next = useRef<Step | null>(null);

  const run = useCallback(async (step: Step) => {
    if (busy.current) {
      next.current = step;
      return;
    }
    busy.current = true;
    setPlaying(step.optimistic(sceneAudio.jazzPlaying)); // spin (or stop) right away; the music fades to match
    try {
      await step.action();
    } catch (err) {
      console.error('The jazz could not start or stop:', err);
    } finally {
      busy.current = false;
      setPlaying(sceneAudio.jazzPlaying); // always end up showing what's really playing
    }
    const queued = next.current;
    next.current = null;
    if (queued) void run(queued);
  }, []);

  // Decides at run time, so a toggle queued behind a fade flips what's playing then.
  const toggle = useCallback(
    () =>
      run({
        optimistic: (playingNow) => !playingNow,
        action: () => sceneAudio.toggleJazz(),
      }),
    [run],
  );
  const turnOn = useCallback(() => run({ optimistic: () => true, action: () => sceneAudio.playJazz() }), [run]);
  return { playing, toggle, turnOn };
}

/** A little CD next to the lamp. Click to play generated lo-fi jazz; it spins while playing. */
export function MusicButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  const label = playing ? 'Pause the jazz' : 'Play some jazz';
  return (
    <button type="button" className="cd-toggle" onClick={onToggle} aria-pressed={playing} title={label}>
      <span className="cd" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
