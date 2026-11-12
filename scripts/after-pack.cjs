// electron-builder hook: puts the self-contained server into the packaged
// app's resources. Done here rather than with `extraResources`, which quietly
// leaves out node_modules folders (the server needs its own). Runs before
// signing, so the server is signed along with the app.
const { cpSync, existsSync } = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack({ appOutDir, electronPlatformName, packager }) {
  const source = path.resolve(__dirname, '..', '.next', 'standalone');
  if (!existsSync(path.join(source, 'server.js'))) {
    throw new Error('No desktop server build in .next/standalone: run `npm run desktop:build` first.');
  }
  const resources =
    electronPlatformName === 'darwin'
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');
  cpSync(source, path.join(resources, 'server'), { recursive: true, dereference: true });
};
