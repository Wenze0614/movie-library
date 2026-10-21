import { MEDIA_DIRS, readMedia, type MediaKind } from '@/lib/store';

/** Serves images from the local data folder. */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; file: string }> }) {
  const { kind, file } = await params;
  if (!(kind in MEDIA_DIRS)) return new Response('Not found', { status: 404 });
  try {
    const { data, type } = await readMedia(kind as MediaKind, file);
    return new Response(new Uint8Array(data), {
      headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
