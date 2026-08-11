import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkHostSkills,
  initHostSkillConfig,
  runSnapshotExporter,
  validateConfig,
  validateContextDirectory,
} from '../skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs';
import { vendorHostSkillKit } from '../skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCREEN_FIXTURE = join(TEST_DIR, 'fixtures', 'host-skill-smoke');
const MATERIAL_FIXTURE = join(TEST_DIR, 'fixtures', 'host-material-skill-smoke');
const CONTEXT_FILES = [
  'host.json',
  'design-guidelines.md',
  'material-authoring.json',
  'material-guidelines.md',
  'components.json',
  'materials.json',
  'resource-types.json',
  'datasets.json',
  'dataset-samples.json',
];

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function makeHost(): Promise<{ root: string; source: string }> {
  const root = await temporaryDirectory('base-screen-adoption-host');
  const source = join(root, 'source-context');
  await mkdir(source, { recursive: true });
  for (const name of CONTEXT_FILES) {
    const sourceRoot =
      name === 'host.json' ||
      name === 'design-guidelines.md' ||
      name === 'materials.json' ||
      name === 'resource-types.json' ||
      name === 'datasets.json' ||
      name === 'dataset-samples.json'
        ? SCREEN_FIXTURE
        : MATERIAL_FIXTURE;
    const sourceFile = join(sourceRoot, name);
    try {
      await cp(sourceFile, join(source, name));
    } catch {
      if (name !== 'dataset-samples.json') throw new Error(`Fixture is missing ${name}`);
    }
  }
  const exporter = `import { mkdir, cp, readdir } from 'node:fs/promises';\nimport { join } from 'node:path';\nconst source = ${JSON.stringify(source)};\nconst output = process.env.BASE_SCREEN_HOST_SKILL_CONTEXT_DIR;\nif (!output) throw new Error('BASE_SCREEN_HOST_SKILL_CONTEXT_DIR is required');\nawait mkdir(output, { recursive: true });\nfor (const name of await readdir(source)) await cp(join(source, name), join(output, name), { recursive: true });\n`;
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'scripts', 'export-context.mjs'), exporter, 'utf8');
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'base-screen-adoption-fixture',
        packageManager: 'npm@10.0.0',
        scripts: { 'export:base-screen-skill-context': 'node scripts/export-context.mjs' },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return { root, source };
}

async function initHost(root: string): Promise<void> {
  await initHostSkillConfig({ root });
}

