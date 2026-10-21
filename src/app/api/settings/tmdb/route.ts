import { NextResponse } from 'next/server';
import { updateSettings } from '@/lib/settings';
import { tmdbKey, verifyTmdbKey } from '@/lib/tmdb';

/** The key itself never leaves the server: status shows only its last 4 characters. */
async function status() {
  const found = await tmdbKey();
  return {
    configured: Boolean(found),
    source: found?.source ?? null,
    hint: found ? `…${found.key.slice(-4)}` : null,
  };
}

export async function GET() {
  return NextResponse.json(await status());
}

export async function PUT(req: Request) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  const clean = key?.trim();
  if (!clean) return NextResponse.json({ error: 'Paste a key first.' }, { status: 400 });
  const check = await verifyTmdbKey(clean);
  if (check === 'rejected') {
    return NextResponse.json({ error: 'TMDB didn’t accept that key. Check you copied all of it.' }, { status: 400 });
  }
  if (check === 'unreachable') {
    return NextResponse.json({ error: 'Couldn’t reach TMDB to check the key. Are you online?' }, { status: 502 });
  }
  await updateSettings({ tmdbApiKey: clean });
  return NextResponse.json(await status());
}

export async function DELETE() {
  await updateSettings({ tmdbApiKey: null });
  return NextResponse.json(await status());
}
