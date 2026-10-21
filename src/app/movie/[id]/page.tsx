import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { MovieDetail } from '@/components/MovieDetail';
import { getMovie } from '@/lib/store';
import { tmdbEnabled } from '@/lib/tmdb';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const movie = await getMovie((await params).id);
  return { title: movie ? movie.title : 'Not found' };
}

export default async function MoviePage({ params }: Props) {
  await connection();
  const movie = await getMovie((await params).id);
  if (!movie) notFound();
  return <MovieDetail key={movie.id} initial={movie} tmdb={tmdbEnabled()} />;
}
