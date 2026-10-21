'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/media';
import type { TmdbSearchResult, WatchStatus } from '@/lib/types';
import { Stars } from './Stars';

/** Header button + ⌘K shortcut that open the add dialog. */
export function AddFilmButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="nav-add" onClick={() => setOpen(true)} title="Add a film (⌘K)" aria-label="Add a film">
        <span aria-hidden="true">+</span>
        <span className="nav-add-label"> Add film</span>
      </button>
      {open && <AddFilmDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Search TMDB (when a key is configured) or type a title by hand.
 * Pick "Watched" or "To watch" first; watched films get a date and rating.
 */
export function AddFilmDialog({
  onClose,
  onPick,
  initialQuery = '',
  linkMode = false,
}: {
  onClose: () => void;
  /** Link mode: return the TMDB result instead of creating a film. */
  onPick?: (r: TmdbSearchResult) => Promise<void> | void;
  initialQuery?: string;
  linkMode?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [year, setYear] = useState('');
  const [status, setStatus] = useState<WatchStatus>('watched');
  const [date, setDate] = useState(todayIso());
  const [rating, setRating] = useState<number | null>(null);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [tmdb, setTmdb] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => {
        api
          .searchTmdb(q, ctrl.signal)
          .then((r) => {
            setTmdb(r.enabled);
            setResults(r.results);
            setError(null);
          })
          .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
      },
      q ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const extra = () => ({
    status,
    watchDates: status === 'watched' && date ? [date] : [],
    rating: status === 'watched' ? rating : null,
  });

  async function add(key: string, body: Parameters<typeof api.create>[0]) {
    setBusy(key);
    setError(null);
    try {
      const movie = await api.create(body);
      onClose();
      router.push(`/movie/${movie.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function pick(r: TmdbSearchResult) {
    if (onPick) {
      setBusy(String(r.tmdbId));
      try {
        await onPick(r);
        onClose();
      } catch (e) {
        setError((e as Error).message);
        setBusy(null);
      }
      return;
    }
    await add(String(r.tmdbId), { tmdbId: r.tmdbId, ...extra() });
  }

  const canManual = query.trim().length > 0;

  return (
    <dialog
      ref={dialog}
      className="dialog"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0] && tmdb) pick(results[0]);
          else if (canManual && !linkMode) add('manual', { title: query.trim(), year: Number(year) || null, ...extra() });
        }}
      >
        <header className="dialog-head">
          <h2>{linkMode ? 'Find on TMDB' : 'Add a film'}</h2>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
            ×
          </button>
        </header>

        {!linkMode && (
          <div className="add-options">
            <div className="segmented" role="radiogroup" aria-label="Status">
              {(['watched', 'watchlist'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  className={status === s ? 'is-active' : ''}
                  onClick={() => setStatus(s)}
                >
                  {s === 'watched' ? 'Watched' : 'To watch'}
                </button>
              ))}
            </div>
            {status === 'watched' && (
              <>
                <label className="field-inline">
                  <span>on</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <Stars value={rating} onChange={setRating} size={20} />
              </>
            )}
          </div>
        )}

        <div className="search-row">
          <input
            ref={input}
            className="search-input"
            placeholder={tmdb === false ? 'Film title' : 'Search for a film…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!linkMode && tmdb === false && (
            <input
              className="search-input year-input"
              placeholder="Year"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        {tmdb === false && (
          <p className="hint">
            Tip: add a free <code>TMDB_API_KEY</code> to <code>.env.local</code> to search and auto-fill posters, story and
            cast. Until then, films are added by hand.
          </p>
        )}

        {tmdb && results.length > 0 && (
          <ul className="results">
            {results.map((r) => (
              <li key={r.tmdbId}>
                <button type="button" className="result" onClick={() => pick(r)} disabled={busy !== null}>
                  {r.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.posterUrl} alt="" />
                  ) : (
                    <span className="result-noposter" />
                  )}
                  <span className="result-text">
                    <strong>{r.title}</strong> <em>{r.year ?? '—'}</em>
                    <small>{r.overview}</small>
                  </span>
                  {busy === String(r.tmdbId) && <span className="spinner" aria-label="Adding" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!linkMode && (
          <footer className="dialog-foot">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canManual || busy !== null}
              onClick={() => add('manual', { title: query.trim(), year: Number(year) || null, ...extra() })}
            >
              {busy === 'manual' ? 'Adding…' : canManual ? `Add “${query.trim()}”${tmdb ? ' by hand' : ''}` : 'Add film'}
            </button>
          </footer>
        )}
      </form>
    </dialog>
  );
}
