import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rootLicense = 'LICENSE';
const packagesRoot = 'packages';

if (!existsSync(rootLicense)) {
  throw new Error('Root LICENSE is required before package artifacts can be built.');
}

for (const directory of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (directory.isDirectory()) {
    copyFileSync(rootLicense, join(packagesRoot, directory.name, 'LICENSE'));
  }
}
