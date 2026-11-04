import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mediaUrl } from './media';
import { nameSlug, personKey } from './people';
import { DATA_DIR, MEDIA_DIRS, listMovies, updateMovie } from './store';
import { TMDB_IMAGE, tmdbKey, tmdbMovieCast, tmdbPerson } from './tmdb';
import type { Movie, PersonDetails, PoolPerson } from './types';

/**
 * The people in your library: everyone in the saved cast of your films.
 *
 * The pool itself is worked out from the films every time, so adding or
 * deleting a film updates it. What's stored is small: each cast credit's TMDB
 * person id, a w185 portrait per person (data/portraits, ~8 KB), and, once
 * you open someone's page, their details (data/people/<id>.json). Posters of
 * their other films are never stored; the page shows them from TMDB.
 */
const PEOPLE_DIR = path.join(DATA_DIR, 'people');
/** Cached person details are refreshed after this long. */
const DETAILS_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

async function portraitFiles() {
  return new Set(await fs.readdir(MEDIA_DIRS.portraits).catch(() => [] as string[]));
}

/** Saves a person's portrait (w185) unless it's already there. */
async function ensurePortrait(personId: number, profilePath: string | null, have: Set<string>) {
  const file = `${personId}.jpg`;
  if (!profilePath || have.has(file)) return;
  const res = await fetch(`${TMDB_IMAGE}/w185${profilePath}`);
  if (!res.ok) return;
  await fs.mkdir(MEDIA_DIRS.portraits, { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ MEDIA_DIRS.portraits, file), Buffer.from(await res.arrayBuffer()));
  have.add(file);
}

/**
 * Matches a film's cast to TMDB people (by name, so lists you edited still
 * match) and saves their portraits. One TMDB request per film; marks the film
 * so it isn't asked again.
 */
export async function linkCast(movie: Movie, have?: Set<string>): Promise<Movie> {
  if (!movie.tmdbId) return movie;
  const credits = await tmdbMovieCast(movie.tmdbId);
  const byName = new Map(credits.map((c) => [nameSlug(c.name), c]));
  const byId = new Map(credits.map((c) => [c.id, c]));
  const cast = movie.cast.map((c) => (c.tmdbId ? c : { ...c, tmdbId: byName.get(nameSlug(c.name))?.id }));
  const files = have ?? (await portraitFiles());
  await Promise.all(
    cast.map((c) => (c.tmdbId ? ensurePortrait(c.tmdbId, byId.get(c.tmdbId)?.profile_path ?? null, files).catch(() => {}) : null)),
  );
  return (await updateMovie(movie.id, { cast, castLinked: true })) ?? movie;
}

/**
 * Links the cast of films that haven't been linked yet (films from before
 * people existed). Quietly skips everything when there's no TMDB key or no
 * connection; it'll try again next time.
 */
async function linkLibraryCast(movies: Movie[]): Promise<Movie[]> {
  const todo = movies.filter((m) => m.tmdbId && !m.castLinked);
  if (!todo.length || !(await tmdbKey())) return movies;
  const have = await portraitFiles();
  const linked = new Map<string, Movie>();
  for (let i = 0; i < todo.length; i += 4) {
    const batch = await Promise.all(todo.slice(i, i + 4).map((m) =>
        linkCast(m, have).catch((err) => {
          console.warn(`[people] couldn't link the cast of ${m.id}:`, (err as Error).message);
          return null;
        }),
      ));
    for (const m of batch) if (m) linked.set(m.id, m);
  }
  return movies.map((m) => linked.get(m.id) ?? m);
}

/** Everyone in your films' casts, most watched first. */
export async function peoplePool(): Promise<PoolPerson[]> {
  const movies = await linkLibraryCast(await listMovies());
  const have = await portraitFiles();
  const people = new Map<string, PoolPerson>();
  const idByName = new Map<string, string>();

  // Linked credits first, so hand-typed names can join the same person.
  const credits = movies.flatMap((m) => m.cast.map((c) => ({ m, c })));
  credits.sort((a, b) => Number(Boolean(b.c.tmdbId)) - Number(Boolean(a.c.tmdbId)));
  for (const { m, c } of credits) {
    const slug = nameSlug(c.name);
    if (!slug) continue;
    const key = c.tmdbId ? personKey(c) : (idByName.get(slug) ?? personKey(c));
    let p = people.get(key);
    if (!p) {
      const tmdbId = c.tmdbId ?? null;
      const portrait = tmdbId && have.has(`${tmdbId}.jpg`) ? mediaUrl('portraits', `${tmdbId}.jpg`) : null;
      p = { key, tmdbId, name: c.name, portrait, films: [], watched: 0, watchlist: 0 };
      people.set(key, p);
      if (c.tmdbId) idByName.set(slug, key);
    }
    if (p.films.some((f) => f.id === m.id)) continue;
    p.films.push({ id: m.id, title: m.title, year: m.year, poster: m.poster, status: m.status, rating: m.rating, tmdbId: m.tmdbId, character: c.character });
    if (m.status === 'watched') p.watched++;
    else p.watchlist++;
  }

  return [...people.values()].sort(
    (a, b) => b.watched - a.watched || b.films.length - a.films.length || a.name.localeCompare(b.name),
  );
}

/** A person by URL key; a hand-typed name also finds the TMDB person it was matched to. */
export async function findPerson(key: string): Promise<PoolPerson | null> {
  const pool = await peoplePool();
  return (
    pool.find((p) => p.key === key) ??
    (key.startsWith('n-') ? (pool.find((p) => nameSlug(p.name) === key.slice(2)) ?? null) : null)
  );
}

/**
 * A person's details from TMDB, cached in data/people/<id>.json. Falls back
 * to the cached copy (however old) when TMDB can't be reached, and to null
 * when there's neither.
 */
export async function personDetails(personId: number): Promise<PersonDetails | null> {
  const file = path.join(/*turbopackIgnore: true*/ PEOPLE_DIR, `${Math.trunc(personId)}.json`);
  const cached = await fs
    .readFile(file, 'utf8')
    .then((s) => JSON.parse(s) as PersonDetails)
    .catch(() => null);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < DETAILS_MAX_AGE_MS) return cached;
  if (!(await tmdbKey())) return cached;
  try {
    const fresh = await tmdbPerson(personId);
    await fs.mkdir(PEOPLE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(fresh, null, 2));
    await ensurePortrait(personId, fresh.profilePath, await portraitFiles()).catch(() => {});
    return fresh;
  } catch {
    return cached;
  }
}
