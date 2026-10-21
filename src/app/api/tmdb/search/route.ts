import { NextResponse } from 'next/server';
import { searchTmdb, tmdbEnabled } from '@/lib/tmdb';

export async function GET(req: Request) {
  if (!tmdbEnabled()) return NextResponse.json({ enabled: false, results: [] });
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ enabled: true, results: [] });
  try {
    return NextResponse.json({ enabled: true, results: await searchTmdb(q) });
  } catch (err) {
    return NextResponse.json({ enabled: true, results: [], error: (err as Error).message }, { status: 502 });
  }
}
