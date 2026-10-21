'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/media';
import type { CastMember, MovieDraft, TmdbSearchResult, WatchStatus } from '@/lib/types';
import { KEY_CHANGED_EVENT, openKeyDialog } from './ApiKeyDialog';
import { Poster } from './Poster';
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
 * Adding a film is two steps: find it (TMDB search when a key is set, or type
 * a title), then review everything that was fetched before it's saved.
 *
 * In link mode (from a film page) it only searches and hands back the pick.
 */
export function AddFilmDialog({
  onClose,
  onPick,
  initialQuery = '',
  linkMode = false,
}: {
  onClose: () => void;
  onPick?: (r: TmdbSearchResult) => Promise<void> | void;
  initialQuery?: string;
  linkMode?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [year, setYear] = useState('');
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [tmdb, setTmdb] = useState<boolean | null>(null);
  const [keyVersion, setKeyVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MovieDraft | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
    const onKeyChanged = () => setKeyVersion((v) => v + 1);
    window.addEventListener(KEY_CHANGED_EVENT, onKeyChanged);
    return () => window.removeEventListener(KEY_CHANGED_EVENT, onKeyChanged);
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
  }, [query, keyVersion]);

  async function pick(r: TmdbSearchResult) {
    setBusy(String(r.tmdbId));
    setError(null);
    try {
      if (onPick) {
        await onPick(r);
        onClose();
        return;
      }
      const details = await api.tmdbMovie(r.tmdbId);
      setDraft({ ...details.fields, posterUrl: details.posterUrl, backdropUrl: details.backdropUrl });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function byHand() {
    const title = query.trim();
    if (title) setDraft({ title, year: Number(year) || null });
  }

  async function add(film: MovieDraft) {
    setBusy('add');
    setError(null);
    try {
      const movie = await api.create(film);
      onClose();
      router.push(`/movie/${movie.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const canManual = query.trim().length > 0;

  return (
    <dialog
      ref={dialog}
      className="dialog"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      {draft ? (
        <FilmReview
          draft={draft}
          busy={busy === 'add'}
          error={error}
          onBack={() => {
            setDraft(null);
            setError(null);
          }}
          onAdd={add}
          onClose={() => dialog.current?.close()}
        />
      ) : (
        <form className="dialog-body" onSubmit={(e) => e.preventDefault()}>
          <header className="dialog-head">
            <h2>{linkMode ? 'Find on TMDB' : 'Add a film'}</h2>
            <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
              ×
            </button>
          </header>

          <div className="search-row">
            <input
              ref={input}
              className="search-input"
              placeholder={tmdb === false ? 'Film title' : 'Search for a film…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter: take the top search result, or continue by hand.
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (results[0] && tmdb) pick(results[0]);
                else if (canManual && !linkMode) byHand();
              }}
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
              Want the poster, director, genres and cast filled in for you?{' '}
              <button type="button" className="link-btn" onClick={openKeyDialog}>
                Add a free TMDB key
              </button>
              . Until then, you fill in the details yourself on the next step.
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
                    {busy === String(r.tmdbId) && <span className="spinner" aria-label="Loading" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!linkMode && (
            <footer className="dialog-foot">
              <button type="button" className={`btn ${tmdb ? 'btn-ghost' : 'btn-primary'}`} disabled={!canManual} onClick={byHand}>
                {canManual ? `Add “${query.trim()}”${tmdb ? ' by hand' : ''} →` : 'Next →'}
              </button>
            </footer>
          )}
        </form>
      )}
    </dialog>
  );
}

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const castToText = (cast: CastMember[] = []) => cast.map((c) => (c.character ? `${c.name} as ${c.character}` : c.name)).join('\n');

const textToCast = (text: string): CastMember[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, character] = line.split(/\s+as\s+/i);
      return { name: name.trim(), character: character?.trim() || undefined };
    });

/** Step two: everything that was fetched, editable, plus how you know the film. */
function FilmReview({
  draft,
  busy,
  error,
  onBack,
  onAdd,
  onClose,
}: {
  draft: MovieDraft;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onAdd: (film: MovieDraft) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [year, setYear] = useState(draft.year ? String(draft.year) : '');
  const [directors, setDirectors] = useState((draft.directors ?? []).join(', '));
  const [genres, setGenres] = useState((draft.genres ?? []).join(', '));
  const [cast, setCast] = useState(castToText(draft.cast));
  const [overview, setOverview] = useState(draft.overview ?? '');
  const [status, setStatus] = useState<WatchStatus>('watched');
  const [date, setDate] = useState(todayIso());
  const [rating, setRating] = useState<number | null>(null);
  const fromTmdb = Boolean(draft.tmdbId);

  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd({
          ...draft,
          title: title.trim(),
          year: Number(year) || null,
          directors: list(directors),
          genres: list(genres),
          cast: textToCast(cast),
          overview,
          status,
          watchDates: status === 'watched' && date ? [date] : [],
          rating: status === 'watched' ? rating : null,
        });
      }}
    >
      <header className="dialog-head">
        <h2>{fromTmdb ? 'Look right?' : 'Film details'}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="review">
        <figure className="review-poster">
          {draft.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="poster" src={draft.posterUrl} alt={`${title} poster`} />
          ) : (
            <Poster movie={{ title: title || 'Untitled', year: Number(year) || null, poster: null }} />
          )}
          <figcaption>{draft.posterUrl ? 'Saved to your library' : 'Add a poster later on the film’s page'}</figcaption>
        </figure>

        <div className="review-fields">
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <div className="field-row">
            <label className="field field-year">
              <span>Year</span>
              <input
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </label>
            <label className="field">
              <span>Directed by</span>
              <input value={directors} onChange={(e) => setDirectors(e.target.value)} placeholder="Comma separated" />
            </label>
          </div>
          <label className="field">
            <span>Genres</span>
            <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Comma separated" />
          </label>
          <label className="field">
            <span>Main cast — one per line, “Name as Character”</span>
            <textarea rows={4} value={cast} onChange={(e) => setCast(e.target.value)} />
          </label>
          <label className="field">
            <span>Story</span>
            <textarea rows={3} value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="Optional" />
          </label>
        </div>
      </div>

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

      {error && <p className="form-error">{error}</p>}

      <footer className="dialog-foot dialog-foot-split">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
          ← Back
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
          {busy ? 'Adding…' : 'Add to library'}
        </button>
      </footer>
    </form>
  );
}