describe('host Skill adoption workflow', () => {
  it('initializes, checks, syncs, verifies, and detects online catalog drift', async () => {
    const host = await makeHost();
    try {
      await initHost(host.root);
      const skillsRoot = join(host.root, '.agents', 'skills');
      expect(await checkHostSkills({ root: host.root, mode: 'check' })).toMatchObject({
        mode: 'check',
      });
      await expect(stat(join(skillsRoot, 'design-acme-screens'))).rejects.toThrow();

      await checkHostSkills({ root: host.root, mode: 'sync' });
      expect(await checkHostSkills({ root: host.root, mode: 'verify' })).toMatchObject({
        mode: 'verify',
      });

      const materialsFile = join(host.source, 'materials.json');
      const materials = JSON.parse(await readFile(materialsFile, 'utf8')) as Array<
        Record<string, unknown>
      >;
      materials.push({
        ...materials[0],
        type: 'acme.adoption-only',
        tagName: 'acme-adoption-only',
      });
      await writeFile(materialsFile, `${JSON.stringify(materials, null, 2)}\n`, 'utf8');
      await expect(checkHostSkills({ root: host.root, mode: 'verify' })).rejects.toThrow(
        'Generated Skill drift',
      );
      await checkHostSkills({ root: host.root, mode: 'sync' });
      await checkHostSkills({ root: host.root, mode: 'verify' });
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 20_000);

  it('keeps generated targets unchanged when an unmarked target blocks sync', async () => {
    const host = await makeHost();
    try {
      await initHost(host.root);
      const skillsRoot = join(host.root, '.agents', 'skills');
      await mkdir(skillsRoot, { recursive: true });
      await writeFile(join(skillsRoot, 'create-acme-material'), 'unmanaged target', 'utf8');
      await expect(checkHostSkills({ root: host.root, mode: 'sync' })).rejects.toThrow(
        'Generated Skill target is a file',
      );
      await expect(stat(join(skillsRoot, 'design-acme-screens'))).rejects.toThrow();
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  });

  it('keeps both generated targets unchanged when the second target is invalid', async () => {
    const host = await makeHost();
    try {
      await initHost(host.root);
      await checkHostSkills({ root: host.root, mode: 'sync' });
      const screenFile = join(host.root, '.agents', 'skills', 'design-acme-screens', 'SKILL.md');
      const before = await readFile(screenFile, 'utf8');
      await writeFile(
        join(host.root, '.agents', 'skills', 'create-acme-material', 'generation-manifest.json'),
        '{"skillName":"wrong"}\n',
        'utf8',
      );
      await expect(checkHostSkills({ root: host.root, mode: 'sync' })).rejects.toThrow(
        'unmarked Skill directory',
      );
      expect(await readFile(screenFile, 'utf8')).toBe(before);
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  });

  it('rejects invalid config and context entries before generator execution', async () => {
    expect(() => validateConfig({ packageManager: 'node', snapshotScript: 'export' })).toThrow(
      'packageManager must be pnpm, npm, or yarn',
    );
    expect(() => validateConfig({ packageManager: 'npm', snapshotScript: 'bad script' })).toThrow(
      'snapshotScript must be a safe script name',
    );

    const context = await temporaryDirectory('base-screen-context-validation');
    try {
      await writeFile(join(context, 'unknown.txt'), 'nope', 'utf8');
      await expect(validateContextDirectory(context)).rejects.toThrow('unsupported entries');
    } finally {
      await rm(context, { recursive: true, force: true });
    }

    const missing = await temporaryDirectory('base-screen-context-missing');
    try {
      await expect(validateContextDirectory(missing)).rejects.toThrow('missing host.json');
    } finally {
      await rm(missing, { recursive: true, force: true });
    }

    const host = await makeHost();
    try {
      await expect(
        initHostSkillConfig({ root: host.root, snapshotScript: 'missing-exporter' }),
      ).rejects.toThrow('does not define the configured snapshot script');
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  });

  it('rejects oversized snapshots and malformed catalog JSON', async () => {
    const context = await temporaryDirectory('base-screen-context-size');
    try {
      await writeFile(join(context, 'design-guidelines.md'), 'x'.repeat(4 * 1024 * 1024 + 1));
      await expect(validateContextDirectory(context)).rejects.toThrow('exceeds 4194304 bytes');
    } finally {
      await rm(context, { recursive: true, force: true });
    }

    const host = await makeHost();
    try {
      await initHost(host.root);
      await writeFile(join(host.source, 'host.json'), '{malformed\n', 'utf8');
      await expect(checkHostSkills({ root: host.root, mode: 'check' })).rejects.toThrow(
        'host.json is not valid JSON',
      );
      await expect(stat(join(host.root, '.agents', 'skills'))).rejects.toThrow();
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  });

  it('does not accept exporter failures or credential-like snapshots', async () => {
    const host = await makeHost();
    try {
      await initHost(host.root);
      await checkHostSkills({ root: host.root, mode: 'sync' });
      const screenMarker = join(
        host.root,
        '.agents',
        'skills',
        'design-acme-screens',
        'generation-manifest.json',
      );
      const beforeFailure = await readFile(screenMarker, 'utf8');
      await writeFile(
        join(host.root, 'scripts', 'export-context.mjs'),
        "throw new Error('authorization=secret-value');\n",
        'utf8',
      );
      await expect(checkHostSkills({ root: host.root, mode: 'check' })).rejects.toThrow(
        'Snapshot exporter failed',
      );
      expect(await readFile(screenMarker, 'utf8')).toBe(beforeFailure);

      const exporter = `import { mkdir, cp, readdir } from 'node:fs/promises';\nimport { join } from 'node:path';\nconst source = ${JSON.stringify(host.source)};\nconst output = process.env.BASE_SCREEN_HOST_SKILL_CONTEXT_DIR;\nawait mkdir(output, { recursive: true });\nfor (const name of await readdir(source)) await cp(join(source, name), join(output, name), { recursive: true });\n`;
      await writeFile(join(host.root, 'scripts', 'export-context.mjs'), exporter, 'utf8');
      await writeFile(join(host.source, 'material-guidelines.md'), 'apiKey: forbidden\n', 'utf8');
      await expect(checkHostSkills({ root: host.root, mode: 'check' })).rejects.toThrow(
        'credential-like value',
      );
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  });

  it('enforces the exporter deadline', async () => {
    const host = await makeHost();
    const output = await temporaryDirectory('base-screen-timeout-output');
    try {
      await writeFile(
        join(host.root, 'scripts', 'export-context.mjs'),
        'await new Promise((resolve) => setTimeout(resolve, 1000));\n',
        'utf8',
      );
      await expect(
        runSnapshotExporter(
          host.root,
          { packageManager: 'npm', snapshotScript: 'export:base-screen-skill-context' },
          output,
          25,
        ),
      ).rejects.toThrow('timed out');
    } finally {
      await rm(host.root, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });

  it('supplies managed tooling, preserves generated Skills, and rejects manual edits', async () => {
    const host = await temporaryDirectory('base-screen-vendor-host');
    try {
      await writeFile(join(host, 'package.json'), '{"name":"vendor-host"}\n', 'utf8');
      const generated = join(host, '.agents', 'skills', 'design-acme-screens');
      await mkdir(generated, { recursive: true });
      await writeFile(join(generated, 'keep.txt'), 'keep', 'utf8');
      const first = await vendorHostSkillKit({ hostRoot: host });
      expect(first.manifest.generator).toBe('base-screen-host-skill-kit');
      expect(await readFile(join(generated, 'keep.txt'), 'utf8')).toBe('keep');

      const manifestFile = join(host, '.base-screen', 'host-skill-tooling.json');
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as Record<string, unknown>;
      manifest.sourceDigest = 'tampered';
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await expect(vendorHostSkillKit({ hostRoot: host, update: true })).rejects.toThrow(
        'manually changed host Skill tooling manifest',
      );
      await writeFile(manifestFile, `${JSON.stringify(first.manifest, null, 2)}\n`, 'utf8');

      const managedSkill = join(
        host,
        '.agents',
        'skills',
        'manage-base-screen-host-skills',
        'SKILL.md',
      );
      await writeFile(
        managedSkill,
        `${await readFile(managedSkill, 'utf8')}\nmanual edit\n`,
        'utf8',
      );
      await expect(vendorHostSkillKit({ hostRoot: host, update: true })).rejects.toThrow(
        'manually changed managed file',
      );
    } finally {
      await rm(host, { recursive: true, force: true });
    }
  });
});
