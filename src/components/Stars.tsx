'use client';
import { useState } from 'react';

const STAR = 'M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9l-5.8 3.2 1.4-6.4L2.7 9.3l6.5-.7z';

function Star({ fill, size }: { fill: number; size: number }) {
  const id = `s${Math.round(fill * 100)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="star">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
      <path d={STAR} className="star-empty" />
      {fill > 0 && <path d={STAR} className="star-full" clipPath={`url(#${id})`} />}
    </svg>
  );
}

interface Props {
  value: number | null;
  size?: number;
  /** When provided, the stars become an input (half-star steps, click again to clear). */
  onChange?: (value: number | null) => void;
}

export function Stars({ value, size = 14, onChange }: Props) {
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value ?? 0;
  const stars = [0, 1, 2, 3, 4].map((i) => <Star key={i} size={size} fill={Math.max(0, Math.min(1, shown - i))} />);

  if (!onChange) {
    return (
      <span className="stars" aria-label={value ? `${value} out of 5 stars` : 'Not rated'}>
        {stars}
      </span>
    );
  }

  const valueAt = (e: React.MouseEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const raw = ((e.clientX - r.left) / r.width) * 5;
    return Math.max(0.5, Math.ceil(raw * 2) / 2);
  };

  return (
    <span
      className="stars stars-input"
      role="slider"
      tabIndex={0}
      aria-label="Your rating"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? 0}
      aria-valuetext={value ? `${value} stars` : 'Not rated'}
      onMouseMove={(e) => setPreview(valueAt(e))}
      onMouseLeave={() => setPreview(null)}
      onClick={(e) => {
        const v = valueAt(e);
        onChange(v === value ? null : v);
      }}
      onKeyDown={(e) => {
        const cur = value ?? 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(5, cur + 0.5));
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(cur - 0.5 <= 0 ? null : cur - 0.5);
        else if (e.key === 'Backspace' || e.key === 'Delete') onChange(null);
        else return;
        e.preventDefault();
      }}
    >
      {stars}
    </span>
  );
}
