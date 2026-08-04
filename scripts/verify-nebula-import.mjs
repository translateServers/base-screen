import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScreenDocument } from '../packages/contracts/dist/index.js';

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), 'base-screen-nebula-import-'));
const fixtures = [
  'scripts/fixtures/nebula-minimal-export.json',
  'scripts/fixtures/nebula-project-envelope.json',
  'scripts/fixtures/nebula-export-wrapper.json',
];

try {
  for (const [index, fixture] of fixtures.entries()) {
    verifyFixture(fixture, index);
  }
  verifyAnalyzeDoesNotWriteOutput();
  verifyUnresolvedDecisionPreventsOutput();
  verifyPathCollisionIsRejected();
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function verifyFixture(fixture, index) {
  const output = join(directory, `screen-${index}.json`);
  const report = join(directory, `report-${index}.json`);
  const decision = join(directory, `decision-${index}.json`);
  writeFileSync(decision, '{"decisions":[]}\n', 'utf8');
  run(['--input', fixture, '--output', output, '--report', report, '--decision', decision]);
  const document = JSON.parse(readFileSync(output, 'utf8'));
  const result = JSON.parse(readFileSync(report, 'utf8'));
  const parsed = parseScreenDocument(document);
  if (
    !parsed.ok ||
    result.status !== 'success' ||
    result.mappedComponents !== 1 ||
    result.skippedComponents !== 0
  ) {
    throw new Error(`NEBULA_IMPORT_FIXTURE_FAILED: ${fixture}`);
  }
}

function verifyAnalyzeDoesNotWriteOutput() {
  const output = join(directory, 'analyze-output.json');
  const report = join(directory, 'analyze-report.json');
  run(['--analyze', '--input', fixtures[0], '--report', report]);
  const result = JSON.parse(readFileSync(report, 'utf8'));
  if (result.status !== 'ready' || existsSync(output)) {
    throw new Error('NEBULA_IMPORT_ANALYZE_VERIFICATION_FAILED');
  }
}

function verifyUnresolvedDecisionPreventsOutput() {
  const input = join(directory, 'unmapped.json');
  const output = join(directory, 'unmapped-output.json');
  const report = join(directory, 'unmapped-report.json');
  const decision = join(directory, 'unmapped-decision.json');
  writeFileSync(
    input,
    JSON.stringify({
      nebulaVersion: 1,
      canvas: { width: 1, height: 1, backgroundColor: '#000000' },
      components: [],
      variables: [],
      unsupported: true,
    }),
    'utf8',
  );
  writeFileSync(decision, '{"decisions":[]}\n', 'utf8');
  expectFailure(['--input', input, '--output', output, '--report', report, '--decision', decision]);
  if (existsSync(output)) {
    throw new Error('NEBULA_IMPORT_UNRESOLVED_WROTE_OUTPUT');
  }
}

function verifyPathCollisionIsRejected() {
  const collision = join(directory, 'collision.json');
  expectFailure(['--analyze', '--input', collision, '--report', collision]);
}

function run(args) {
  execFileSync(process.execPath, ['scripts/import-nebula.mjs', ...args], {
    cwd: root,
    stdio: 'pipe',
  });
}

function expectFailure(args) {
  try {
    run(args);
  } catch {
    return;
  }
  throw new Error('NEBULA_IMPORT_EXPECTED_FAILURE');
}
