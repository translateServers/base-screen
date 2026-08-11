import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createHostMaterialSkill } from '../skills/create-base-screen-host-material-skill/scripts/create-host-material-skill.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const BUNDLE_FIXTURE = join(TEST_DIR, 'fixtures', 'host-material-skill-smoke');

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function copyBundle(): Promise<string> {
  const bundle = await temporaryDirectory('base-screen-material-bundle');
  await cp(BUNDLE_FIXTURE, bundle, { recursive: true });
  return bundle;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

describe('host material Skill generator', () => {
  it('validates a bundle and renders deterministic child Skill files', async () => {
    const bundle = await copyBundle();
    const first = await createHostMaterialSkill({ inputDir: bundle, checkOnly: true });
    const second = await createHostMaterialSkill({ inputDir: bundle, checkOnly: true });

    expect(first.skillName).toBe('create-acme-material');
    expect([...first.files.entries()]).toEqual([...second.files.entries()]);
    expect(first.files.get('SKILL.md')).toContain(
      'Confirm the current directory is the host Git workspace',
    );
    expect(first.files.get('references/framework.md')).toContain('Native Custom Element route');
    expect(first.files.get('generation-manifest.json')).toContain(
      'create-base-screen-host-material-skill',
    );

    await rm(bundle, { recursive: true, force: true });
  });

  it('rejects unknown fields, unsafe paths, and credential-like guidelines', async () => {
    const bundle = await copyBundle();
    const authoringFile = join(bundle, 'material-authoring.json');
    const authoring = await readJson<Record<string, unknown>>(authoringFile);
    authoring['unexpected'] = true;
    await writeFile(authoringFile, `${JSON.stringify(authoring, null, 2)}\n`);
    await expect(createHostMaterialSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'material-authoring.json contains unknown field unexpected',
    );

    delete authoring['unexpected'];
    (authoring.roots as Record<string, unknown>).source = '../outside';
    await writeFile(authoringFile, `${JSON.stringify(authoring, null, 2)}\n`);
    await expect(createHostMaterialSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'must be a safe workspace-relative path',
    );

    (authoring.roots as Record<string, unknown>).source = 'src/materials';
    await writeFile(authoringFile, `${JSON.stringify(authoring, null, 2)}\n`);
    await writeFile(join(bundle, 'material-guidelines.md'), 'apiKey: do-not-ingest');
    await expect(createHostMaterialSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'credential-like value',
    );
    await rm(bundle, { recursive: true, force: true });
  });

  it('supports each selected framework while retaining one route per child Skill', async () => {
    for (const framework of ['native', 'react', 'vue'] as const) {
      const bundle = await copyBundle();
      const file = join(bundle, 'material-authoring.json');
      const authoring = await readJson<Record<string, unknown>>(file);
      authoring.framework = framework;
      await writeFile(file, `${JSON.stringify(authoring, null, 2)}\n`);
      const componentsFile = join(bundle, 'components.json');
      const components = await readJson<Array<Record<string, unknown>>>(componentsFile);
      components[0]!.framework = framework;
      await writeFile(componentsFile, `${JSON.stringify(components, null, 2)}\n`);
      const result = await createHostMaterialSkill({ inputDir: bundle, checkOnly: true });
      expect(result.files.get('references/framework.md')).toContain(
        `${framework === 'native' ? 'Native' : framework === 'react' ? 'React' : 'Vue'} ${framework === 'native' ? 'Custom Element' : 'bridge'} route`,
      );
      await rm(bundle, { recursive: true, force: true });
    }
  });

  it('requires explicit plugin registration coverage and dataset authority', async () => {
    const bundle = await copyBundle();
    const authoringFile = join(bundle, 'material-authoring.json');
    const authoring = await readJson<Record<string, unknown>>(authoringFile);
    authoring.registration = {
      mode: 'plugin',
      file: 'src/materials/register.ts',
      exportName: 'registerAcmeMaterials',
      pluginManifestFile: 'src/plugins/acme.ts',
    };
    await writeFile(authoringFile, `${JSON.stringify(authoring, null, 2)}\n`);
    await expect(createHostMaterialSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'allowedFiles does not cover src/plugins/acme.ts',
    );

    authoring.allowedFiles = [
      'src/materials/**',
      'tests/materials/**',
      'src/materials/register.ts',
      'src/plugins/acme.ts',
    ];
    await writeFile(authoringFile, `${JSON.stringify(authoring, null, 2)}\n`);
    const datasetsFile = join(bundle, 'datasets.json');
    const datasets = await readJson<Array<Record<string, unknown>>>(datasetsFile);
    datasets[0]!.parameters = [{ name: 'wrong', label: 'Wrong', editor: 'text' }];
    await writeFile(datasetsFile, `${JSON.stringify(datasets, null, 2)}\n`);
    await expect(createHostMaterialSkill({ inputDir: bundle, checkOnly: true })).rejects.toThrow(
      'parameters must match resource type metrics.configSchema.properties exactly',
    );

    await rm(bundle, { recursive: true, force: true });
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
    const bundle = await copyBundle();
    const output = await temporaryDirectory('base-screen-material-output');
    const generated = await createHostMaterialSkill({ inputDir: bundle, outputParent: output });
    await expect(
      createHostMaterialSkill({ inputDir: bundle, outputParent: output }),
    ).rejects.toThrow('Refusing to overwrite');
    const marker = await readJson<{ generator: string; skillName: string }>(
      join(generated.target, 'generation-manifest.json'),
    );
    expect(marker.generator).toBe('create-base-screen-host-material-skill');
    expect(marker.skillName).toBe('create-acme-material');

    const manifests = await readJson<Array<Record<string, unknown>>>(
      join(bundle, 'materials.json'),
    );
    const manifest = { ...manifests[0] } as Record<string, unknown>;
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
      createHostMaterialSkill({ inputDir: bundle, outputParent: unmarked, update: true }),
    ).rejects.toThrow('unmarked Skill directory');

    await rm(bundle, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
    await rm(unmarked, { recursive: true, force: true });
  });
});
