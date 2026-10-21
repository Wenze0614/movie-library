import 'server-only';
import { createMovie, downloadMedia, getMovie, removeMedia, updateMovie } from './store';
import { TMDB_IMAGE, tmdbDetails } from './tmdb';
import type { Movie } from './types';

/** Only TMDB's image CDN may be fetched from a client-supplied URL. */
const isTmdbImage = (url: unknown): url is string => typeof url === 'string' && url.startsWith(`${TMDB_IMAGE}/`);

/**
 * Creates a film from reviewed fields and downloads its poster and backdrop
 * into data/, so the library keeps working offline.
 */
export async function createWithImages(
  fields: Partial<Movie> & { title: string },
  images: { posterUrl?: unknown; backdropUrl?: unknown },
): Promise<Movie> {
  const movie = await createMovie(fields);
  const [poster, backdrop] = await Promise.all([
    isTmdbImage(images.posterUrl) ? downloadMedia('posters', movie.id, images.posterUrl).catch(() => null) : null,
    isTmdbImage(images.backdropUrl) ? downloadMedia('backdrops', movie.id, images.backdropUrl).catch(() => null) : null,
  ]);
  if (!poster && !backdrop) return movie;
  return (await updateMovie(movie.id, { poster, backdrop })) ?? movie;
}

/**
 * Pulls metadata + images from TMDB into an existing film. Only "catalog"
 * fields are touched; your rating, review, notes, etc. are never overwritten.
 */
export async function applyTmdb(movieId: string, tmdbId: number): Promise<Movie | null> {
  const movie = await getMovie(movieId);
  if (!movie) return null;
  const { fields, posterUrl, backdropUrl } = await tmdbDetails(tmdbId);
  const [poster, backdrop] = await Promise.all([
    posterUrl ? downloadMedia('posters', movieId, posterUrl).catch(() => null) : null,
    backdropUrl ? downloadMedia('backdrops', movieId, backdropUrl).catch(() => null) : null,
  ]);
  if (poster) await removeMedia('posters', movie.poster);
  if (backdrop) await removeMedia('backdrops', movie.backdrop);
  return updateMovie(movieId, {
    ...fields,
    poster: poster ?? movie.poster,
    backdrop: backdrop ?? movie.backdrop,
  });
}
