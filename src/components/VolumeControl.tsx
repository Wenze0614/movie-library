'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { sceneAudio, type SoundKind } from '@/audio/sceneAudio';

/**
 * A scene button with a volume slider that rises above it while you hover it
 * (or while it, or the slider, has keyboard focus).
 */
export function WithVolume({ kind, label, children }: { kind: SoundKind; label: string; children: ReactNode }) {
  const [value, setValue] = useState(100);
  useEffect(() => setValue(Math.round(sceneAudio.volume(kind) * 100)), [kind]);
  return (
    <div className="with-volume">
      {children}
      <div className="volume-pop">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          style={{ '--fill': `${value}%` } as React.CSSProperties}
          aria-label={label}
          aria-valuetext={`${value}%`}
          onChange={(e) => {
            const next = Number(e.target.value);
            setValue(next);
            sceneAudio.setVolume(kind, next / 100);
          }}
        />
      </div>
    </div>
  );
}
