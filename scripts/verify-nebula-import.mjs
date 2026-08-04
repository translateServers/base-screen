import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScreenDocument } from '../packages/contracts/dist/index.js';

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), 'base-screen-nebula-import-'));
const fixtures = [
  'scripts/fixtures/nebula-authorized-document-root.json',
  'scripts/fixtures/nebula-authorized-project-envelope.json',
  'scripts/fixtures/nebula-authorized-export-wrapper.json',
];

try {
  for (const [index, fixture] of fixtures.entries()) {
    verifyFixture(fixture, index);
  }
  verifyAnalyzeDoesNotWriteOutput();
  verifyVariantRejectionsPreventOutput();
  verifyMapDecisionConvertsComponent();
  verifyDropDecisionConvertsLoss();
  verifyCancelDecisionPreventsOutput();
  verifyMalformedDecisionsPreventOutput();
  verifyMissingDecisionPreventsOutput();
  verifyUnusedDecisionPreventsOutput();
  verifyAllPathCollisionsAreRejected();
  verifyWriteFailuresCleanOutput();
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

function verifyVariantRejectionsPreventOutput() {
  verifyVariantRejection('zero-variant', { nebulaVersion: 1 }, 'NEBULA_VARIANT_UNRECOGNIZED');
  verifyVariantRejection(
    'multiple-variants',
    {
      nebulaVersion: 1,
      ...createDocument(),
      project: { projectVersion: 1, document: createDocument() },
    },
    'NEBULA_VARIANT_AMBIGUOUS',
  );
}

function verifyVariantRejection(name, source, code) {
  const input = join(directory, `${name}.json`);
  const output = join(directory, `${name}-output.json`);
  const report = join(directory, `${name}-report.json`);
  const decision = join(directory, `${name}-decision.json`);
  writeJson(input, source);
  writeFileSync(output, 'stale success output\n', 'utf8');
  writeDecisions(decision, []);
  expectFailure(['--input', input, '--output', output, '--report', report, '--decision', decision]);
  assertFailureWithoutOutput(output, report, code);
}

function verifyMapDecisionConvertsComponent() {
  const input = join(directory, 'map-input.json');
  const output = join(directory, 'map-output.json');
  const report = join(directory, 'map-report.json');
  const decision = join(directory, 'map-decision.json');
  writeJson(input, {
    nebulaVersion: 1,
    ...createDocument({ components: [createComponent({ type: 'legacy.headline' })] }),
  });
  writeDecisions(decision, [
    { id: 'component-0-type', action: 'map', targetMaterialType: 'base.text' },
  ]);
  run(['--input', input, '--output', output, '--report', report, '--decision', decision]);
  const result = JSON.parse(readFileSync(report, 'utf8'));
  const document = JSON.parse(readFileSync(output, 'utf8'));
  if (result.status !== 'success' || document.components[0]?.type !== 'base.text') {
    throw new Error('NEBULA_IMPORT_MAP_DECISION_FAILED');
  }
}

function verifyDropDecisionConvertsLoss() {
  const input = join(directory, 'drop-input.json');
  const output = join(directory, 'drop-output.json');
  const report = join(directory, 'drop-report.json');
  const decision = join(directory, 'drop-decision.json');
  writeJson(input, {
    nebulaVersion: 1,
    ...createDocument({ components: [null] }),
    legacyMetadata: true,
  });
  writeDecisions(decision, [
    { id: 'component-0', action: 'drop' },
    { id: 'field-document-legacyMetadata', action: 'drop' },
  ]);
  run(['--input', input, '--output', output, '--report', report, '--decision', decision]);
  const result = JSON.parse(readFileSync(report, 'utf8'));
  const document = JSON.parse(readFileSync(output, 'utf8'));
  if (
    result.status !== 'success' ||
    result.skippedComponents !== 1 ||
    document.components.length !== 0 ||
    'legacyMetadata' in document
  ) {
    throw new Error('NEBULA_IMPORT_DROP_DECISION_FAILED');
  }
}

function verifyCancelDecisionPreventsOutput() {
  const input = join(directory, 'cancel-input.json');
  const output = join(directory, 'cancel-output.json');
  const report = join(directory, 'cancel-report.json');
  const decision = join(directory, 'cancel-decision.json');
  writeJson(input, { nebulaVersion: 1, ...createDocument(), legacyMetadata: true });
  writeFileSync(output, 'stale success output\n', 'utf8');
  writeDecisions(decision, [{ id: 'field-document-legacyMetadata', action: 'cancel' }]);
  expectFailure(['--input', input, '--output', output, '--report', report, '--decision', decision]);
  assertFailureWithoutOutput(output, report, 'NEBULA_DECISION_CANCELLED');
}

function verifyMalformedDecisionsPreventOutput() {
  const malformed = [
    '{',
    JSON.stringify({
      decisions: [{ id: 'field-document-legacyMetadata', action: 'map' }],
    }),
  ];
  for (const [index, contents] of malformed.entries()) {
    const input = join(directory, `malformed-${index}-input.json`);
    const output = join(directory, `malformed-${index}-output.json`);
    const report = join(directory, `malformed-${index}-report.json`);
    const decision = join(directory, `malformed-${index}-decision.json`);
    writeJson(input, { nebulaVersion: 1, ...createDocument(), legacyMetadata: true });
    writeFileSync(output, 'stale success output\n', 'utf8');
    writeFileSync(decision, contents, 'utf8');
    expectFailure([
      '--input',
      input,
      '--output',
      output,
      '--report',
      report,
      '--decision',
      decision,
    ]);
    assertFailureWithoutOutput(output, report, 'NEBULA_DECISION_INVALID');
  }
}

function verifyUnusedDecisionPreventsOutput() {
  const input = join(directory, 'unused-input.json');
  const output = join(directory, 'unused-output.json');
  const report = join(directory, 'unused-report.json');
  const decision = join(directory, 'unused-decision.json');
  writeJson(input, { nebulaVersion: 1, ...createDocument() });
  writeFileSync(output, 'stale success output\n', 'utf8');
  writeDecisions(decision, [{ id: 'unused', action: 'drop' }]);
  expectFailure(['--input', input, '--output', output, '--report', report, '--decision', decision]);
  assertFailureWithoutOutput(output, report, 'NEBULA_DECISION_UNUSED');
}

function verifyMissingDecisionPreventsOutput() {
  const input = join(directory, 'missing-input.json');
  const output = join(directory, 'missing-output.json');
  const report = join(directory, 'missing-report.json');
  const decision = join(directory, 'missing-decision.json');
  writeJson(input, { nebulaVersion: 1, ...createDocument(), legacyMetadata: true });
  writeFileSync(output, 'stale success output\n', 'utf8');
  writeDecisions(decision, []);
  expectFailure(['--input', input, '--output', output, '--report', report, '--decision', decision]);
  assertFailureWithoutOutput(output, report, 'NEBULA_DECISION_MISSING');
}

function verifyAllPathCollisionsAreRejected() {
  const input = join(directory, 'collision-input.json');
  const output = join(directory, 'collision-output.json');
  const report = join(directory, 'collision-report.json');
  const decision = join(directory, 'collision-decision.json');
  const inputContents = JSON.stringify({ nebulaVersion: 1, ...createDocument() });
  const decisionContents = '{"decisions":[]}\n';
  writeFileSync(input, inputContents, 'utf8');
  writeFileSync(decision, decisionContents, 'utf8');

  for (const [first, second] of [
    ['input', 'output'],
    ['input', 'report'],
    ['input', 'decision'],
    ['output', 'report'],
    ['output', 'decision'],
    ['report', 'decision'],
  ]) {
    const paths = { input, output, report, decision };
    paths[second] = paths[first];
    expectFailure([
      '--input',
      paths.input,
      '--output',
      paths.output,
      '--report',
      paths.report,
      '--decision',
      paths.decision,
    ]);
    if (
      readFileSync(input, 'utf8') !== inputContents ||
      readFileSync(decision, 'utf8') !== decisionContents
    ) {
      throw new Error('NEBULA_IMPORT_PATH_COLLISION_MUTATED_SOURCE');
    }
  }

  expectFailure([
    '--input',
    input,
    '--output',
    join(directory, 'normalized', '..', 'collision-input.json'),
    '--report',
    report,
    '--decision',
    decision,
  ]);
}

function verifyWriteFailuresCleanOutput() {
  const input = join(directory, 'write-failure-input.json');
  const decision = join(directory, 'write-failure-decision.json');
  writeJson(input, { nebulaVersion: 1, ...createDocument() });
  writeDecisions(decision, []);

  const outputParent = join(directory, 'missing-output-parent');
  const output = join(outputParent, 'screen.json');
  const outputReport = join(directory, 'output-write-failure-report.json');
  expectFailure([
    '--input',
    input,
    '--output',
    output,
    '--report',
    outputReport,
    '--decision',
    decision,
  ]);
  if (existsSync(output)) throw new Error('NEBULA_IMPORT_OUTPUT_WRITE_LEFT_OUTPUT');

  const reportOutput = join(directory, 'report-write-failure-output.json');
  const report = join(directory, 'missing-report-parent', 'report.json');
  expectFailure([
    '--input',
    input,
    '--output',
    reportOutput,
    '--report',
    report,
    '--decision',
    decision,
  ]);
  if (existsSync(reportOutput)) throw new Error('NEBULA_IMPORT_REPORT_WRITE_LEFT_OUTPUT');
}

function createDocument({ components = [createComponent()] } = {}) {
  return {
    canvas: { width: 320, height: 180, backgroundColor: '#101820' },
    components,
    variables: [],
  };
}

function createComponent({ type = 'base.text' } = {}) {
  return {
    id: 'headline',
    type,
    name: 'Headline',
    position: { x: 16, y: 16 },
    size: { width: 280, height: 48 },
    props: { text: 'Imported' },
    style: {},
    dataSource: null,
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
}

function writeDecisions(path, decisions) {
  writeJson(path, { decisions });
}

function assertFailureWithoutOutput(output, report, code) {
  if (existsSync(output)) throw new Error(`NEBULA_IMPORT_${code}_WROTE_OUTPUT`);
  const result = JSON.parse(readFileSync(report, 'utf8'));
  if (result.status !== 'failed' || !result.findings.some((finding) => finding.code === code)) {
    throw new Error(`NEBULA_IMPORT_${code}_REPORT_FAILED`);
  }
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
