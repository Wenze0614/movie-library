import { connection } from 'next/server';
import { Collection } from '@/components/Collection';
import { listMovies } from '@/lib/store';

export default async function Home() {
  await connection(); // always read the latest files from disk
  return <Collection movies={await listMovies()} />;
}
