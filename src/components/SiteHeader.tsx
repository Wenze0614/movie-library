'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { site } from '@/config';
import { AddFilmButton } from './AddFilmDialog';
import { KeyButton } from './ApiKeyDialog';

export function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === '/' || pathname === '/people';

  // The hero is tall on the two lists (Films, People) and starts as a banner elsewhere.
  useEffect(() => {
    document.documentElement.dataset.page = isHome ? 'home' : 'inner';
  }, [isHome]);

  return (
    <header className="site-header">
      <Link href="/" className="brand">
        <span className="brand-title">{site.title}</span>
        <span className="brand-tagline">
          {site.tagline.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      </Link>
      <div className="nav">
        <AddFilmButton />
        <KeyButton />
      </div>
    </header>
  );
}
