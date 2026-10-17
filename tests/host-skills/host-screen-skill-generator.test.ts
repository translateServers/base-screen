import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createHostSkill } from '../../skills/create-base-screen-host-skill/scripts/create-host-screen-skill.mjs';
import { makeSnapshot, writeSnapshotFile } from './host-snapshot-fixture';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const DOCUMENT_FIXTURE = join(TEST_DIR, '../fixtures/legacy-host-screen-valid-document.json');

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

describe('host screen Skill generator', () => {
  it('validates a canonical snapshot and renders deterministic files', async () => {
    const { file } = await writeSnapshotFile();
    try {
      const first = await createHostSkill({ snapshotFile: file, checkOnly: true });
      const second = await createHostSkill({ snapshotFile: file, checkOnly: true });

      expect(first.skillName).toBe('design-acme-screens');
      expect([...first.files.entries()]).toEqual([...second.files.entries()]);
      expect(first.snapshotDigest).toBe(second.snapshotDigest);
      expect(first.files.get('generation-manifest.json')).toContain('snapshotDigest');
      expect(first.files.get('generation-manifest.json')).toContain('catalogDigest');
      expect(first.files.get('references/material-mcp.md')).toContain('may be stale');
      expect(first.files.get('references/screen-document.schema.json')).toContain(
        'screen-document',
      );
      expect(first.files.get('scripts/create-material-request.mjs')).toContain(
        'validateMaterialRequest',
      );
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
    }
  });

  it('accepts optional material provenance and renders a stable source index', async () => {
    const { file } = await writeSnapshotFile({
      materialProvenance: [
        { type: 'acme.chart', source: 'online', authoring: 'host-platform', editable: false },
        { type: 'acme.text', source: 'code', authoring: 'workspace', editable: true },
      ],
    });
    try {
      const result = await createHostSkill({ snapshotFile: file, checkOnly: true });
      expect(result.files.get('references/material-provenance.json')).toContain('acme.chart');
      expect(result.files.get('scripts/material-handoff.mjs')).toContain(
        'validateMaterialProvenance',
      );
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
    }
  });

  it('rejects unknown snapshot fields', async () => {
    const { snapshot, file } = await writeSnapshotFile();
    const invalid = { ...snapshot, notes: 'do not ingest' };
    await writeFile(file, `${JSON.stringify(invalid)}\n`);
    await expect(createHostSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'unknown field notes',
    );
    await rm(dirname(file), { recursive: true, force: true });
  });

  it('rejects inconsistent dataset-owned parameter metadata', async () => {
    const { snapshot, file } = await writeSnapshotFile();
    snapshot.datasets[0]!.parameters = [
      { name: 'unknown', label: 'Unknown', valueType: 'string', required: true, minimum: 1 },
    ];
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'HOST_DATASET_DESCRIPTOR_INVALID',
    );
    await rm(dirname(file), { recursive: true, force: true });
  });

  it('requires an explicit sanitized classification for dataset samples', async () => {
    const { snapshot, file } = await writeSnapshotFile();
    snapshot.datasetSamples![0]!.classification = 'raw';
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'classification must be sanitized',
    );
    await rm(dirname(file), { recursive: true, force: true });
  });

  it('creates and guardedly updates only its generated target', async () => {
    const { file } = await writeSnapshotFile();
    const output = await temporaryDirectory('base-screen-host-output');
    try {
      const first = await createHostSkill({ snapshotFile: file, outputParent: output });
      await expect(createHostSkill({ snapshotFile: file, outputParent: output })).rejects.toThrow(
        'Refusing to overwrite',
      );

      const target = first.target;
      const marker = await readJson<{
        generator: string;
        skillName: string;
        snapshotDigest: string;
      }>(join(target, 'generation-manifest.json'));
      expect(marker.generator).toBe('create-base-screen-host-skill');
      expect(marker.skillName).toBe('design-acme-screens');
      expect(marker.snapshotDigest).toMatch(/^[0-9a-f]{64}$/);

      const snapshot = await makeSnapshot();
      snapshot.screenGuidelines = '# Updated rules\n\nUse a warm accent.\n';
      await writeFile(file, `${JSON.stringify(snapshot)}\n`);
      await createHostSkill({ snapshotFile: file, outputParent: output, update: true });
      expect(await readFile(join(target, 'references', 'host.md'), 'utf8')).toContain(
        'warm accent',
      );

      const unmarked = await temporaryDirectory('base-screen-unmarked-output');
      await mkdir(join(unmarked, 'design-acme-screens'));
      await writeFile(join(unmarked, 'design-acme-screens', 'SKILL.md'), 'owned by host');
      await expect(
        createHostSkill({ snapshotFile: file, outputParent: unmarked, update: true }),
      ).rejects.toThrow('unmarked Skill directory');
      await rm(unmarked, { recursive: true, force: true });
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
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
    const { file } = await writeSnapshotFile();
    const output = await temporaryDirectory('base-screen-host-validator');
    try {
      const generated = await createHostSkill({ snapshotFile: file, outputParent: output });
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
        invalidIssues.some(
          (issue: { code: string }) => issue.code === 'HOST_SKILL_MATERIAL_UNKNOWN',
        ),
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
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });

  it('overlays an explicit draft catalog and blocks it in published-only mode', async () => {
    const { file, snapshot } = await writeSnapshotFile();
    const output = await temporaryDirectory('base-screen-host-draft-validator');
    try {
      const generated = await createHostSkill({ snapshotFile: file, outputParent: output });
      const draftMaterial = {
        ...snapshot.materials[0],
        type: 'acme.draft-badge',
        tagName: 'acme-draft-badge',
      };
      const draftCatalog = {
        hostId: 'acme',
        screenDraftId: 'screen-1',
        requestId: 'request-1',
        materials: [draftMaterial],
      };
      const draftFile = join(output, 'draft-material-catalog.json');
      await writeFile(draftFile, `${JSON.stringify(draftCatalog)}\n`);
      const document = await readJson<Record<string, unknown>>(DOCUMENT_FIXTURE);
      const components = document.components as Array<Record<string, unknown>>;
      components[1] = {
        ...components[1],
        type: 'acme.draft-badge',
        dataSource: { type: 'static', value: 'draft' },
      };
      const documentFile = join(output, 'draft-document.json');
      await writeFile(documentFile, `${JSON.stringify(document)}\n`);
      const validator = await import(
        pathToFileURL(join(generated.target, 'scripts', 'validate-screen-document.mjs')).href
      );
      expect(
        await validator.validateScreenDocumentFile(documentFile, {
          draftMaterialCatalogPath: draftFile,
        }),
      ).toEqual([]);
      expect(
        (
          await validator.validateScreenDocumentFile(documentFile, {
            draftMaterialCatalogPath: draftFile,
            publishedOnly: true,
          })
        ).some((issue: { code: string }) => issue.code === 'HOST_SKILL_DRAFT_MATERIAL_PUBLISHED'),
      ).toBe(true);
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });
});
