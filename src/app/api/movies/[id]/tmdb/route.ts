import { NextResponse } from 'next/server';
import { applyTmdb } from '@/lib/library';

/** Link an existing movie to a TMDB entry and fill in poster, story, cast… */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { tmdbId } = (await req.json()) as { tmdbId: number };
  try {
    const movie = await applyTmdb((await params).id, Number(tmdbId));
    return movie ? NextResponse.json(movie) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
