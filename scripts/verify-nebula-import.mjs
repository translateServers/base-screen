import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScreenDocument } from '../packages/contracts/dist/index.js';

const directory = mkdtempSync(join(tmpdir(), 'base-screen-nebula-import-'));
const output = join(directory, 'screen.json');

try {
  execFileSync(
    process.execPath,
    [
      'scripts/import-nebula.mjs',
      '--input',
      'scripts/fixtures/nebula-minimal-export.json',
      '--output',
      output,
    ],
    { stdio: 'inherit' },
  );
  const document = JSON.parse(readFileSync(output, 'utf8'));
  const report = JSON.parse(readFileSync(`${output}.report.json`, 'utf8'));
  const parsed = parseScreenDocument(document);
  if (
    !parsed.ok ||
    report.status !== 'success' ||
    report.mappedComponents !== 1 ||
    report.skippedComponents !== 0
  ) {
    throw new Error('NEBULA_IMPORT_VERIFICATION_FAILED');
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
