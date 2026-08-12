import { readFile, stat } from 'node:fs/promises';
import { findPackageJSON } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validateAssociation,
  validateDraftMaterialCatalog,
  validateMaterialCandidate,
  validateMaterialProvenance,
  validateMaterialRequest,
} from '../../shared/material-handoff.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export async function validateHandoffFiles({
  requestFile,
  candidateFile,
  catalogFile,
  provenanceFile,
} = {}) {
  const errors = [];
  const parseManifest = await loadMaterialManifestParser();
  const request = await readOptionalJson(requestFile, 'material-request.json', errors);
  const candidate = await readOptionalJson(candidateFile, 'material-candidate.json', errors);
  const catalog = await readOptionalJson(catalogFile, 'draft-material-catalog.json', errors);
  const provenance = await readOptionalJson(provenanceFile, 'material-provenance.json', errors);
  if (request !== undefined) addDiagnostics(errors, validateMaterialRequest(request));
  if (candidate !== undefined)
    addDiagnostics(errors, validateMaterialCandidate(candidate, { parseManifest }));
  if (catalog !== undefined)
    addDiagnostics(errors, validateDraftMaterialCatalog(catalog, { parseManifest }));
  if (provenance !== undefined) addDiagnostics(errors, validateMaterialProvenance(provenance));
  if (request !== undefined || candidate !== undefined || catalog !== undefined) {
    addMessages(errors, validateAssociation(request, candidate, catalog));
  }
  return { ok: errors.length === 0, diagnostics: errors };
}

async function loadMaterialManifestParser() {
  try {
    const packageJson = findPackageJSON(
      '@base-screen/plugin-core',
      pathToFileURL(join(process.cwd(), 'package.json')),
    );
    const manifest = JSON.parse(await readFile(packageJson, 'utf8'));
    const target = manifest.exports?.['.'];
    const entry =
      typeof target === 'string'
        ? target
        : target !== undefined && target !== null && typeof target === 'object'
          ? (target.import ?? target.default)
          : manifest.main;
    const module = await import(
      pathToFileURL(join(dirname(packageJson), entry ?? 'index.js')).href
    );
    return typeof module.parseBaseScreenMaterialManifest === 'function'
      ? module.parseBaseScreenMaterialManifest
      : undefined;
  } catch (workspaceError) {
    let current = resolve(process.cwd());
    while (current !== dirname(current)) {
      const fallback = join(current, 'packages', 'plugin-core', 'dist', 'index.js');
      try {
        await stat(fallback);
        const module = await import(pathToFileURL(fallback).href);
        if (typeof module.parseBaseScreenMaterialManifest === 'function') {
          return module.parseBaseScreenMaterialManifest;
        }
      } catch {}
      current = dirname(current);
    }
    current = SCRIPT_DIR;
    while (current !== dirname(current)) {
      const fallback = join(current, 'packages', 'plugin-core', 'dist', 'index.js');
      try {
        await stat(fallback);
        const module = await import(pathToFileURL(fallback).href);
        if (typeof module.parseBaseScreenMaterialManifest === 'function') {
          return module.parseBaseScreenMaterialManifest;
        }
      } catch {}
      current = dirname(current);
    }
    throw new Error(
      `Cannot load @base-screen/plugin-core for strict handoff validation: ${workspaceError.message}`,
    );
  }
}

async function readOptionalJson(file, label, errors) {
  if (file === undefined) return undefined;
  try {
    return JSON.parse((await readFile(resolve(file), 'utf8')).replace(/^\uFEFF/u, ''));
  } catch (error) {
    errors.push({ code: 'MATERIAL_HANDOFF_INVALID', message: `${label}: ${error.message}` });
    return undefined;
  }
}

function addDiagnostics(target, result) {
  if (!result.ok) target.push(...result.diagnostics);
}

function addMessages(target, messages) {
  for (const message of messages)
    target.push({ code: 'MATERIAL_HANDOFF_ASSOCIATION_INVALID', message });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help')
      throw new Error(
        'Usage: node validate-material-handoff.mjs [--request file] [--candidate file] [--catalog file] [--provenance file]',
      );
    const key = {
      '--request': 'requestFile',
      '--candidate': 'candidateFile',
      '--catalog': 'catalogFile',
      '--provenance': 'provenanceFile',
    }[flag];
    if (key === undefined) throw new Error(`Unknown argument ${flag}`);
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a file path`);
    options[key] = value;
  }
  if (Object.keys(options).length === 0) throw new Error('At least one handoff file is required');
  return options;
}

async function main() {
  try {
    const result = await validateHandoffFiles(parseArgs(process.argv.slice(2)));
    if (result.ok) console.log('Material handoff files are valid.');
    else {
      for (const diagnostic of result.diagnostics)
        console.error(`${diagnostic.code}: ${diagnostic.message}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  void main();
