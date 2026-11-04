'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/media';
import { TMDB_POSTER } from '@/lib/people';
import type { PersonCredit, PersonDetails, PersonRole, PoolPerson } from '@/lib/types';
import { AddFilmDialog } from './AddFilmDialog';
import { counts, Portrait, RoleLabels } from './People';
import { Poster } from './Poster';
import { Stars } from './Stars';

const KNOWN_FOR_FIRST = 12;

/** A film from their filmography; `alsoAs` is their part in a film they directed and acted in. */
type Credit = PersonCredit & { alsoAs?: string };

/**
 * One person: who they are (from TMDB, cached), the films of theirs in your
 * library, and what else they're known for, one click from your To Watch list.
 */
export function PersonDetail({
  person,
  details,
  inLibrary,
  tmdb,
}: {
  person: PoolPerson;
  details: PersonDetails | null;
  /** TMDB ids of every film in your library, so "Known for" only shows new ones. */
  inLibrary: number[];
  tmdb: boolean;
}) {
  const router = useRouter();
  const [moreBio, setMoreBio] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchedDialog, setWatchedDialog] = useState<number | null>(null);

  const rated = person.films.filter((f) => f.status === 'watched' && f.rating !== null);
  const average = rated.length ? rated.reduce((sum, f) => sum + (f.rating ?? 0), 0) / rated.length : null;
  const library = new Set(inLibrary);
  const notInLibrary = (credits: PersonCredit[] = []) => credits.filter((c) => !library.has(c.tmdbId));
  // A filmography per role they have in your films; directing first for people TMDB knows mainly as directors.
  // A film they directed and also acted in is listed once, under Directed, with their part.
  const both = person.roles.length > 1;
  const acting = new Map((details?.credits ?? []).map((c) => [c.tmdbId, c]));
  const directed: Credit[] = notInLibrary(details?.directed).map((c) => ({
    ...c,
    alsoAs: both ? acting.get(c.tmdbId)?.character || undefined : undefined,
  }));
  const directedIds = new Set(directed.map((c) => c.tmdbId));
  const sections = person.roles
    .map((role) =>
      role === 'director'
        ? { role, title: 'Directed', credits: directed }
        : { role, title: 'Known for', credits: notInLibrary(details?.credits).filter((c) => !both || !directedIds.has(c.tmdbId)) },
    )
    .sort((a, b) => (details?.department === 'Directing' ? (a.role === 'director' ? -1 : 1) - (b.role === 'director' ? -1 : 1) : 0));
  const emptyNote = (role: PersonRole) =>
    !person.tmdbId
      ? 'This name was typed by hand, so it isn’t linked to TMDB.'
      : !tmdb
        ? 'Add a TMDB key (the key button, top right) to see what else they’ve made.'
        : details
          ? role === 'director'
            ? 'You have every film they directed that TMDB knows about.'
            : 'You have every film of theirs that TMDB knows about.'
          : 'Couldn’t reach TMDB. Their other films will show up next time you’re online.';
  const facts = [
    details?.department,
    details?.birthday && `Born ${formatDate(details.birthday, { day: 'numeric', month: 'long', year: 'numeric' })}`,
    details?.placeOfBirth && `in ${details.placeOfBirth}`,
    details?.deathday && `died ${formatDate(details.deathday, { day: 'numeric', month: 'long', year: 'numeric' })}`,
  ].filter(Boolean);

  async function addToWatch(tmdbId: number) {
    setBusy(tmdbId);
    setError(null);
    try {
      const film = await api.tmdbMovie(tmdbId);
      await api.create({ ...film.fields, status: 'watchlist', posterUrl: film.posterUrl, backdropUrl: film.backdropUrl });
      router.refresh(); // it moves up into "In your library"
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="person">
      <div className="detail-top">
        <Link href="/people" className="back-link">
          ← People
        </Link>
      </div>

      <header className="person-head">
        <Portrait person={person} className="person-photo" />
        <div className="person-info">
          {facts.length > 0 && <p className="person-facts">{facts.join(' · ').replace(' · in ', ' in ')}</p>}
          <h1>{person.name}</h1>
          <RoleLabels roles={person.roles} />
          <p className="person-stats">
            {counts(person)} in your library
            {average !== null && (
              <>
                {' · '}your average <Stars value={Math.round(average * 2) / 2} size={14} /> {average.toFixed(1)}
              </>
            )}
          </p>
          {details?.biography && (
            <div className={`person-bio ${moreBio ? 'is-open' : ''}`}>
              <p>{details.biography}</p>
              {details.biography.length > 420 && (
                <button type="button" className="link-btn" onClick={() => setMoreBio(!moreBio)}>
                  {moreBio ? 'Less' : 'More'}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="person-section">
        <h2>In your library</h2>
        <ul className="person-library">
          {person.films.map((f) => (
            <li key={f.id}>
              <Link href={`/movie/${f.id}`} className="person-film">
                <Poster movie={f} />
                <span className="person-film-title">{f.title}</span>
                <span className="meta">
                  {[f.roles.includes('director') && 'Directed', f.character && `as ${f.character}`].filter(Boolean).join(' · ')}
                </span>
                {f.status === 'watchlist' ? <span className="tag-soft">To watch</span> : <Stars value={f.rating} size={13} />}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="form-error">{error}</p>}
      {sections.map((section) => (
        <Filmography
          key={section.role}
          title={section.title}
          credits={section.credits}
          empty={emptyNote(section.role)}
          busy={busy}
          onAdd={addToWatch}
          onWatched={setWatchedDialog}
        />
      ))}

      {watchedDialog !== null && <AddFilmDialog startWith={watchedDialog} onClose={() => setWatchedDialog(null)} />}
    </article>
  );
}

/** Their other films (not in your library yet), each one click from your To Watch list. */
function Filmography({
  title,
  credits,
  empty,
  busy,
  onAdd,
  onWatched,
}: {
  title: string;
  credits: Credit[];
  empty: string;
  busy: number | null;
  onAdd: (tmdbId: number) => void;
  onWatched: (tmdbId: number) => void;
}) {
  const [more, setMore] = useState(false);
  const shown = more ? credits : credits.slice(0, KNOWN_FOR_FIRST);
  return (
    <section className="person-section">
      <h2>{title}</h2>
      {credits.length > 0 ? (
        <>
          <ul className="person-known">
            {shown.map((c) => (
              <li key={c.tmdbId} className="known-film">
                {c.posterPath ? (
                  // Shown from TMDB, never stored: it's saved only once you add the film.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="poster" src={`${TMDB_POSTER}${c.posterPath}`} alt={`${c.title} poster`} loading="lazy" />
                ) : (
                  <Poster movie={{ title: c.title, year: c.year, poster: null }} />
                )}
                <span className="person-film-title">{c.title}</span>
                <span className="meta">
                  {[c.year, c.character && `as ${c.character}`, c.alsoAs && `also as ${c.alsoAs}`].filter(Boolean).join(' · ')}
                </span>
                <span className="known-actions">
                  <button type="button" className="known-btn is-primary" disabled={busy !== null} onClick={() => onAdd(c.tmdbId)}>
                    {busy === c.tmdbId ? 'Adding…' : '+ To watch'}
                  </button>
                  <button type="button" className="known-btn" disabled={busy !== null} onClick={() => onWatched(c.tmdbId)}>
                    Watched…
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {credits.length > KNOWN_FOR_FIRST && (
            <button type="button" className="link-btn person-more" onClick={() => setMore(!more)}>
              {more ? 'Fewer' : `${credits.length - KNOWN_FOR_FIRST} more`}
            </button>
          )}
        </>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </section>
  );
}
