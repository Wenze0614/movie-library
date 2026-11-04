import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mediaUrl } from './media';
import { nameSlug, personKey } from './people';
import { DATA_DIR, MEDIA_DIRS, listMovies, updateMovie } from './store';
import { TMDB_IMAGE, tmdbKey, tmdbMovieCredits, tmdbPerson } from './tmdb';
import type { Movie, PersonDetails, PersonRole, PoolPerson } from './types';

/**
 * The people in your library: everyone in the saved cast or directors of your
 * films. Someone can be both, across films or on the same one.
 *
 * The pool itself is worked out from the films every time, so adding or
 * deleting a film updates it. What's stored is small: each credit's TMDB
 * person id, a w185 portrait per person (data/portraits, ~14 KB), and, once
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
 * Matches a film's cast and directors to TMDB people (by name, so lists you
 * edited still match) and saves their portraits. One TMDB request per film;
 * marks the film so it isn't asked again.
 */
export async function linkPeople(movie: Movie, have?: Set<string>): Promise<Movie> {
  if (!movie.tmdbId) return movie;
  const credits = await tmdbMovieCredits(movie.tmdbId);
  const castByName = new Map(credits.cast.map((c) => [nameSlug(c.name), c]));
  const directorByName = new Map(credits.directors.map((c) => [nameSlug(c.name), c]));
  const cast = movie.cast.map((c) => (c.tmdbId ? c : { ...c, tmdbId: castByName.get(nameSlug(c.name))?.id }));
  const directorIds = { ...movie.directorIds };
  for (const name of movie.directors) {
    const found = directorByName.get(nameSlug(name));
    if (found && !directorIds[nameSlug(name)]) directorIds[nameSlug(name)] = found.id;
  }
  const portraits = new Map([...credits.cast, ...credits.directors].map((c) => [c.id, c.profile_path]));
  const ids = [...cast.map((c) => c.tmdbId), ...Object.values(directorIds)].filter((id): id is number => Boolean(id));
  const files = have ?? (await portraitFiles());
  await Promise.all([...new Set(ids)].map((id) => ensurePortrait(id, portraits.get(id) ?? null, files).catch(() => {})));
  return (await updateMovie(movie.id, { cast, directorIds, castLinked: true, directorsLinked: true })) ?? movie;
}

/**
 * Links the people of films that haven't been linked yet (films from before
 * People, or before directors were tracked). Quietly skips everything when
 * there's no TMDB key or no connection; it'll try again next time.
 */
async function linkLibraryPeople(movies: Movie[]): Promise<Movie[]> {
  const todo = movies.filter((m) => m.tmdbId && (!m.castLinked || !m.directorsLinked));
  if (!todo.length || !(await tmdbKey())) return movies;
  const have = await portraitFiles();
  const linked = new Map<string, Movie>();
  for (let i = 0; i < todo.length; i += 4) {
    const batch = await Promise.all(
      todo.slice(i, i + 4).map((m) =>
        linkPeople(m, have).catch((err) => {
          console.warn(`[people] couldn't link the people of ${m.id}:`, (err as Error).message);
          return null;
        }),
      ),
    );
    for (const m of batch) if (m) linked.set(m.id, m);
  }
  return movies.map((m) => linked.get(m.id) ?? m);
}

/** Everyone in your films' casts and directors, most watched first. */
export async function peoplePool(): Promise<PoolPerson[]> {
  const movies = await linkLibraryPeople(await listMovies());
  const have = await portraitFiles();
  const people = new Map<string, PoolPerson>();
  const idByName = new Map<string, string>();

  const credits: { m: Movie; name: string; tmdbId?: number; role: PersonRole; character?: string }[] = movies.flatMap((m) => [
    ...m.cast.map((c) => ({ m, name: c.name, tmdbId: c.tmdbId, role: 'cast' as const, character: c.character })),
    ...m.directors.map((name) => ({ m, name, tmdbId: m.directorIds?.[nameSlug(name)], role: 'director' as const })),
  ]);
  // Linked credits first, so hand-typed names can join the same person.
  credits.sort((a, b) => Number(Boolean(b.tmdbId)) - Number(Boolean(a.tmdbId)));
  for (const { m, name, tmdbId, role, character } of credits) {
    const slug = nameSlug(name);
    if (!slug) continue;
    const key = tmdbId ? personKey({ name, tmdbId }) : (idByName.get(slug) ?? personKey({ name }));
    let p = people.get(key);
    if (!p) {
      const id = tmdbId ?? null;
      const portrait = id && have.has(`${id}.jpg`) ? mediaUrl('portraits', `${id}.jpg`) : null;
      p = { key, tmdbId: id, name, portrait, roles: [], films: [], watched: 0, watchlist: 0 };
      people.set(key, p);
      if (tmdbId) idByName.set(slug, key);
    }
    if (!p.roles.includes(role)) p.roles.push(role);
    const film = p.films.find((f) => f.id === m.id);
    if (film) {
      if (!film.roles.includes(role)) film.roles.push(role);
      film.character ??= character;
      continue;
    }
    p.films.push({ id: m.id, title: m.title, year: m.year, poster: m.poster, status: m.status, rating: m.rating, tmdbId: m.tmdbId, roles: [role], character });
    if (m.status === 'watched') p.watched++;
    else p.watchlist++;
  }
  for (const p of people.values()) p.roles.sort(); // 'cast' before 'director'

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
  // Copies saved before directing was tracked have no `directed`; fetch those again too.
  const current = cached && Array.isArray(cached.directed) ? cached : null;
  if (current && Date.now() - Date.parse(current.fetchedAt) < DETAILS_MAX_AGE_MS) return current;
  const fallback = cached && { ...cached, directed: cached.directed ?? [] };
  if (!(await tmdbKey())) return fallback;
  try {
    const fresh = await tmdbPerson(personId);
    await fs.mkdir(PEOPLE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(fresh, null, 2));
    await ensurePortrait(personId, fresh.profilePath, await portraitFiles()).catch(() => {});
    return fresh;
  } catch {
    return fallback;
  }
}
