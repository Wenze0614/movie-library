// Builds the self-contained server the desktop app runs (.next/standalone),
// then copies in what `output: 'standalone'` leaves out: the static assets and
// public/ (the 3D model, the Rive cat, fonts…).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

rmSync(standalone, { recursive: true, force: true });
// Next's CLI run with this Node, without a shell, so paths with spaces stay intact on Windows.
const build = spawnSync(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NEXT_OUTPUT: 'standalone' },
});
if (build.status !== 0) process.exit(build.status ?? 1);

cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });

// File tracing can miss Next runtime files the server loads by name. Find
// every one the built server refers to and copy in any that are missing.
const serverCode = readdirSync(path.join(standalone, '.next', 'server'), { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(path.join(standalone, '.next', 'server', f), 'utf8'));
const runtimes = new Set(serverCode.flatMap((code) => code.match(/next\/dist\/compiled\/[\w@./-]+\.js/g) ?? []));
for (const file of runtimes) {
  const target = path.join(standalone, 'node_modules', file);
  if (existsSync(target)) continue;
  const source = path.join(root, 'node_modules', file);
  if (!existsSync(source)) {
    console.error(`The server needs ${file}, which isn't installed.`);
    process.exit(1);
  }
  cpSync(source, target);
  console.log(`Added ${file}, which file tracing missed`);
}
cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });

// Never ship anyone's library or keys: the server reads data from the app's own
// folder. (Next copies .env files, .env.production included, into the output.)
const leftovers = ['data', ...readdirSync(standalone).filter((f) => f.startsWith('.env'))];
for (const leftover of leftovers) {
  if (existsSync(path.join(standalone, leftover))) rmSync(path.join(standalone, leftover), { recursive: true, force: true });
}
console.log('Desktop server ready in .next/standalone');
