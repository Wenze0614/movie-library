'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { site } from '@/config';
import { api } from '@/lib/api';
import { backdropUrl, formatDate, lastWatched, posterUrl } from '@/lib/media';
import type { Movie, WallpaperPlatform } from '@/lib/types';
import { Poster } from './Poster';
import { SheetTabs } from './SheetTabs';
import { Stars } from './Stars';
import { useWallpaper } from './useWallpaper';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'watched', label: 'Watched' },
  { key: 'watchlist', label: 'To Watch' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

type Dir = 'asc' | 'desc';
type SortValue = string | number | null;

/**
 * Each sort reads one value per film and has a natural direction (newest
 * first, A to Z…). Films without a value (unrated, never watched) always go last.
 */
const SORTS = {
  added: { label: 'Date added', value: (m: Movie) => m.createdAt, dir: 'desc', words: ['Oldest first', 'Newest first'] },
  watched: { label: 'Date watched', value: (m: Movie) => lastWatched(m), dir: 'desc', words: ['Oldest first', 'Newest first'] },
  rating: { label: 'Rating', value: (m: Movie) => m.rating, dir: 'desc', words: ['Lowest first', 'Highest first'] },
  title: { label: 'Title', value: (m: Movie) => m.title.toLowerCase(), dir: 'asc', words: ['A to Z', 'Z to A'] },
  year: { label: 'Release year', value: (m: Movie) => m.year, dir: 'desc', words: ['Oldest first', 'Newest first'] },
} satisfies Record<string, { label: string; value: (m: Movie) => SortValue; dir: Dir; words: [string, string] }>;
type SortKey = keyof typeof SORTS;

function compare(a: SortValue, b: SortValue, dir: Dir) {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order = typeof a === 'string' ? a.localeCompare(String(b)) : a - Number(b);
  return dir === 'asc' ? order : -order;
}

/** Remembers small view preferences in this browser only. */
function usePref<T extends string>(key: string, initial: T, valid: (v: string) => boolean = () => true): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved && valid(saved)) setValue(saved as T);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

