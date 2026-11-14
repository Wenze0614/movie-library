'use client';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { sceneAudio, type SoundKind } from '@/audio/sceneAudio';

/**
 * A scene button with a volume slider that rises above it while you hover it
 * (or while it, or the slider, has keyboard focus). Turning the volume up
 * while the sound is off turns it on, as if you'd clicked the button.
 */
export function WithVolume({
  kind,
  label,
  on,
  onTurnOn,
  children,
}: {
  kind: SoundKind;
  label: string;
  on: boolean;
  onTurnOn: () => void;
  children: ReactNode;
}) {
  const [value, setValue] = useState(100);
  useEffect(() => setValue(Math.round(sceneAudio.volume(kind) * 100)), [kind]);
  // Touching the slider wakes the audio engine inside the gesture, when there's
  // a sound to start: this one, or rain restored on load and still silent.
  const prime = () => {
    if (!on || !sceneAudio.unlocked) void sceneAudio.prime();
  };
  const primeOnKey = (e: KeyboardEvent) => {
    if (/^(Arrow|Page|Home$|End$)/.test(e.key)) prime();
  };
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
          onPointerDown={prime}
          onPointerUp={prime /* touch browsers only count the end of a touch as a gesture */}
          onKeyDown={primeOnKey}
          onChange={(e) => {
            const next = Number(e.target.value);
            setValue(next);
            sceneAudio.setVolume(kind, next / 100);
            // Each change asks while the sound is off: `on` updates before the next
            // change event, and a request made mid-fade is carried out after it.
            if (next > 0 && !on) onTurnOn();
          }}
        />
      </div>
    </div>
  );
}
