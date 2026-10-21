import { NextResponse } from 'next/server';
import { listMovies } from '@/lib/store';
import { createWithImages } from '@/lib/library';
import type { CastMember, Movie } from '@/lib/types';

export async function GET() {
  return NextResponse.json(await listMovies());
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Create a film from the reviewed fields in the add dialog. `posterUrl` /
 * `backdropUrl` (TMDB images only) are downloaded into data/.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = text(body.title).trim();
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
  const status = body.status === 'watched' ? 'watched' : 'watchlist';
  const cast: CastMember[] = Array.isArray(body.cast)
    ? body.cast
        .filter((c): c is { name: string; character?: unknown } => typeof c?.name === 'string' && c.name.trim() !== '')
        .map((c) => ({ name: c.name.trim(), character: typeof c.character === 'string' && c.character.trim() ? c.character.trim() : undefined }))
    : [];
  const fields: Partial<Movie> & { title: string } = {
    title,
    originalTitle: text(body.originalTitle) || undefined,
    year: num(body.year),
    runtime: num(body.runtime),
    tagline: text(body.tagline),
    overview: text(body.overview),
    directors: strings(body.directors),
    genres: strings(body.genres),
    cast,
    tmdbId: num(body.tmdbId),
    status,
    watchDates: status === 'watched' ? strings(body.watchDates) : [],
    rating: status === 'watched' ? num(body.rating) : null,
  };
  try {
    const movie = await createWithImages(fields, { posterUrl: body.posterUrl, backdropUrl: body.backdropUrl });
    return NextResponse.json(movie, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
