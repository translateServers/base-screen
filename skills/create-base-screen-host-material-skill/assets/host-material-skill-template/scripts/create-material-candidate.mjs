import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateMaterialCandidate } from './material-handoff.mjs';

function valueFor(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || args[index + 1] === undefined) throw new Error(`${flag} requires a value`);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const request = JSON.parse(await readFile(resolve(valueFor(args, '--request')), 'utf8'));
  const material = JSON.parse(await readFile(resolve(valueFor(args, '--manifest')), 'utf8'));
  const candidate = {
    requestId: request.requestId,
    hostId: request.hostId,
    screenDraftId: request.screenDraftId,
    status: 'pending-review',
    framework: valueFor(args, '--framework'),
    packageId: valueFor(args, '--package'),
    material,
    sourcePath: valueFor(args, '--source'),
    testPath: valueFor(args, '--test'),
    registration: 'draft-only',
  };
  const checked = validateMaterialCandidate(candidate);
  if (!checked.ok) {
    for (const diagnostic of checked.diagnostics) console.error(diagnostic.message);
    process.exitCode = 1;
    return;
  }
  const output = resolve(valueFor(args, '--output'));
  await writeFile(output, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  console.log(`Wrote draft candidate ${output}.`);
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
