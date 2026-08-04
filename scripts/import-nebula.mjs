import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseScreenDocument, serializeScreenDocument } from '../packages/contracts/dist/index.js';

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsByName.set(process.argv[index], process.argv[index + 1]);
}

const inputPath = argumentsByName.get('--input');
const outputPath = argumentsByName.get('--output');
if (inputPath === undefined || outputPath === undefined) {
  throw new Error(
    'NEBULA_IMPORT_USAGE: node scripts/import-nebula.mjs --input <export.json> --output <screen.json>',
  );
}

const absoluteInput = resolve(inputPath);
const absoluteOutput = resolve(outputPath);
const reportPath = `${absoluteOutput}.report.json`;
let source;
try {
  source = JSON.parse(readFileSync(absoluteInput, 'utf8'));
} catch {
  writeReport(reportPath, {
    source: absoluteInput,
    status: 'failed',
    diagnostics: [{ code: 'JSON_VALUE_INVALID', path: [] }],
  });
  throw new Error('NEBULA_IMPORT_INPUT_INVALID');
}

const mapped = mapNebulaExport(source);
const parsed = parseScreenDocument(mapped.document);
if (!parsed.ok) {
  writeReport(reportPath, {
    source: absoluteInput,
    status: 'failed',
    mappedComponents: mapped.mappedComponents,
    skippedComponents: mapped.skippedComponents,
    diagnostics: parsed.diagnostics.map((item) => ({ code: item.code, path: item.path })),
  });
  throw new Error('NEBULA_IMPORT_DOCUMENT_INVALID');
}

writeFileSync(absoluteOutput, serializeScreenDocument(parsed.value), 'utf8');
writeReport(reportPath, {
  source: absoluteInput,
  status: 'success',
  mappedComponents: mapped.mappedComponents,
  skippedComponents: mapped.skippedComponents,
  diagnostics: [],
});

function mapNebulaExport(source) {
  const record = isRecord(source) ? source : {};
  const rawComponents = Array.isArray(record.components) ? record.components : [];
  const components = [];
  let skippedComponents = 0;
  for (const raw of rawComponents) {
    if (!isRecord(raw)) {
      skippedComponents++;
      continue;
    }
    components.push({
      id: raw.id,
      type: raw.type,
      name: raw.name,
      parentId: raw.parentId ?? null,
      position: raw.position,
      size: raw.size,
      rotation: raw.rotation ?? 0,
      zIndex: raw.zIndex ?? 0,
      status: raw.status ?? { locked: false, hidden: false },
      props: raw.props ?? {},
      style: raw.style ?? {},
      dataSource: raw.dataSource ?? null,
    });
  }
  return {
    document: {
      canvas: record.canvas,
      components,
      variables: Array.isArray(record.variables) ? record.variables : [],
      blueprint: { apiVersion: 1, rules: [] },
    },
    mappedComponents: components.length,
    skippedComponents,
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function writeReport(path, report) {
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
