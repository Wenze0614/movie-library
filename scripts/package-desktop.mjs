// Builds the desktop server, then packages the app with electron-builder.
// Usage: node scripts/package-desktop.mjs --mac | --win
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/** Runs a Node script with this Node, without a shell (so paths with spaces stay intact on Windows). */
function runNode(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNode(path.join(root, 'scripts', 'build-desktop.mjs'), [], root);

// electron-builder refuses to work in a folder whose path has shell-special
// characters (an apostrophe in "Wenze's Projects", say), so it gets a plain
// link to the project instead. The output still lands in the project's dist/.
let projectDir = root;
let link = null;
if (/[^\w\-./\\: ]/.test(root)) {
  link = path.join(mkdtempSync(path.join(os.tmpdir(), 'movie-library-')), 'project');
  symlinkSync(root, link, 'junction');
  projectDir = link;
}
try {
  runNode(path.join(projectDir, 'node_modules', 'electron-builder', 'cli.js'), [...process.argv.slice(2), '--projectDir', projectDir], projectDir);
} finally {
  if (link) {
    unlinkSync(link); // the link only, never the project it points to
    rmdirSync(path.dirname(link));
  }
}
