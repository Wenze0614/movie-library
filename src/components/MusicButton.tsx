'use client';
import { useEffect, useRef, useState } from 'react';
import type { LofiJazz } from '@/audio/LofiJazz';

/**
 * A little CD next to the lamp. Click to play generated lo-fi jazz; it spins
 * while playing. The audio engine is created on the first click, since
 * browsers only allow sound after a user gesture.
 */
export function MusicButton() {
  const band = useRef<LofiJazz | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => () => void band.current?.dispose(), []);

  async function toggle() {
    if (loading) return;
    if (!band.current) {
      setLoading(true);
      const { LofiJazz } = await import('@/audio/LofiJazz');
      band.current = new LofiJazz(new AudioContext({ latencyHint: 'playback' }));
      setLoading(false);
    }
    if (band.current.playing) {
      setPlaying(false);
      await band.current.pause();
    } else {
      setPlaying(true);
      await band.current.play();
    }
  }

  const label = playing ? 'Pause the jazz' : 'Play some jazz';
  return (
    <button type="button" className="cd-toggle" onClick={toggle} aria-pressed={playing} title={label}>
      <span className="cd" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
