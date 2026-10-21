import 'server-only';
import { readSettings } from './settings';
import type { Movie, TmdbSearchResult } from './types';

/**
 * Optional TMDB integration. The key comes from the key button in the header
 * (saved to data/settings.json), falling back to TMDB_API_KEY in .env.local.
 * Accepts either a v3 API key (sent as ?api_key=) or a v4 read token (sent as Bearer).
 */
const API = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

export async function tmdbKey(): Promise<{ key: string; source: 'settings' | 'env' } | null> {
  const saved = (await readSettings()).tmdbApiKey?.trim();
  if (saved) return { key: saved, source: 'settings' };
  const env = process.env.TMDB_API_KEY?.trim();
  return env ? { key: env, source: 'env' } : null;
}

export async function tmdbEnabled() {
  return Boolean(await tmdbKey());
}

/** Checks a pasted key with TMDB before it's saved. */
export async function verifyTmdbKey(key: string): Promise<'ok' | 'rejected' | 'unreachable'> {
  try {
    await tmdb('/configuration', {}, key);
    return 'ok';
  } catch (err) {
    return /TMDB \S+ failed: 40[13]/.test((err as Error).message) ? 'rejected' : 'unreachable';
  }
}

async function tmdb<T>(pathname: string, params: Record<string, string> = {}, keyOverride?: string): Promise<T> {
  const key = keyOverride ?? (await tmdbKey())?.key;
  if (!key) throw new Error('No TMDB key yet. Add one with the key button in the top-right corner.');
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const isBearer = key.length > 40; // v4 tokens are long JWTs, v3 keys are 32 chars
  if (!isBearer) url.searchParams.set('api_key', key);
  const res = await fetch(url, {
    headers: { accept: 'application/json', ...(isBearer ? { authorization: `Bearer ${key}` } : {}) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`TMDB ${pathname} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

const yearOf = (date?: string) => (date ? Number(date.slice(0, 4)) || null : null);

interface RawSearch {
  results: { id: number; title: string; release_date?: string; poster_path: string | null; overview: string }[];
}

export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
  const data = await tmdb<RawSearch>('/search/movie', { query, include_adult: 'false' });
  return data.results.slice(0, 12).map((r) => ({
    tmdbId: r.id,
    title: r.title,
    year: yearOf(r.release_date),
    posterUrl: r.poster_path ? `${TMDB_IMAGE}/w185${r.poster_path}` : null,
    overview: r.overview,
  }));
}

interface RawDetails {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  runtime: number | null;
  tagline: string;
  overview: string;
  genres: { name: string }[];
  poster_path: string | null;
  backdrop_path: string | null;
  credits: {
    cast: { name: string; character: string; order: number }[];
    crew: { name: string; job: string }[];
  };
}

/** Movie metadata from TMDB plus remote image URLs (the caller downloads them). */
export async function tmdbDetails(tmdbId: number) {
  const d = await tmdb<RawDetails>(`/movie/${tmdbId}`, { append_to_response: 'credits' });
  const fields: Partial<Movie> & { title: string } = {
    tmdbId: d.id,
    title: d.title,
    originalTitle: d.original_title !== d.title ? d.original_title : undefined,
    year: yearOf(d.release_date),
    runtime: d.runtime || null,
    tagline: d.tagline ?? '',
    overview: d.overview ?? '',
    genres: d.genres.map((g) => g.name),
    directors: d.credits.crew.filter((c) => c.job === 'Director').map((c) => c.name),
    cast: d.credits.cast
      .sort((a, b) => a.order - b.order)
      .slice(0, 8)
      .map((c) => ({ name: c.name, character: c.character || undefined })),
  };
  return {
    fields,
    posterUrl: d.poster_path ? `${TMDB_IMAGE}/w500${d.poster_path}` : null,
    backdropUrl: d.backdrop_path ? `${TMDB_IMAGE}/w1280${d.backdrop_path}` : null,
  };
}
