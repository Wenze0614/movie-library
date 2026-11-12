import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Posters are served from the local data folder through /api/media, so no
  // remote image domains are needed.
  reactStrictMode: true,
  // Every API request passes through src/proxy.ts, which buffers bodies; leave
  // room for poster uploads (up to 15 MB, plus the multipart wrapping).
  experimental: { proxyClientMaxBodySize: '20mb' },
  // The desktop app bundles a self-contained server (see scripts/build-desktop.mjs);
  // the web workflow (`npm run dev` / `start`) is unchanged.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? {
        output: 'standalone' as const,
        // File tracing misses some of Next's own route runtimes (the media
        // route failed without this); scripts/build-desktop.mjs checks the rest.
        outputFileTracingIncludes: { '*': ['node_modules/next/dist/compiled/next-server/*.runtime.prod.js'] },
        // Only the server belongs in the desktop app: never anyone's library,
        // private folders, sources or art. (public/ is copied in separately.)
        outputFileTracingExcludes: {
          '*': [
            'data/**',
            'sharing/**',
            'seed/**',
            'src/**',
            'docs/**',
            'art/**',
            'scripts/**',
            'electron/**',
            'dist/**',
            'public/**',
            // Next's image resizing isn't used (posters are plain <img>s).
            'node_modules/sharp/**',
            'node_modules/@img/**',
          ],
        },
      }
    : {}),
};

export default nextConfig;
