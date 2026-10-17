import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createHostMaterialSkill } from '../../skills/create-base-screen-host-material-skill/scripts/create-host-material-skill.mjs';
import { writeSnapshotFile } from './host-snapshot-fixture';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

describe('host material Skill generator', () => {
  it('validates a canonical snapshot and renders deterministic child Skill files', async () => {
    const { file } = await writeSnapshotFile();
    try {
      const first = await createHostMaterialSkill({ snapshotFile: file, checkOnly: true });
      const second = await createHostMaterialSkill({ snapshotFile: file, checkOnly: true });

      expect(first.skillName).toBe('create-acme-material');
      expect([...first.files.entries()]).toEqual([...second.files.entries()]);
      expect(first.snapshotDigest).toBe(second.snapshotDigest);
      expect(first.files.get('SKILL.md')).toContain(
        'Confirm the current directory is the host Git workspace',
      );
      expect(first.files.get('references/framework.md')).toContain('Native Custom Element route');
      expect(first.files.get('references/workspace.json')).toContain('"policy": "propose"');
      expect(first.files.get('references/host.md')).toContain('Registration policy: `propose`');
      expect(first.files.get('SKILL.md')).toContain('`draft-only` workflow');
      expect(first.files.get('scripts/create-material-candidate.mjs')).toContain('pending-review');
      expect(first.files.get('scripts/material-handoff.mjs')).toContain(
        'validateMaterialCandidate',
      );
      expect(first.files.get('generation-manifest.json')).toContain('snapshotDigest');
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
    }
  });

  it('defaults omitted registration policy to propose and rejects invalid policy', async () => {
    const { snapshot, file } = await writeSnapshotFile();
    const authoring = snapshot.materialAuthoring as Record<string, unknown>;
    const registration = authoring.registration as Record<string, unknown>;
    delete registration.policy;
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    const result = await createHostMaterialSkill({ snapshotFile: file, checkOnly: true });
    expect(result.files.get('references/workspace.json')).toContain('"policy": "propose"');

    registration.policy = 'always';
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostMaterialSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'registration.policy must be propose or apply',
    );
    await rm(dirname(file), { recursive: true, force: true });
  });

  it('accepts optional material provenance without changing the formal manifest contract', async () => {
    const { file } = await writeSnapshotFile({
      materialProvenance: [
        { type: 'acme.text', source: 'code', authoring: 'workspace', editable: true },
      ],
    });
    try {
      const result = await createHostMaterialSkill({ snapshotFile: file, checkOnly: true });
      expect(result.files.get('references/material-provenance.json')).toContain('workspace');
      expect(result.files.get('scripts/create-material-candidate.mjs')).toContain('draft-only');
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
    }
  });

  it('renders guarded material templates as a progressive index and assets', async () => {
    const { file } = await writeSnapshotFile({
      materialTemplates: [
        {
          id: 'kpi-card',
          name: 'KPI Card',
          framework: 'native',
          description: 'Approved KPI scaffold.',
          files: [{ path: 'src/materials/kpi-card.ts', content: 'export const value = 1;' }],
        },
      ],
    });
    try {
      const result = await createHostMaterialSkill({ snapshotFile: file, checkOnly: true });
      expect(result.files.get('references/material-templates.json')).toContain('kpi-card');
      expect(result.files.get('assets/material-templates/kpi-card/src/materials/kpi-card.ts')).toBe(
        'export const value = 1;',
      );
      expect(result.files.get('references/material-mcp.md')).toContain('catalog digest');
      expect(result.files.get('generation-manifest.json')).toContain('catalogDigest');
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
    }
  });

  it('renders the explicit apply policy without weakening the workflow', async () => {
    const { snapshot, file } = await writeSnapshotFile();
    (snapshot.materialAuthoring.registration as Record<string, unknown>).policy = 'apply';
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    const result = await createHostMaterialSkill({ snapshotFile: file, checkOnly: true });
    expect(result.files.get('references/workspace.json')).toContain('"policy": "apply"');
    expect(result.files.get('SKILL.md')).toContain('`apply`');
    expect(result.files.get('SKILL.md')).toContain('restore every registration target');
    await rm(dirname(file), { recursive: true, force: true });
  });

  it('rejects unknown fields, unsafe paths, and credential-like guidelines', async () => {
    const { snapshot, file } = await writeSnapshotFile();
    const authoring = snapshot.materialAuthoring as Record<string, unknown>;
    authoring['unexpected'] = true;
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostMaterialSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'material-authoring.json contains unknown field unexpected',
    );

    delete authoring['unexpected'];
    (authoring.roots as Record<string, unknown>).source = '../outside';
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostMaterialSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'must be a safe workspace-relative path',
    );

    (authoring.roots as Record<string, unknown>).source = 'src/materials';
    snapshot.materialGuidelines = 'apiKey: do-not-ingest';
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostMaterialSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'credential-like value',
    );
    await rm(dirname(file), { recursive: true, force: true });
  });

  it('supports each selected framework while retaining one route per child Skill', async () => {
    for (const framework of ['native', 'react', 'vue'] as const) {
      const { snapshot, file } = await writeSnapshotFile();
      const authoring = snapshot.materialAuthoring as Record<string, unknown>;
      authoring.framework = framework;
      snapshot.components = snapshot.components.map((component) => ({
        ...component,
        framework,
      }));
      await writeFile(file, `${JSON.stringify(snapshot)}\n`);
      const result = await createHostMaterialSkill({ snapshotFile: file, checkOnly: true });
      expect(result.files.get('references/framework.md')).toContain(
        `${framework === 'native' ? 'Native' : framework === 'react' ? 'React' : 'Vue'} ${framework === 'native' ? 'Custom Element' : 'bridge'} route`,
      );
      await rm(dirname(file), { recursive: true, force: true });
    }
  });

  it('requires explicit plugin registration coverage and dataset authority', async () => {
    const { snapshot, file } = await writeSnapshotFile();
    const authoring = snapshot.materialAuthoring as Record<string, unknown>;
    authoring.registration = {
      mode: 'plugin',
      file: 'src/materials/register.ts',
      exportName: 'registerAcmeMaterials',
      pluginManifestFile: 'src/plugins/acme.ts',
    };
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostMaterialSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'allowedFiles does not cover src/plugins/acme.ts',
    );

    authoring.allowedFiles = [
      'src/materials/**',
      'tests/materials/**',
      'src/materials/register.ts',
      'src/plugins/acme.ts',
    ];
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    snapshot.datasets[0]!.parameters = [
      { name: 'wrong', label: 'Wrong', valueType: 'string', required: true, minimum: 1 },
    ];
    await writeFile(file, `${JSON.stringify(snapshot)}\n`);
    await expect(createHostMaterialSkill({ snapshotFile: file, checkOnly: true })).rejects.toThrow(
      'HOST_DATASET_DESCRIPTOR_INVALID',
    );

    await rm(dirname(file), { recursive: true, force: true });
  });

  it('resolves ESM-only host packages from the workspace node_modules', async () => {
    const workspace = await temporaryDirectory('base-screen-material-workspace');
    const packageRoot = join(workspace, 'node_modules', '@base-screen', 'plugin-core');
    await mkdir(join(packageRoot, 'dist'), { recursive: true });
    await writeFile(
      join(packageRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: '@base-screen/plugin-core',
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
      'export const parseBaseScreenMaterialManifest = () => ({ ok: true, value: {}, diagnostics: [] });\n',
    );
    await writeFile(join(workspace, 'package.json'), '{}\n');

    const validator = await import(
      pathToFileURL(
        join(
          TEST_DIR,
          '..',
          '..',
          'skills',
          'create-base-screen-host-material-skill',
          'assets',
          'host-material-skill-template',
          'scripts',
          'validate-material-definition.mjs',
        ),
      ).href
    );
    const entry = await validator.resolveHostPackageEntry(
      '@base-screen/plugin-core',
      pathToFileURL(join(workspace, 'package.json')),
    );
    expect(
      entry.endsWith(join('node_modules', '@base-screen', 'plugin-core', 'dist', 'index.js')),
    ).toBe(true);
    await expect(import(pathToFileURL(entry).href)).resolves.toHaveProperty(
      'parseBaseScreenMaterialManifest',
    );

    await rm(workspace, { recursive: true, force: true });
  });

  it('guards overwrite and validates a generated manifest through public parsers', async () => {
    const { file, snapshot } = await writeSnapshotFile();
    const output = await temporaryDirectory('base-screen-material-output');
    try {
      const generated = await createHostMaterialSkill({ snapshotFile: file, outputParent: output });
      await expect(
        createHostMaterialSkill({ snapshotFile: file, outputParent: output }),
      ).rejects.toThrow('Refusing to overwrite');
      const marker = await readJson<{
        generator: string;
        skillName: string;
        snapshotDigest: string;
      }>(join(generated.target, 'generation-manifest.json'));
      expect(marker.generator).toBe('create-base-screen-host-material-skill');
      expect(marker.skillName).toBe('create-acme-material');
      expect(marker.snapshotDigest).toMatch(/^[0-9a-f]{64}$/);

      const manifest = { ...snapshot.materials[0] } as Record<string, unknown>;
      manifest.type = 'acme.status';
      manifest.tagName = 'acme-status';
      const manifestFile = join(output, 'status.manifest.json');
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
      const validator = await import(
        pathToFileURL(join(generated.target, 'scripts', 'validate-material-definition.mjs')).href
      );
      expect(
        await validator.validateMaterialManifestFile(manifestFile, {
          catalogFile: join(generated.target, 'references', 'materials.json'),
        }),
      ).toEqual([]);

      manifest.type = 'acme.text';
      const duplicateFile = join(output, 'duplicate.manifest.json');
      await writeFile(duplicateFile, `${JSON.stringify(manifest, null, 2)}\n`);
      const duplicateIssues = await validator.validateMaterialManifestFile(duplicateFile, {
        catalogFile: join(generated.target, 'references', 'materials.json'),
      });
      expect(
        duplicateIssues.some(
          (issue: { code: string }) => issue.code === 'HOST_MATERIAL_TYPE_DUPLICATE',
        ),
      ).toBe(true);
      expect(
        await validator.validateMaterialManifestFile(duplicateFile, {
          catalogFile: join(generated.target, 'references', 'materials.json'),
          allowExistingType: 'acme.text',
        }),
      ).toEqual([]);

      const unmarked = await temporaryDirectory('base-screen-material-unmarked');
      await mkdir(join(unmarked, 'create-acme-material'));
      await writeFile(join(unmarked, 'create-acme-material', 'SKILL.md'), 'owned by host');
      await expect(
        createHostMaterialSkill({ snapshotFile: file, outputParent: unmarked, update: true }),
      ).rejects.toThrow('unmarked Skill directory');
      await rm(unmarked, { recursive: true, force: true });
    } finally {
      await rm(dirname(file), { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });
});
