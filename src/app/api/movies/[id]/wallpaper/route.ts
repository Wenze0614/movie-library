import { NextResponse } from 'next/server';
import { getMovie } from '@/lib/store';
import { setWallpaper, WallpaperError } from '@/lib/wallpaper';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Only this app's own page may change your desktop: a JSON request can't be
 * sent from another website without the browser asking this server first
 * (which it never allows), and the Origin, when present, must be this host.
 */
function fromThisApp(req: Request) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) return false;
  const origin = req.headers.get('origin');
  return !origin || new URL(origin).host === req.headers.get('host');
}

export async function POST(req: Request, { params }: Ctx) {
  if (!fromThisApp(req)) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const movie = await getMovie((await params).id);
  if (!movie) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    await setWallpaper(movie);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('wallpaper:', err);
    const message = err instanceof WallpaperError ? err.message : 'Couldn’t set the wallpaper. See the server log for details.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
