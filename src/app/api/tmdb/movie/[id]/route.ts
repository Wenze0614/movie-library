import { NextResponse } from 'next/server';
import { tmdbDetails } from '@/lib/tmdb';

/** Full details for one TMDB film, shown for review before it's added. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  try {
    return NextResponse.json(await tmdbDetails(id));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
