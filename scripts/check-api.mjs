import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_DEFINITIONS } from './check-packages.mjs';

for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
  const declarationPath = join('packages', directory, 'dist', 'index.d.ts');
  if (!existsSync(declarationPath)) {
    throw new Error(`API_ENTRY_MISSING: ${declarationPath}`);
  }
  const declaration = readFileSync(declarationPath, 'utf8');
  if (declaration.includes('/packages/') || declaration.includes('C:\\')) {
    throw new Error(`PRIVATE_DECLARATION_PATH: ${directory}`);
  }
}
