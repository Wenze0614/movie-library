'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { site } from '@/config';
import { formatDate, lastWatched } from '@/lib/media';
import type { Movie } from '@/lib/types';
import { Poster } from './Poster';
import { Stars } from './Stars';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'watched', label: 'Watched' },
  { key: 'watchlist', label: 'To Watch' },
  { key: 'favorites', label: 'Favorites' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

const SORTS = {
  added: { label: 'Recently added', fn: (a: Movie, b: Movie) => b.createdAt.localeCompare(a.createdAt) },
  watched: {
    label: 'Recently watched',
    fn: (a: Movie, b: Movie) => (lastWatched(b) ?? '').localeCompare(lastWatched(a) ?? ''),
  },
  rating: { label: 'Highest rated', fn: (a: Movie, b: Movie) => (b.rating ?? -1) - (a.rating ?? -1) },
  title: { label: 'Title', fn: (a: Movie, b: Movie) => a.title.localeCompare(b.title) },
  year: { label: 'Release year', fn: (a: Movie, b: Movie) => (b.year ?? 0) - (a.year ?? 0) },
} as const;
type SortKey = keyof typeof SORTS;

/** Remembers small view preferences in this browser only. */
function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      if (saved) setValue(saved);
    } catch {}
  }, [key]);
  return [
    value,
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {}
    },
  ];
}

export function Collection({ movies }: { movies: Movie[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePref<SortKey>('cinema.sort', 'added');
  const [view, setView] = usePref<'grid' | 'list'>('cinema.view', 'grid');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movies
      .filter((m) => {
        if (filter === 'watched' && m.status !== 'watched') return false;
        if (filter === 'watchlist' && m.status !== 'watchlist') return false;
        if (filter === 'favorites' && !m.favorite) return false;
        if (!q) return true;
        const hay = [m.title, m.originalTitle, m.year, ...m.directors, ...m.cast.map((c) => c.name), ...m.genres, ...m.tags]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(SORTS[sort].fn);
  }, [movies, filter, query, sort]);

  const watched = movies.filter((m) => m.status === 'watched').length;

  return (
    <section className="collection">
      <div className="collection-head">
        <div className="collection-title">
          <h1>
            {site.collectionTitle}
            <span className="rule" aria-hidden="true" />
          </h1>
          <p className="kicker">{site.collectionSubtitle}</p>
          <p className="stats">
            {movies.length} films · {watched} watched · {movies.length - watched} to watch
          </p>
        </div>

        <div className="toolbar">
          <div className="pills" role="tablist" aria-label="Filter">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                className={`pill ${filter === f.key ? 'is-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="toolbar-row">
            <label className="search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                type="search"
                placeholder="Search title, director, cast, tag…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="view-toggle" role="group" aria-label="Layout">
              <button className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} aria-label="Grid view">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
                  <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
                  <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
                  <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
                </svg>
              </button>
              <button className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} aria-label="List view">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 6h11M9 12h11M9 18h11" />
                  <circle cx="5" cy="6" r="1" />
                  <circle cx="5" cy="12" r="1" />
                  <circle cx="5" cy="18" r="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>{movies.length === 0 ? 'Your shelf is empty — add the first film you loved.' : 'Nothing here matches.'}</p>
        </div>
      ) : view === 'grid' ? (
        <ul className="grid">
          {shown.map((m, i) => (
            <li key={m.id} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <MovieCard movie={m} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="list">
          {shown.map((m) => (
            <li key={m.id}>
              <MovieRow movie={m} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusLine({ movie }: { movie: Movie }) {
  if (movie.status === 'watchlist') return <span className="tag-soft">To watch</span>;
  return <Stars value={movie.rating} />;
}

function MovieCard({ movie }: { movie: Movie }) {
  return (
    <Link href={`/movie/${movie.id}`} className="card">
      <div className="card-poster">
        <Poster movie={movie} />
        {movie.favorite && (
          <span className="fav-badge" aria-label="Favorite">
            ♥
          </span>
        )}
      </div>
      <div className="card-body">
        <h3>{movie.title}</h3>
        <p className="meta">{movie.year ?? '—'}</p>
        <StatusLine movie={movie} />
      </div>
    </Link>
  );
}

function MovieRow({ movie }: { movie: Movie }) {
  const last = lastWatched(movie);
  return (
    <Link href={`/movie/${movie.id}`} className="row">
      <Poster movie={movie} className="row-poster" />
      <div className="row-main">
        <h3>
          {movie.title} {movie.favorite && <span className="fav-inline">♥</span>}
        </h3>
        <p className="meta">
          {[movie.year, movie.directors.join(', '), movie.genres.slice(0, 2).join(' / ')].filter(Boolean).join(' · ')}
        </p>
        {movie.review && <p className="row-review">{movie.review}</p>}
      </div>
      <div className="row-side">
        <StatusLine movie={movie} />
        {last && <span className="meta">{formatDate(last)}</span>}
      </div>
    </Link>
  );
}
