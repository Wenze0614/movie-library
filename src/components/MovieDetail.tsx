'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { backdropUrl, formatDate, todayIso } from '@/lib/media';
import { keepCastIds, nameSlug, personKey } from '@/lib/people';
import type { Highlight, Movie, MoviePatch } from '@/lib/types';
import { AddFilmDialog } from './AddFilmDialog';
import { Poster } from './Poster';
import { Stars } from './Stars';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Keeps a local copy of the movie and saves changes in the background.
 * Patches made in quick succession are merged into one request.
 */
function useAutosave(initial: Movie) {
  const [movie, setMovie] = useState(initial);
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<MoviePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setState('saving');
    try {
      await api.update(initial.id, patch);
      setState('saved');
    } catch {
      pending.current = { ...patch, ...pending.current };
      setState('error');
    }
  }, [initial.id]);

  const update = useCallback(
    (patch: MoviePatch, delay = 700) => {
      setMovie((m) => ({ ...m, ...patch }));
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush],
  );

  // Don't lose the last keystrokes when navigating away or closing the tab.
  useEffect(() => {
    const onHide = () => {
      if (!Object.keys(pending.current).length) return;
      const body = JSON.stringify(pending.current);
      fetch(`/api/movies/${initial.id}`, { method: 'PATCH', body, keepalive: true, headers: { 'content-type': 'application/json' } });
      pending.current = {};
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [initial.id]);

  return { movie, setMovie, update, flush, state };
}

export function MovieDetail({ initial, tmdb }: { initial: Movie; tmdb: boolean }) {
  const router = useRouter();
  const { movie, setMovie, update, state } = useAutosave(initial);
  const [editingInfo, setEditingInfo] = useState(false);
  const [linking, setLinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const backdrop = backdropUrl(movie);

  async function uploadPoster(file: File) {
    setUploading(true);
    try {
      setMovie(await api.uploadPoster(movie.id, file));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove “${movie.title}” and all your notes about it? This can't be undone.`)) return;
    await api.remove(movie.id);
    router.push('/');
    router.refresh();
  }

  function setStatus(status: Movie['status']) {
    const patch: MoviePatch = { status };
    if (status === 'watched' && movie.watchDates.length === 0) patch.watchDates = [todayIso()];
    update(patch, 0);
  }

  return (
    <article className="detail">
      {backdrop && <div className="detail-backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />}

      <div className="detail-top">
        <Link href="/" className="back-link">
          ← Collection
        </Link>
        <SaveIndicator state={state} />
      </div>

      <header className="detail-head">
        <div
          className={`detail-poster ${uploading ? 'is-busy' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) uploadPoster(f);
          }}
        >
          <Poster movie={movie} />
          <button type="button" className="poster-upload" onClick={() => fileInput.current?.click()}>
            {uploading ? 'Uploading…' : 'Change poster'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && uploadPoster(e.target.files[0])}
          />
        </div>

        <div className="detail-info">
          <h1>{movie.title}</h1>
          <p className="meta detail-meta">
            {[movie.originalTitle, movie.year, movie.runtime && `${movie.runtime} min`, movie.genres.join(' / ')]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {movie.directors.length > 0 && (
            <p className="directed">
              Directed by{' '}
              {movie.directors.map((name, i) => (
                <span key={name}>
                  {i > 0 && ', '}
                  <Link href={`/people/${personKey({ name, tmdbId: movie.directorIds?.[nameSlug(name)] })}`} className="director-link">
                    <strong>{name}</strong>
                  </Link>
                </span>
              ))}
            </p>
          )}
          {movie.tagline && <p className="tagline">“{movie.tagline}”</p>}

          <div className="detail-controls">
            <div className="segmented" role="radiogroup" aria-label="Status">
              {(['watched', 'watchlist'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={movie.status === s}
                  className={movie.status === s ? 'is-active' : ''}
                  onClick={() => setStatus(s)}
                >
                  {s === 'watched' ? 'Watched' : 'To watch'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`fav-toggle ${movie.favorite ? 'is-on' : ''}`}
              aria-pressed={movie.favorite}
              onClick={() => update({ favorite: !movie.favorite }, 0)}
              title={movie.favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {movie.favorite ? '♥' : '♡'}
            </button>
            {movie.status === 'watched' && <Stars value={movie.rating} onChange={(rating) => update({ rating }, 0)} size={24} />}
          </div>

          {movie.status === 'watched' && <WatchLog dates={movie.watchDates} onChange={(watchDates) => update({ watchDates }, 0)} />}

          <div className="detail-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditingInfo((v) => !v)}>
              {editingInfo ? 'Done editing details' : 'Edit details'}
            </button>
            {tmdb && (
              <button type="button" className="btn btn-ghost" onClick={() => setLinking(true)}>
                {movie.tmdbId ? 'Refresh from TMDB' : 'Fill in from TMDB'}
              </button>
            )}
          </div>
        </div>
      </header>

      {editingInfo && <InfoEditor movie={movie} update={update} />}

      <div className="detail-body">
        <div className="detail-main">
          <Section title="The Story" hint="What it's about">
            <Note value={movie.overview} placeholder="A few lines about the plot…" onChange={(overview) => update({ overview })} />
          </Section>
          <Section title="My Review" hint="What you'd tell a friend">
            <Note
              value={movie.review}
              large
              placeholder="In a sentence or two…"
              onChange={(review) => update({ review })}
            />
          </Section>
          <Section title="Highlights" hint="Quotes, scenes, moments">
            <Highlights items={movie.highlights} onChange={(highlights) => update({ highlights }, 300)} />
          </Section>
          <Section title="Notes" hint="What stayed with you, and anything worth remembering">
            <Note
              value={movie.notes}
              placeholder="What did it make you think about, or feel? Craft, music, trivia, things to look up…"
              onChange={(notes) => update({ notes })}
            />
          </Section>
        </div>

        <aside className="detail-side">
          <Section title="Cast">
            {movie.cast.length ? (
              <ul className="cast">
                {movie.cast.map((c) => (
                  <li key={c.name + c.character}>
                    <Link href={`/people/${personKey(c)}`} className="cast-link">
                      <strong>{c.name}</strong>
                      {c.character && <span>{c.character}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No cast yet — add it under “Edit details”.</p>
            )}
          </Section>
          <Section title="Tags">
            <TagInput tags={movie.tags} onChange={(tags) => update({ tags }, 0)} />
          </Section>
          <button type="button" className="btn btn-danger" onClick={remove}>
            Remove film
          </button>
        </aside>
      </div>

      {linking && (
        <AddFilmDialog
          linkMode
          initialQuery={movie.title}
          onClose={() => setLinking(false)}
          onPick={async (r) => {
            setMovie(await api.linkTmdb(movie.id, r.tmdbId));
            router.refresh();
          }}
        />
      )}
    </article>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Not saved — retrying on next edit' }[state];
  return (
    <span className={`save-state save-${state}`} aria-live="polite">
      {text}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>
        {title}
        {hint && <small>{hint}</small>}
      </h2>
      {children}
    </section>
  );
}

/** A textarea that grows with its content and looks like writing on paper. */
function Note({
  value,
  onChange,
  placeholder,
  large,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  large?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={`note ${large ? 'note-large' : ''}`}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function WatchLog({ dates, onChange }: { dates: string[]; onChange: (d: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(todayIso());
  const sorted = [...dates].sort().reverse();
  return (
    <div className="watchlog">
      <span className="label">Watched</span>
      {sorted.map((d) => (
        <span key={d} className="chip">
          {formatDate(d)}
          <button type="button" onClick={() => onChange(dates.filter((x) => x !== d))} aria-label={`Remove viewing on ${d}`}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <form
          className="chip chip-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (date && !dates.includes(date)) onChange([...dates, date]);
            setAdding(false);
          }}
        >
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
          <button type="submit">Add</button>
        </form>
      ) : (
        <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
          + viewing
        </button>
      )}
    </div>
  );
}

function Highlights({ items, onChange }: { items: Highlight[]; onChange: (h: Highlight[]) => void }) {
  const [text, setText] = useState('');
  const [at, setAt] = useState('');
  return (
    <div className="highlights">
      {items.length > 0 && (
        <ul>
          {items.map((h) => (
            <li key={h.id} className="highlight">
              <blockquote>
                <textarea
                  value={h.text}
                  rows={Math.max(1, Math.ceil(h.text.length / 60))}
                  onChange={(e) => onChange(items.map((x) => (x.id === h.id ? { ...x, text: e.target.value } : x)))}
                />
              </blockquote>
              {h.at && <span className="meta">at {h.at}</span>}
              <button type="button" className="icon-btn" onClick={() => onChange(items.filter((x) => x.id !== h.id))} aria-label="Delete highlight">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="highlight-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onChange([...items, { id: crypto.randomUUID(), text: text.trim(), at: at.trim() || undefined }]);
          setText('');
          setAt('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="A line or a moment worth keeping…" />
        <input value={at} onChange={(e) => setAt(e.target.value)} placeholder="01:12:30" className="at-input" aria-label="Timestamp (optional)" />
        <button type="submit" className="btn btn-small" disabled={!text.trim()}>
          Keep
        </button>
      </form>
    </div>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = draft.trim().toLowerCase().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };
  return (
    <div className="tags">
      {tags.map((t) => (
        <span key={t} className="chip">
          #{t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={commit}
        placeholder="add tag"
        className="tag-input"
      />
    </div>
  );
}

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Catalog fields. Cast is one person per line: "Name as Character". */
function InfoEditor({ movie, update }: { movie: Movie; update: (p: MoviePatch, delay?: number) => void }) {
  const [cast, setCast] = useState(movie.cast.map((c) => (c.character ? `${c.name} as ${c.character}` : c.name)).join('\n'));
  return (
    <div className="info-editor">
      <label>
        <span>Title</span>
        <input value={movie.title} onChange={(e) => update({ title: e.target.value })} />
      </label>
      <label>
        <span>Original title</span>
        <input value={movie.originalTitle ?? ''} onChange={(e) => update({ originalTitle: e.target.value || undefined })} />
      </label>
      <label className="narrow">
        <span>Year</span>
        <input
          inputMode="numeric"
          value={movie.year ?? ''}
          onChange={(e) => update({ year: Number(e.target.value.replace(/\D/g, '').slice(0, 4)) || null })}
        />
      </label>
      <label className="narrow">
        <span>Runtime (min)</span>
        <input
          inputMode="numeric"
          value={movie.runtime ?? ''}
          onChange={(e) => update({ runtime: Number(e.target.value.replace(/\D/g, '')) || null })}
        />
      </label>
      <label>
        <span>Directed by (comma separated)</span>
        <input defaultValue={movie.directors.join(', ')} onChange={(e) => update({ directors: list(e.target.value) })} />
      </label>
      <label>
        <span>Genres (comma separated)</span>
        <input defaultValue={movie.genres.join(', ')} onChange={(e) => update({ genres: list(e.target.value) })} />
      </label>
      <label className="wide">
        <span>Tagline</span>
        <input value={movie.tagline} onChange={(e) => update({ tagline: e.target.value })} />
      </label>
      <label className="wide">
        <span>Cast — one per line, “Name as Character”</span>
        <textarea
          rows={5}
          value={cast}
          onChange={(e) => {
            setCast(e.target.value);
            update({
              cast: keepCastIds(
                e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [name, character] = line.split(/\s+as\s+/i);
                    return { name: name.trim(), character: character?.trim() || undefined };
                  }),
                movie.cast,
              ),
            });
          }}
        />
      </label>
    </div>
  );
}
