'use client';
import type { Movie, MovieDraft, MoviePatch, TmdbDetails, TmdbSearchResult, TmdbStatus } from './types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  create: (body: MovieDraft) =>
    fetch('/api/movies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(json<Movie>),
  update: (id: string, patch: MoviePatch) =>
    fetch(`/api/movies/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(json<Movie>),
  remove: (id: string) => fetch(`/api/movies/${id}`, { method: 'DELETE' }),
  linkTmdb: (id: string, tmdbId: number) =>
    fetch(`/api/movies/${id}/tmdb`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tmdbId }) }).then(json<Movie>),
  uploadPoster: (id: string, file: File) => {
    const form = new FormData();
    form.set('file', file);
    return fetch(`/api/movies/${id}/poster`, { method: 'POST', body: form }).then(json<Movie>);
  },
  setBackground: (movieId: string | null) =>
    fetch('/api/settings/background', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ movieId }) }).then(
      json<{ movieId: string | null }>,
    ),
  setWallpaper: (id: string) =>
    fetch(`/api/movies/${id}/wallpaper`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(
      json<{ ok: true; waiting: boolean }>,
    ),
  wallpaperSettled: (id: string) => fetch(`/api/movies/${id}/wallpaper`).then(json<{ status: 'set' | 'replaced' | 'none' }>),
  tmdbMovie: (tmdbId: number) => fetch(`/api/tmdb/movie/${tmdbId}`).then(json<TmdbDetails>),
  tmdbStatus: () => fetch('/api/settings/tmdb').then(json<TmdbStatus>),
  saveTmdbKey: (key: string) =>
    fetch('/api/settings/tmdb', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }).then(
      json<TmdbStatus>,
    ),
  removeTmdbKey: () => fetch('/api/settings/tmdb', { method: 'DELETE' }).then(json<TmdbStatus>),
  searchTmdb: (q: string, signal?: AbortSignal) =>
    fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`, { signal }).then(
      json<{ enabled: boolean; results: TmdbSearchResult[]; error?: string }>,
    ),
};
