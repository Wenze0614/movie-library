import { NextResponse } from 'next/server';
import { getMovie, removeMedia, saveMedia, updateMovie } from '@/lib/store';

type Ctx = { params: Promise<{ id: string }> };

/** Upload your own poster (multipart form field "file"). */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const movie = await getMovie(id);
  if (!movie) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const file = (await req.formData()).get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Expected a "file" field.' }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Image is larger than 15 MB.' }, { status: 413 });
  try {
    const name = await saveMedia('posters', id, Buffer.from(await file.arrayBuffer()), file.type);
    await removeMedia('posters', movie.poster);
    return NextResponse.json(await updateMovie(id, { poster: name }));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 415 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const movie = await getMovie(id);
  if (!movie) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await removeMedia('posters', movie.poster);
  return NextResponse.json(await updateMovie(id, { poster: null }));
}
