import { NextResponse } from 'next/server';
import { deleteMovie, getMovie, updateMovie } from '@/lib/store';
import type { MoviePatch } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const movie = await getMovie((await params).id);
  return movie ? NextResponse.json(movie) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const patch = (await req.json()) as MoviePatch & { id?: unknown; createdAt?: unknown; updatedAt?: unknown };
  delete patch.id;
  delete patch.createdAt;
  delete patch.updatedAt;
  const movie = await updateMovie((await params).id, patch);
  return movie ? NextResponse.json(movie) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const ok = await deleteMovie((await params).id);
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
