'use client';
import { useState } from 'react';
import { sceneAudio } from '@/audio/sceneAudio';

/**
 * A little CD next to the lamp. Click to play generated lo-fi jazz; it spins
 * while playing. The audio engine starts on the first click, since browsers
 * only allow sound after a user gesture.
 */
export function MusicButton() {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setPlaying(!playing); // spin (or stop) right away; the music fades to match
    try {
      setPlaying(await sceneAudio.toggleJazz());
    } finally {
      setBusy(false);
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
