import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Poster } from '@/components/Poster';
import { Stars } from '@/components/Stars';
import { formatDate } from '@/lib/media';
import { listMovies } from '@/lib/store';

export const metadata: Metadata = { title: 'Diary' };

/** Every viewing, newest first, grouped by month. */
export default async function DiaryPage() {
  await connection();
  const movies = await listMovies();
  const entries = movies
    .flatMap((m) => {
      const dates = [...m.watchDates].sort();
      return dates.map((date, i) => ({ movie: m, date, rewatch: i > 0 }));
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const months = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), e]);
  }

  return (
    <section className="diary">
      <div className="collection-head">
        <div className="collection-title">
          <h1>
            Diary
            <span className="rule" aria-hidden="true" />
          </h1>
          <p className="kicker">Every night at the movies, in order.</p>
          <p className="stats">
            {entries.length} viewings · {new Set(entries.map((e) => e.movie.id)).size} films
          </p>
        </div>
      </div>

      {entries.length === 0 && <div className="empty">No viewings logged yet. Mark a film as watched to start your diary.</div>}

      {[...months].map(([key, list]) => (
        <div key={key} className="diary-month">
          <h2>{formatDate(`${key}-01`, { month: 'long', year: 'numeric' })}</h2>
          <ol>
            {list.map(({ movie, date, rewatch }) => (
              <li key={`${movie.id}-${date}`}>
                <Link href={`/movie/${movie.id}`} className="diary-entry">
                  <span className="diary-day">{Number(date.slice(8, 10))}</span>
                  <Poster movie={movie} className="diary-poster" />
                  <span className="diary-main">
                    <strong>{movie.title}</strong> <em>{movie.year}</em>
                    {rewatch && <span className="tag-soft">rewatch</span>}
                    {movie.review && <small>{movie.review}</small>}
                  </span>
                  <Stars value={movie.rating} />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
