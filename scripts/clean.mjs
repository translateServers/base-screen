import { rmSync } from 'node:fs';

rmSync('tarballs', { force: true, recursive: true });
