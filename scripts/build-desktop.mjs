// Builds the self-contained server the desktop app runs (.next/standalone),
// then copies in what `output: 'standalone'` leaves out: the static assets and
// public/ (the 3D model, the Rive cat, fonts…).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

rmSync(standalone, { recursive: true, force: true });
const build = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NEXT_OUTPUT: 'standalone' },
  shell: process.platform === 'win32',
});
if (build.status !== 0) process.exit(build.status ?? 1);

cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });

// Never ship anyone's library or keys: the server reads data from the app's own
// folder. (Next copies .env files, .env.production included, into the output.)
const leftovers = ['data', ...readdirSync(standalone).filter((f) => f.startsWith('.env'))];
for (const leftover of leftovers) {
  if (existsSync(path.join(standalone, leftover))) rmSync(path.join(standalone, leftover), { recursive: true, force: true });
}
console.log('Desktop server ready in .next/standalone');
