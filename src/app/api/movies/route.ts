import { NextResponse } from 'next/server';
import { createMovie, listMovies } from '@/lib/store';
import { createFromTmdb } from '@/lib/library';
import type { Movie } from '@/lib/types';

export async function GET() {
  return NextResponse.json(await listMovies());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Movie> & { tmdbId?: number };
  const extra: Partial<Movie> = {
    status: body.status === 'watched' ? 'watched' : 'watchlist',
    watchDates: body.watchDates ?? [],
    rating: body.rating ?? null,
  };
  try {
    if (body.tmdbId) return NextResponse.json(await createFromTmdb(body.tmdbId, extra), { status: 201 });
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
    return NextResponse.json(await createMovie({ ...extra, title, year: body.year ?? null }), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