export function Collection({
  movies,
  backgroundId,
  wallpaper,
}: {
  movies: Movie[];
  /** The film whose backdrop is the collection's background, if any. */
  backgroundId: string | null;
  /** The computer's operating system, if it can take a film as its desktop wallpaper. */
  wallpaper: WallpaperPlatform | null;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [favorites, setFavorites] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePref<SortKey>('cinema.sort', 'added', (v) => v in SORTS);
  const [dir, setDir] = usePref<Dir>('cinema.sortDir', 'desc', (v) => v === 'asc' || v === 'desc');
  const [view, setView] = usePref<'grid' | 'list'>('cinema.view', 'grid');
  const [bgId, setBgId] = useState(backgroundId);
  const [notice, notify] = useNotice();
  const setWallpaper = useWallpaper(notify);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const { value } = SORTS[sort];
    return movies
      .filter((m) => {
        if (filter === 'watched' && m.status !== 'watched') return false;
        if (filter === 'watchlist' && m.status !== 'watchlist') return false;
        if (favorites && !m.favorite) return false;
        if (!q) return true;
        const hay = [m.title, m.originalTitle, m.year, ...m.directors, ...m.cast.map((c) => c.name), ...m.genres, ...m.tags]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => compare(value(a), value(b), dir));
  }, [movies, filter, favorites, query, sort, dir]);

  const watched = movies.filter((m) => m.status === 'watched').length;
  const bgMovie = movies.find((m) => m.id === bgId);
  const bgSrc = bgMovie ? (backdropUrl(bgMovie) ?? posterUrl(bgMovie)) : null;

  async function toggleBackground(movie: Movie) {
    const next = bgId === movie.id ? null : movie.id;
    const before = bgId;
    setBgId(next);
    try {
      await api.setBackground(next);
    } catch (err) {
      setBgId(before);
      notify((err as Error).message);
    }
  }


  const sortWords = SORTS[sort].words;
  const dirLabel = dir === 'asc' ? sortWords[0] : sortWords[1];

  return (
    <section className="collection">
      {bgSrc && (
        <>
          {/* A page-wide variable, so the paper's top edge in the hero can carry the same picture. */}
          <style>{`:root { --collection-bg: url("${bgSrc.replace(/["\\<>]/g, '')}"); }`}</style>
          <div key={bgSrc} className="collection-bg" aria-hidden="true" />
        </>
      )}

      {/* <div className="collection-head">
        <h1 className="sr-only">{site.collectionTitle}</h1>
        <p className="kicker">{site.collectionSubtitle}</p>
        <p className="stats">
          {movies.length} films · {watched} watched · {movies.length - watched} to watch
        </p>
      </div> */}

      <SheetTabs active="films" />

      <div className="toolbar">
        <div className="filters">
          <div className="filter-group" role="radiogroup" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="radio"
                aria-checked={filter === f.key}
                className={`pill ${filter === f.key ? 'is-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="heart-toggle"
            aria-pressed={favorites}
            onClick={() => setFavorites(!favorites)}
            title={favorites ? 'Show all films' : 'Show favorites only'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />
            </svg>
            <span className="sr-only">Favorites only</span>
          </button>
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
          <div className="sort" role="group" aria-label="Sort">
            <select
              value={sort}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort(key);
                setDir(SORTS[key].dir); // each sort starts the natural way round
              }}
              aria-label="Sort by"
            >
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="sort-dir"
              data-dir={dir}
              onClick={() => setDir(dir === 'asc' ? 'desc' : 'asc')}
              title={`${dirLabel} (click to reverse)`}
            >
              {/* Bars from long to short with an arrow: flips over for ascending. */}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6.5h9M4 12h6.5M4 17.5h4" />
                <path className="arrow" d="M17.5 5v13.5m-3-3 3 3 3-3" />
              </svg>
              <span className="sr-only">{dirLabel}</span>
            </button>
          </div>
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

      {shown.length === 0 ? (
        <div className="empty">
          <p>{movies.length === 0 ? 'Your shelf is empty — add the first film you loved.' : 'Nothing here matches.'}</p>
        </div>
      ) : view === 'grid' ? (
        <ul className="grid">
          {shown.map((m, i) => (
            <li key={m.id} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <MovieCard
                movie={m}
                isBackground={m.id === bgId}
                onBackground={() => toggleBackground(m)}
                onWallpaper={wallpaper ? () => setWallpaper(m) : undefined}
              />
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

      <p className={`toast ${notice ? 'is-shown' : ''}`} role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}

/** A short message at the bottom of the screen; `ms` = 0 keeps it until the next one. */
function useNotice(): [string, (text: string, ms?: number) => void] {
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    text,
    (next, ms = 2800) => {
      clearTimeout(timer.current);
      setText(next);
      if (ms) timer.current = setTimeout(() => setText(''), ms);
    },
  ];
}

function StatusLine({ movie }: { movie: Movie }) {
  if (movie.status === 'watchlist') return <span className="tag-soft">To watch</span>;
  return <Stars value={movie.rating} />;
}

function MovieCard({
  movie,
  isBackground,
  onBackground,
  onWallpaper,
}: {
  movie: Movie;
  isBackground: boolean;
  onBackground: () => void;
  onWallpaper?: () => void;
}) {
  const hasImage = Boolean(movie.backdrop || movie.poster);
  return (
    <div className="card">
      <Link href={`/movie/${movie.id}`} className="card-link">
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
      {hasImage && (
        <div className="card-actions">
          {onWallpaper && (
            <button type="button" className="card-action" onClick={onWallpaper} title="Set as desktop wallpaper">
              {/* A little laptop. */}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="5.5" width="14" height="9.5" rx="1.2" />
                <path d="M3 18.5h18" />
              </svg>
              <span className="sr-only">Set {movie.title} as desktop wallpaper</span>
            </button>
          )}
          <button
            type="button"
            className="card-action"
            onClick={onBackground}
            aria-pressed={isBackground}
            title={isBackground ? 'Remove from the collection background' : 'Use as the collection background'}
          >
            {/* A framed landscape. */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
              <path d="M3.5 16l5-4.5 4 3.5 3-2.5 5 4" />
              <circle cx="15.5" cy="9" r="1.4" />
            </svg>
            <span className="sr-only">Use {movie.title} as the collection background</span>
          </button>
        </div>
      )}
    </div>
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
