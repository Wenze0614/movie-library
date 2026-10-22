import { connection } from 'next/server';
import { Collection } from '@/components/Collection';
import { readSettings } from '@/lib/settings';
import { listMovies } from '@/lib/store';
import { wallpaperPlatform } from '@/lib/wallpaper';

export default async function Home() {
  await connection(); // always read the latest files from disk
  const [movies, settings] = await Promise.all([listMovies(), readSettings()]);
  return (
    <Collection
      movies={movies}
      backgroundId={settings.collectionBackground ?? null}
      wallpaper={wallpaperPlatform() !== null}
    />
  );
}
