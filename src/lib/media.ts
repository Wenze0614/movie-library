import type { Movie } from './types';

/** URL for a stored image: local files go through /api/media, remote URLs pass through. */
export function mediaUrl(kind: 'posters' | 'backdrops', file: string | null | undefined) {
  if (!file) return null;
  return /^https?:\/\//.test(file) ? file : `/api/media/${kind}/${encodeURIComponent(file)}`;
}

export const posterUrl = (m: Pick<Movie, 'poster'>) => mediaUrl('posters', m.poster);
export const backdropUrl = (m: Pick<Movie, 'backdrop'>) => mediaUrl('backdrops', m.backdrop);

/**
 * Fixed locale so server and browser render the same text (a locale-dependent
 * date would cause a hydration mismatch). Gives "4 Oct 2026".
 */
const DATE_LOCALE = 'en-GB';

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(DATE_LOCALE, opts);
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function lastWatched(m: Pick<Movie, 'watchDates'>) {
  return [...m.watchDates].sort().at(-1) ?? null;
}
