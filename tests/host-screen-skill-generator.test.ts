import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createHostSkill } from '../skills/create-base-screen-host-skill/scripts/create-host-screen-skill.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const BUNDLE_FIXTURE = join(TEST_DIR, 'fixtures', 'host-skill-smoke');
const DOCUMENT_FIXTURE = join(TEST_DIR, 'fixtures', 'host-screen-valid-document.json');

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function copyBundle(): Promise<string> {
  const bundle = await temporaryDirectory('base-screen-host-bundle');
  await cp(BUNDLE_FIXTURE, bundle, { recursive: true });
  return bundle;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

describe('host screen Skill generator', () => {
  it('validates a host snapshot and renders deterministic files', async () => {
    const bundle = await copyBundle();
    const first = await createHostSkill({ inputDir: bundle, checkOnly: true });
    const second = await createHostSkill({ inputDir: bundle, checkOnly: true });

    expect(first.skillName).toBe('design-acme-screens');
    expect([...first.files.entries()]).toEqual([...second.files.entries()]);
    expect(first.files.get('generation-manifest.json')).toContain('create-base-screen-host-skill');
    expect(first.files.get('references/screen-document.schema.json')).toContain('screen-document');

    await rm(bundle, { recursive: true, force: true });
  });

  it('rejects files outside the snapshot allowlist', async () => {
    const bundle = await copyBundle();
    await writeFile(join(bundle, 'notes.txt'), 'do not ingest');

    await expect(createHostSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'unsupported entry "notes.txt"',
    );
    await rm(bundle, { recursive: true, force: true });
  });

  it('rejects descriptor parameters that do not match resource configSchema', async () => {
    const bundle = await copyBundle();
    const file = join(bundle, 'datasets.json');
    const datasets = await readJson<Array<{ parameters: Array<Record<string, unknown>> }>>(file);
    datasets[0]!.parameters[0] = {
      name: 'unknown',
      label: 'Unknown',
      editor: 'text',
    };
    await writeFile(file, `${JSON.stringify(datasets, null, 2)}\n`);

    await expect(createHostSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'parameters must match resource type metrics.configSchema.properties exactly',
    );
    await rm(bundle, { recursive: true, force: true });
  });

  it('requires an explicit sanitized classification for dataset samples', async () => {
    const bundle = await copyBundle();
    const file = join(bundle, 'dataset-samples.json');
    const samples = await readJson<Array<Record<string, unknown>>>(file);
    samples[0]!.classification = 'raw';
    await writeFile(file, `${JSON.stringify(samples, null, 2)}\n`);

    await expect(createHostSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'classification must be sanitized',
    );
    await rm(bundle, { recursive: true, force: true });
  });

  it('creates and guardedly updates only its generated target', async () => {
    const bundle = await copyBundle();
    const output = await temporaryDirectory('base-screen-host-output');
    const first = await createHostSkill({ inputDir: bundle, outputParent: output });
    await expect(createHostSkill({ inputDir: bundle, outputParent: output })).rejects.toThrow(
      'Refusing to overwrite',
    );

    const target = first.target;
    const marker = await readJson<{ generator: string; skillName: string }>(
      join(target, 'generation-manifest.json'),
    );
    expect(marker.generator).toBe('create-base-screen-host-skill');
    expect(marker.skillName).toBe('design-acme-screens');

    const guidelines = join(bundle, 'design-guidelines.md');
    await writeFile(guidelines, '# Updated rules\n\nUse a warm accent.\n');
    await createHostSkill({ inputDir: bundle, outputParent: output, update: true });
    expect(await readFile(join(target, 'references', 'host.md'), 'utf8')).toContain('warm accent');

    const unmarked = await temporaryDirectory('base-screen-unmarked-output');
    await mkdir(join(unmarked, 'design-acme-screens'));
    await writeFile(join(unmarked, 'design-acme-screens', 'SKILL.md'), 'owned by host');
    await expect(
      createHostSkill({ inputDir: bundle, outputParent: unmarked, update: true }),
    ).rejects.toThrow('unmarked Skill directory');

    await rm(bundle, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
    await rm(unmarked, { recursive: true, force: true });
  });

  it('resolves ESM-only host packages from the workspace node_modules', async () => {
    const workspace = await temporaryDirectory('base-screen-host-workspace');
    const packageRoot = join(workspace, 'node_modules', '@base-screen', 'contracts');
    await mkdir(join(packageRoot, 'dist'), { recursive: true });
    await writeFile(
      join(packageRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: '@base-screen/contracts',
          version: '0.0.0',
          type: 'module',
          exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(packageRoot, 'dist', 'index.js'),
      'export const parseScreenDocument = () => ({ ok: true, value: {}, diagnostics: [] });\n',
    );
    await writeFile(join(workspace, 'package.json'), '{}\n');

    const validator = await import(
      pathToFileURL(
        join(
          TEST_DIR,
          '..',
          'skills',
          'create-base-screen-host-skill',
          'assets',
          'host-skill-template',
          'scripts',
          'validate-screen-document.mjs',
        ),
      ).href
    );
    const entry = await validator.resolveHostPackageEntry(
      '@base-screen/contracts',
      pathToFileURL(join(workspace, 'package.json')),
    );
    expect(
      entry.endsWith(join('node_modules', '@base-screen', 'contracts', 'dist', 'index.js')),
    ).toBe(true);
    await expect(import(pathToFileURL(entry).href)).resolves.toHaveProperty('parseScreenDocument');

    await rm(workspace, { recursive: true, force: true });
  });

  it('validates a generated document against catalog, schema, and binding roles', async () => {
    const bundle = await copyBundle();
    const output = await temporaryDirectory('base-screen-host-validator');
    const generated = await createHostSkill({ inputDir: bundle, outputParent: output });
    const validator = await import(
      pathToFileURL(join(generated.target, 'scripts', 'validate-screen-document.mjs')).href
    );
    const validIssues = await validator.validateScreenDocumentFile(resolve(DOCUMENT_FIXTURE));
    expect(validIssues).toEqual([]);

    const invalidDocument = await readJson<Record<string, unknown>>(DOCUMENT_FIXTURE);
    const components = invalidDocument.components as Array<Record<string, unknown>>;
    components[1] = { ...components[1], type: 'acme.unknown' };
    const invalidFile = join(output, 'invalid.json');
    await writeFile(invalidFile, `${JSON.stringify(invalidDocument, null, 2)}\n`);
    const invalidIssues = await validator.validateScreenDocumentFile(invalidFile);
    expect(
      invalidIssues.some((issue: { code: string }) => issue.code === 'HOST_SKILL_MATERIAL_UNKNOWN'),
    ).toBe(true);

    const invalidBindingDocument = await readJson<Record<string, unknown>>(DOCUMENT_FIXTURE);
    const bindingComponents = invalidBindingDocument.components as Array<Record<string, unknown>>;
    const chartDataSource = bindingComponents[1]!.dataSource as Record<string, unknown>;
    chartDataSource.binding = { fields: { dimension: ['missing-day'], measures: ['sales'] } };
    const invalidBindingFile = join(output, 'invalid-binding.json');
    await writeFile(invalidBindingFile, `${JSON.stringify(invalidBindingDocument, null, 2)}\n`);
    const invalidBindingIssues = await validator.validateScreenDocumentFile(invalidBindingFile);
    expect(
      invalidBindingIssues.some(
        (issue: { code: string }) => issue.code === 'HOST_DATASET_BINDING_INVALID',
      ),
    ).toBe(true);

    const warningDocument = await readJson<Record<string, unknown>>(DOCUMENT_FIXTURE);
    const warningComponents = warningDocument.components as Array<Record<string, unknown>>;
    warningComponents[0] = {
      ...warningComponents[0],
      position: { x: -10, y: 32 },
    };
    const warningFile = join(output, 'warning.json');
    await writeFile(warningFile, `${JSON.stringify(warningDocument, null, 2)}\n`);
    const warningIssues = await validator.validateScreenDocumentFile(warningFile);
    expect(
      warningIssues.some(
        (issue: { code: string }) => issue.code === 'HOST_SKILL_LAYOUT_OUT_OF_BOUNDS',
      ),
    ).toBe(true);
    expect(warningIssues.some((issue: { severity: string }) => issue.severity === 'error')).toBe(
      false,
    );

    await rm(bundle, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  });
});
