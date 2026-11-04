import 'server-only';
import { readSettings } from './settings';
import { nameSlug } from './people';
import type { Movie, PersonCredit, PersonDetails, TmdbSearchResult } from './types';

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
    cast: { id: number; name: string; character: string; order: number }[];
    crew: { id: number; name: string; job: string }[];
  };
}

type RawCredit = { id: number; name: string; profile_path: string | null };

/** A film's cast and directors, with each person's TMDB id and portrait path. */
export async function tmdbMovieCredits(tmdbId: number) {
  const d = await tmdb<{ cast: RawCredit[]; crew: (RawCredit & { job: string })[] }>(`/movie/${tmdbId}/credits`);
  return { cast: d.cast, directors: d.crew.filter((c) => c.job === 'Director') };
}

interface RawPerson {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string | null;
  profile_path: string | null;
  movie_credits: {
    cast: RawPersonCredit[];
    crew: (RawPersonCredit & { job: string })[];
  };
}
type RawPersonCredit = { id: number; title: string; release_date?: string; character?: string; poster_path: string | null; vote_count: number };

/** The best known (most voted) 40 of a filmography, once each. */
function bestKnown(credits: RawPersonCredit[]): PersonCredit[] {
  const seen = new Set<number>();
  return credits
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .sort((a, b) => b.vote_count - a.vote_count)
    .slice(0, 40)
    .map((c) => ({
      tmdbId: c.id,
      title: c.title,
      year: yearOf(c.release_date),
      character: c.character ?? '',
      posterPath: c.poster_path,
      voteCount: c.vote_count,
    }));
}

/** A person's details, acting credits and films directed (best known first), trimmed for caching. */
export async function tmdbPerson(personId: number): Promise<PersonDetails> {
  const d = await tmdb<RawPerson>(`/person/${personId}`, { append_to_response: 'movie_credits' });
  return {
    id: d.id,
    name: d.name,
    biography: d.biography,
    birthday: d.birthday,
    deathday: d.deathday,
    placeOfBirth: d.place_of_birth,
    department: d.known_for_department,
    profilePath: d.profile_path,
    credits: bestKnown(d.movie_credits.cast),
    directed: bestKnown(d.movie_credits.crew.filter((c) => c.job === 'Director')),
    fetchedAt: new Date().toISOString(),
  };
}

/** The film's backdrop at full size (for a desktop wallpaper), or null if it has none. */
export async function tmdbOriginalBackdrop(tmdbId: number) {
  const d = await tmdb<Pick<RawDetails, 'backdrop_path'>>(`/movie/${tmdbId}`);
  return d.backdrop_path ? `${TMDB_IMAGE}/original${d.backdrop_path}` : null;
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
    directorIds: Object.fromEntries(d.credits.crew.filter((c) => c.job === 'Director').map((c) => [nameSlug(c.name), c.id])),
    cast: d.credits.cast
      .sort((a, b) => a.order - b.order)
      .slice(0, 8)
      .map((c) => ({ name: c.name, character: c.character || undefined, tmdbId: c.id })),
  };
  return {
    fields,
    posterUrl: d.poster_path ? `${TMDB_IMAGE}/w500${d.poster_path}` : null,
    backdropUrl: d.backdrop_path ? `${TMDB_IMAGE}/w1280${d.backdrop_path}` : null,
  };
}
