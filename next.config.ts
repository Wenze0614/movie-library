import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Posters are served from the local data folder through /api/media, so no
  // remote image domains are needed.
  reactStrictMode: true,
};

export default nextConfig;
