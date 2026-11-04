'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { PoolPerson } from '@/lib/types';
import { Poster } from './Poster';
import { SheetTabs } from './SheetTabs';

const SORTS = {
  watched: { label: 'Most watched', fn: (a: PoolPerson, b: PoolPerson) => b.watched - a.watched || b.films.length - a.films.length },
  films: { label: 'Most films', fn: (a: PoolPerson, b: PoolPerson) => b.films.length - a.films.length || b.watched - a.watched },
  name: { label: 'Name', fn: (a: PoolPerson, b: PoolPerson) => a.name.localeCompare(b.name) },
} as const;
type SortKey = keyof typeof SORTS;

/** Everyone in your films' casts, as a grid of portraits. */
export function People({ people }: { people: PoolPerson[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('watched');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.films.some((f) => f.title.toLowerCase().includes(q)))
      .sort((a, b) => SORTS[sort].fn(a, b) || a.name.localeCompare(b.name));
  }, [people, query, sort]);

  return (
    <section className="collection">
      <SheetTabs active="people" />
      <div className="toolbar">
        <p className="toolbar-note">
          {people.length} {people.length === 1 ? 'person' : 'people'} from your films
        </p>
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
          <p>{people.length === 0 ? 'Add a film and its cast will show up here.' : 'Nobody here matches.'}</p>
        </div>
      ) : (
        <ul className="people-grid">
          {shown.map((p, i) => (
            <li key={p.key} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <Link href={`/people/${p.key}`} className="person-card">
                <Portrait person={p} />
                <div className="person-card-body">
                  <h3>{p.name}</h3>
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
