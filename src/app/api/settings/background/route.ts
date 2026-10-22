import { NextResponse } from 'next/server';
import { updateSettings } from '@/lib/settings';
import { getMovie } from '@/lib/store';

/** Picks the film whose backdrop sits behind the collection (null clears it). */
export async function PUT(req: Request) {
  const { movieId } = (await req.json().catch(() => ({}))) as { movieId?: unknown };
  if (movieId !== null && (typeof movieId !== 'string' || !(await getMovie(movieId)))) {
    return NextResponse.json({ error: 'That film isn’t in your library.' }, { status: 404 });
  }
  await updateSettings({ collectionBackground: movieId });
  return NextResponse.json({ movieId });
}
