import type { Metadata } from 'next';
import { connection } from 'next/server';
import { People } from '@/components/People';
import { peoplePool } from '@/lib/peopleStore';

export const metadata: Metadata = { title: 'People' };

export default async function PeoplePage() {
  await connection(); // always read the latest files from disk
  return <People people={await peoplePool()} />;
}
