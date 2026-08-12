import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateMaterialRequest } from './material-handoff.mjs';

function valueFor(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || args[index + 1] === undefined) throw new Error(`${flag} requires a value`);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const request = {
    requestId: valueFor(args, '--request-id'),
    hostId: valueFor(args, '--host-id'),
    screenDraftId: valueFor(args, '--screen-draft-id'),
    purpose: valueFor(args, '--purpose'),
    framework: valueFor(args, '--framework'),
    defaultSize: {
      width: Number(valueFor(args, '--width')),
      height: Number(valueFor(args, '--height')),
    },
    dataFields: JSON.parse(valueFor(args, '--data-fields')),
    events: JSON.parse(valueFor(args, '--events')),
  };
  const checked = validateMaterialRequest(request);
  if (!checked.ok) {
    for (const diagnostic of checked.diagnostics) console.error(diagnostic.message);
    process.exitCode = 1;
    return;
  }
  const output = resolve(valueFor(args, '--output'));
  await writeFile(output, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  console.log(`Wrote material request ${output}.`);
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
