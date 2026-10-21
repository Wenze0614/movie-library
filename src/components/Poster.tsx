import { posterUrl } from '@/lib/media';
import type { Movie } from '@/lib/types';

// Warm night palettes for films without a poster yet.
const PALETTES = [
  ['#2b1d3f', '#c8642c'],
  ['#14243b', '#e0a25a'],
  ['#3a1f1a', '#e8b07a'],
  ['#1d2b26', '#d98a4a'],
  ['#2a1a2e', '#f0b86e'],
  ['#1b1f33', '#b85a3c'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Poster({ movie, className = '' }: { movie: Pick<Movie, 'title' | 'year' | 'poster'>; className?: string }) {
  const src = posterUrl(movie);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`poster ${className}`} src={src} alt={`${movie.title} poster`} loading="lazy" />;
  }
  const h = hash(movie.title);
  const [bg, glow] = PALETTES[h % PALETTES.length];
  const style = {
    '--ph-bg': bg,
    '--ph-glow': glow,
    '--ph-x': `${20 + ((h >> 3) % 60)}%`,
    '--ph-y': `${14 + ((h >> 7) % 22)}%`,
    '--ph-hill': `${15 + ((h >> 11) % 70)}%`,
  } as React.CSSProperties;
  return (
    <div
      className={`poster poster-placeholder ${className}`}
      style={style}
      role="img"
      aria-label={`${movie.title} (no poster yet)`}
    >
      <span className="ph-title">{movie.title}</span>
      {movie.year && <span className="ph-year">{movie.year}</span>}
    </div>
  );
}
