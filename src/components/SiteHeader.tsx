'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { site } from '@/config';
import { AddFilmButton } from './AddFilmDialog';

const NAV = [
  { href: '/', label: 'Collection' },
  { href: '/diary', label: 'Diary' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === '/';

  // The hero is tall on the home page and shrinks to a window strip elsewhere.
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
      <nav className="nav" aria-label="Main">
        {NAV.map((item) => {
          const active = item.href === '/' ? isHome : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className="nav-link" aria-current={active ? 'page' : undefined}>
              {item.label}
            </Link>
          );
        })}
        <AddFilmButton />
      </nav>
    </header>
  );
}
