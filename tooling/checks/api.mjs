import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyApiReports } from '../build/api-reports.mjs';
import { PACKAGE_DEFINITIONS } from './packages.mjs';

const REQUIRED_LIFECYCLE_API = Object.freeze({
  contracts: [
    'ScreenAbortSignal',
    'ScreenProjectAdapter',
    'ScreenProjectLoadRequest',
    'ScreenProjectSaveRequest',
    'ScreenProjectPublishRequest',
  ],
  engine: [
    'BaseScreenDesignerElement',
    'ScreenProjectController',
    'ScreenProjectControllerChange',
    'ScreenProjectPhase',
    'ScreenProjectScheduler',
  ],
});

for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
  const declarationPath = join('packages', directory, 'dist', 'index.d.ts');
  if (!existsSync(declarationPath)) {
    throw new Error(`API_ENTRY_MISSING: ${declarationPath}`);
  }
  const declaration = readFileSync(declarationPath, 'utf8');
  if (declaration.includes('/packages/') || declaration.includes('C:\\')) {
    throw new Error(`PRIVATE_DECLARATION_PATH: ${directory}`);
  }
  for (const symbol of REQUIRED_LIFECYCLE_API[directory] ?? []) {
    if (!new RegExp(`\\b${symbol}\\b`).test(declaration)) {
      throw new Error(`LIFECYCLE_API_MISSING: ${directory} -> ${symbol}`);
    }
  }
}

await verifyApiReports();
