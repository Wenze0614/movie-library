import 'server-only';
import { createMovie, downloadMedia, getMovie, removeMedia, updateMovie } from './store';
import { tmdbDetails } from './tmdb';
import type { Movie } from './types';

/**
 * Pulls metadata + images from TMDB into a movie. Only "catalog" fields are
 * touched; your rating, review, notes, etc. are never overwritten.
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

export async function createFromTmdb(tmdbId: number, extra: Partial<Movie>): Promise<Movie> {
  const { fields } = await tmdbDetails(tmdbId);
  const movie = await createMovie({ ...fields, ...extra, title: fields.title });
  return (await applyTmdb(movie.id, tmdbId)) ?? movie;
}
