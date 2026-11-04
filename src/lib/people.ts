import type { CastMember } from './types';

/** A name reduced for matching: "Zoë Saldaña" and "zoe saldana" are the same person. */
export function nameSlug(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The URL key of a person page: their TMDB id, or `n-<name>` for cast typed by hand. */
export function personKey(c: Pick<CastMember, 'name' | 'tmdbId'>) {
  return c.tmdbId ? String(c.tmdbId) : `n-${nameSlug(c.name)}`;
}

/** Keeps the TMDB ids of cast members whose names didn't change when a cast list is re-typed. */
export function keepCastIds(next: CastMember[], previous: CastMember[] = []): CastMember[] {
  const ids = new Map(previous.filter((c) => c.tmdbId).map((c) => [nameSlug(c.name), c.tmdbId]));
  return next.map((c) => {
    const tmdbId = ids.get(nameSlug(c.name));
    return tmdbId ? { ...c, tmdbId } : c;
  });
}

/** Posters of films you don't have yet are shown straight from TMDB, small. */
export const TMDB_POSTER = 'https://image.tmdb.org/t/p/w185';
