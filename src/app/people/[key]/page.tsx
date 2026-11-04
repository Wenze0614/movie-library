import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { PersonDetail } from '@/components/PersonDetail';
import { findPerson, personDetails } from '@/lib/peopleStore';
import { listMovies } from '@/lib/store';
import { tmdbEnabled } from '@/lib/tmdb';

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const person = await findPerson((await params).key);
  return { title: person ? person.name : 'Not found' };
}

export default async function PersonPage({ params }: Props) {
  await connection();
  const person = await findPerson((await params).key);
  if (!person) notFound();
  const [details, movies, tmdb] = await Promise.all([
    person.tmdbId ? personDetails(person.tmdbId) : null,
    listMovies(),
    tmdbEnabled(),
  ]);
  const inLibrary = movies.flatMap((m) => (m.tmdbId ? [m.tmdbId] : []));
  return <PersonDetail key={person.key} person={person} details={details} inLibrary={inLibrary} tmdb={tmdb} />;
}
