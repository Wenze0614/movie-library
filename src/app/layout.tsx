import type { Metadata, Viewport } from 'next';
import { Allura, Cormorant_Garamond, Courier_Prime, Lora } from 'next/font/google';
import { site } from '@/config';
import { HeroScene } from '@/components/HeroScene';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const script = Allura({ subsets: ['latin'], weight: '400', variable: '--font-script' });
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-display' });
const body = Lora({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-body' });
const mono = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: { default: site.title, template: `%s · ${site.title}` },
  description: site.collectionSubtitle,
};

export const viewport: Viewport = { themeColor: '#140d0b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${script.variable} ${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="hero">
          <HeroScene />
          <SiteHeader />
        </div>
        <main className="sheet">{children}</main>
        {/* <footer className="footer">
          <p>
            {site.footerQuote.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
          <hr />
        </footer> */}
      </body>
    </html>
  );
}
