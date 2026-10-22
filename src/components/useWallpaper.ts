'use client';
import { useRef } from 'react';
import { api } from '@/lib/api';
import type { Movie } from '@/lib/types';

/**
 * Sets a film as the desktop wallpaper and keeps you posted. On a Mac in full
 * screen (a Space with its own wallpaper) the server waits until you're back
 * on your desktop; the message says so, then confirms once it's done.
 */
export function useWallpaper(notify: (text: string, ms?: number) => void) {
  const latest = useRef<string | null>(null);
  return async (movie: Movie) => {
    latest.current = movie.id;
    const say = (text: string, ms?: number) => latest.current === movie.id && notify(text, ms);
    say(`Setting ${movie.title} as your wallpaper…`, 0);
    try {
      const { waiting } = await api.setWallpaper(movie.id);
      if (waiting) {
        say(`If you are on Mac, please EXIT full screen or return to desktop to apply the wallpaper switch`, 0);
        if ((await api.wallpaperSettled(movie.id)).status !== 'set') return;
      }
      say(`${movie.title} is now your wallpaper`);
    } catch (err) {
      say((err as Error).message, 5000);
    }
  };
}
