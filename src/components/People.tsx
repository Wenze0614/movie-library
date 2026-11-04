'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PersonRole, PoolPerson } from '@/lib/types';
import { Poster } from './Poster';
import { SheetTabs } from './SheetTabs';

const ROLES = [
  { key: 'cast', label: 'Cast' },
  { key: 'director', label: 'Directors' },
] as const;
const ROLE_LABEL: Record<PersonRole, string> = { cast: 'Cast', director: 'Director' };
const ROLE_KEY = 'cinema.peopleRole';

/** A person as seen in one role: only the films where they had it, counted again. */
type Shown = PoolPerson & { all: PoolPerson };

const SORTS = {
  watched: { label: 'Most watched', fn: (a: Shown, b: Shown) => b.watched - a.watched || b.films.length - a.films.length },
  films: { label: 'Most films', fn: (a: Shown, b: Shown) => b.films.length - a.films.length || b.watched - a.watched },
  name: { label: 'Name', fn: (a: Shown, b: Shown) => a.name.localeCompare(b.name) },
} as const;
type SortKey = keyof typeof SORTS;

/** Everyone in your films' casts or directors, as a grid of portraits. */
export function People({ people }: { people: PoolPerson[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('watched');
  const [role, setRoleState] = useState<PersonRole>('cast');

  // Remember Cast / Directors in this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROLE_KEY);
      if (saved === 'cast' || saved === 'director') setRoleState(saved);
    } catch {}
  }, []);
  const setRole = (r: PersonRole) => {
    setRoleState(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
    } catch {}
  };

  const inRole = useMemo(
    () =>
      people
        .filter((p) => p.roles.includes(role))
        .map((p): Shown => {
          const films = p.films.filter((f) => f.roles.includes(role));
          const watched = films.filter((f) => f.status === 'watched').length;
          return { ...p, films, watched, watchlist: films.length - watched, all: p };
        }),
    [people, role],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRole
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.films.some((f) => f.title.toLowerCase().includes(q)))
      .sort((a, b) => SORTS[sort].fn(a, b) || a.name.localeCompare(b.name));
  }, [inRole, query, sort]);

  return (
    <section className="collection">
      <SheetTabs active="people" />
      <div className="toolbar">
        <div className="filters">
          <div className="filter-group" role="radiogroup" aria-label="Show">
            {ROLES.map((r) => (
              <button key={r.key} role="radio" aria-checked={role === r.key} className={`pill ${role === r.key ? 'is-active' : ''}`} onClick={() => setRole(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          <p className="toolbar-note">
            {inRole.length} {role === 'director' ? (inRole.length === 1 ? 'director' : 'directors') : inRole.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <div className="toolbar-row">
          <label className="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
            <input type="search" placeholder="Search people or films…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="sort" role="group" aria-label="Sort">
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>
            {inRole.length === 0
              ? role === 'director'
                ? 'Add a film and its director will show up here.'
                : 'Add a film and its cast will show up here.'
              : 'Nobody here matches.'}
          </p>
        </div>
      ) : (
        <ul className="people-grid">
          {shown.map((p, i) => (
            <li key={p.key} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <Link href={`/people/${p.key}`} className="person-card">
                <Portrait person={p} />
                <div className="person-card-body">
                  <h3>{p.name}</h3>
                  <RoleLabels roles={p.all.roles} />
                  <p className="meta">{counts(p)}</p>
                  <div className="person-films" aria-hidden="true">
                    {p.films.slice(0, 4).map((f) => (
                      <Poster key={f.id} movie={f} className="mini-poster" />
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Cast", "Director", or both, for someone who's been each in your films. */
export function RoleLabels({ roles }: { roles: PersonRole[] }) {
  return (
    <span className="role-labels">
      {roles.map((r) => (
        <span key={r} className={`role-label is-${r}`}>
          {ROLE_LABEL[r]}
        </span>
      ))}
    </span>
  );
}

export function counts(p: Pick<PoolPerson, 'watched' | 'watchlist'>) {
  return [p.watched && `${p.watched} watched`, p.watchlist && `${p.watchlist} to watch`].filter(Boolean).join(' · ');
}

/** Their saved portrait, or their initials on a warm card. */
export function Portrait({ person, className = '' }: { person: Pick<PoolPerson, 'name' | 'portrait'>; className?: string }) {
  if (person.portrait) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`portrait ${className}`} src={person.portrait} alt="" loading="lazy" />;
  }
  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className={`portrait portrait-placeholder ${className}`} aria-hidden="true">
      {initials}
    </div>
  );
}
