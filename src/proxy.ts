import { NextResponse, type NextRequest } from 'next/server';

/**
 * The server runs on your own computer (in the desktop app and with
 * `npm run dev`), so any website you visit could try to send it requests.
 * Requests that change something must come from this app's own page: the
 * browser marks them same-origin (Sec-Fetch-Site), and the Origin, when sent,
 * matches this host. "same-site" isn't enough, since any other localhost
 * port counts as the same site. Requests without either header (curl and
 * other local tools) are allowed.
 */
const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

function fromThisApp(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false; // "null" (sandboxed frames, file pages) or garbage
  }
}

export function proxy(request: NextRequest) {
  if (READ_ONLY.has(request.method) || fromThisApp(request)) return NextResponse.next();
  return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
}

export const config = { matcher: '/api/:path*' };
