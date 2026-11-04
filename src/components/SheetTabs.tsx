import Link from 'next/link';

/** Films / People, at the top of the paper on both lists. */
export function SheetTabs({ active }: { active: 'films' | 'people' }) {
  return (
    <nav className="sheet-tabs" aria-label="Library">
      <Link href="/" className={active === 'films' ? 'is-active' : ''} aria-current={active === 'films' ? 'page' : undefined}>
        Films
      </Link>
      <Link href="/people" className={active === 'people' ? 'is-active' : ''} aria-current={active === 'people' ? 'page' : undefined}>
        People
      </Link>
    </nav>
  );
}
