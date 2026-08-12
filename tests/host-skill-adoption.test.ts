import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkRemoteHostSkills,
  doctorHostSkills,
  initHostSkillConfig,
  refreshHostSkills,
  runSnapshotExporter,
  validateConfig,
  verifyHostSkills,
} from '../skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs';
import { canonicalizeSnapshot } from '../skills/manage-base-screen-host-skills/scripts/snapshot-file.mjs';
import {
  vendorHostSkillKit,
  vendorInternals,
} from '../skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_SKILLS_ROOT = join(TEST_DIR, '..', 'skills');
const SCREEN_FIXTURE = join(TEST_DIR, 'fixtures', 'host-skill-smoke');
const MATERIAL_FIXTURE = join(TEST_DIR, 'fixtures', 'host-material-skill-smoke');
const MANAGED_SKILLS = [
  'create-base-screen-host-skill',
  'create-base-screen-host-material-skill',
  'manage-base-screen-host-skills',
];
const SNAPSHOT_SCRIPT = 'export:base-screen-skill-context';

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function makeSnapshot(): Promise<Record<string, unknown>> {
  const [screen, material] = await Promise.all([
    readJson<Record<string, unknown>>(join(SCREEN_FIXTURE, 'materials.json')),
    readJson<Record<string, unknown>>(join(MATERIAL_FIXTURE, 'materials.json')),
  ]);
  const materials = [...(screen as Array<Record<string, unknown>>)];
  for (const item of material as Array<Record<string, unknown>>) {
    if (!materials.some((existing) => existing.type === item.type)) materials.push(item);
  }
  return {
    host: await readJson(join(SCREEN_FIXTURE, 'host.json')),
    screenGuidelines: await readFile(join(SCREEN_FIXTURE, 'design-guidelines.md'), 'utf8'),
    materialGuidelines: await readFile(join(MATERIAL_FIXTURE, 'material-guidelines.md'), 'utf8'),
    materialAuthoring: await readJson(join(MATERIAL_FIXTURE, 'material-authoring.json')),
    components: await readJson(join(MATERIAL_FIXTURE, 'components.json')),
    materials,
    resourceTypes: await readJson(join(SCREEN_FIXTURE, 'resource-types.json')),
    datasets: await readJson(join(SCREEN_FIXTURE, 'datasets.json')),
    datasetSamples: await readJson(join(SCREEN_FIXTURE, 'dataset-samples.json')),
  };
}

async function makeHost(overrides: Record<string, unknown> = {}): Promise<{
  root: string;
  snapshotFile: string;
}> {
  const root = await temporaryDirectory('base-screen-adoption-host');
  const snapshotFile = join(root, 'source-snapshot.json');
  await writeFile(snapshotFile, `${JSON.stringify({ ...(await makeSnapshot()), ...overrides })}\n`);
  const exporter = `import { readFile, mkdir, writeFile } from 'node:fs/promises';\nimport { dirname } from 'node:path';\nconst source = ${JSON.stringify(snapshotFile)};\nconst output = process.env.BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE;\nif (!output) throw new Error('BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE is required');\nawait mkdir(dirname(output), { recursive: true });\nawait writeFile(output, await readFile(source));\n`;
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'scripts', 'export-context.mjs'), exporter, 'utf8');
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'base-screen-adoption-fixture',
        packageManager: 'npm@10.0.0',
        scripts: { [SNAPSHOT_SCRIPT]: 'node scripts/export-context.mjs' },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return { root, snapshotFile };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function collectFiles(root: string, base: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory)) {
      const absolute = join(directory, entry);
      const info = await stat(absolute);
      if (info.isDirectory()) await visit(absolute);
      else
        result.set(
          relative(base, absolute).replaceAll('\\', '/'),
          await readFile(absolute, 'utf8'),
        );
    }
  }
  await visit(root);
  return result;
}

describe('host Skill adoption toolkit', () => {
  it('sets up a host idempotently: toolkit under .base-screen/tooling, one command, two Skills', async () => {
    const host = await makeHost();
    try {
      const first = await vendorHostSkillKit({ hostRoot: host.root });
      expect(first.configCreated).toBe(true);
      expect(first.manifest.layout).toBe('tooling');

      const config = await readJson<{ packageManager: string; snapshotScript: string }>(
        join(host.root, '.base-screen', 'host-skills.json'),
      );
      expect(config).toEqual({ packageManager: 'npm', snapshotScript: SNAPSHOT_SCRIPT });

      const toolkitPath = join(
        host.root,
        '.base-screen',
        'tooling',
        'base-screen-host-skills',
        'manage-base-screen-host-skills',
        'SKILL.md',
      );
      expect(await stat(toolkitPath)).toBeTruthy();
      expect(await stat(join(host.root, '.agents', 'skills', 'design-acme-screens'))).toBeTruthy();
      expect(await stat(join(host.root, '.agents', 'skills', 'create-acme-material'))).toBeTruthy();
      await expect(
        stat(join(host.root, '.agents', 'skills', 'manage-base-screen-host-skills')),
      ).rejects.toThrow();

      const skillsEntries = await readdir(join(host.root, '.agents', 'skills'));
      expect(skillsEntries.sort()).toEqual(['create-acme-material', 'design-acme-screens']);

      const packageJson = await readJson<{ scripts: Record<string, string> }>(
        join(host.root, 'package.json'),
      );
      expect(packageJson.scripts['base-screen:skills']).toContain(
        '.base-screen/tooling/base-screen-host-skills',
      );

      const screenManifest = await readJson<{ snapshotDigest: string }>(
        join(host.root, '.agents', 'skills', 'design-acme-screens', 'generation-manifest.json'),
      );
      const materialManifest = await readJson<{ snapshotDigest: string }>(
        join(host.root, '.agents', 'skills', 'create-acme-material', 'generation-manifest.json'),
      );
      expect(screenManifest.snapshotDigest).toBe(materialManifest.snapshotDigest);

      const committed = await readFile(
        join(host.root, '.base-screen', 'host-snapshot.json'),
        'utf8',
      );
      expect(sha256(committed)).toBe(screenManifest.snapshotDigest);

      const verify = await verifyHostSkills({ root: host.root });
      expect(verify.mode).toBe('verify');
      expect(verify.snapshotDigest).toBe(screenManifest.snapshotDigest);

      const second = await vendorHostSkillKit({ hostRoot: host.root });
      expect(second.configCreated).toBe(false);
      await verifyHostSkills({ root: host.root });
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('removes every created artifact when first setup cannot sync', async () => {
    const host = await makeHost();
    try {
      await writeFile(
        join(host.root, 'scripts', 'export-context.mjs'),
        "throw new Error('service unavailable');\n",
        'utf8',
      );
      const packageBefore = await readFile(join(host.root, 'package.json'), 'utf8');
      await expect(vendorHostSkillKit({ hostRoot: host.root })).rejects.toThrow(
        'Snapshot exporter failed',
      );
      expect(await readFile(join(host.root, 'package.json'), 'utf8')).toBe(packageBefore);
      await expect(stat(join(host.root, '.base-screen', 'host-skills.json'))).rejects.toThrow();
      await expect(stat(join(host.root, '.base-screen', 'host-snapshot.json'))).rejects.toThrow();
      await expect(
        stat(join(host.root, '.base-screen', 'host-skill-tooling.json')),
      ).rejects.toThrow();
      await expect(
        stat(join(host.root, '.base-screen', 'tooling', 'base-screen-host-skills')),
      ).rejects.toThrow();
      await expect(
        stat(join(host.root, '.agents', 'skills', 'design-acme-screens')),
      ).rejects.toThrow();
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps setup arguments unambiguous and supports explicit first-setup config', async () => {
    expect(() => vendorInternals.parseArgs(['--host', 'host', '--bogus'])).toThrow(
      'Unknown argument',
    );
    const host = await makeHost();
    try {
      const packageFile = join(host.root, 'package.json');
      const packageJson = await readJson<{ scripts: Record<string, string> }>(packageFile);
      packageJson.scripts['export:custom-context'] = packageJson.scripts[SNAPSHOT_SCRIPT];
      delete packageJson.scripts[SNAPSHOT_SCRIPT];
      await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

      await vendorHostSkillKit({
        hostRoot: host.root,
        packageManager: 'npm',
        snapshotScript: 'export:custom-context',
      });
      const config = await readJson<{ snapshotScript: string }>(
        join(host.root, '.base-screen', 'host-skills.json'),
      );
      expect(config.snapshotScript).toBe('export:custom-context');
      await expect(
        vendorHostSkillKit({
          hostRoot: host.root,
          snapshotScript: 'export:custom-context',
        }),
      ).rejects.toThrow('only apply when host-skills.json is absent');
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('runs default refresh, offline verify, write-free check-remote, and doctor', async () => {
    const host = await makeHost();
    try {
      await vendorHostSkillKit({ hostRoot: host.root });

      const firstCheck = await checkRemoteHostSkills({ root: host.root });
      expect(firstCheck.changed).toBe(false);

      const snapshotFile = host.snapshotFile;
      const materials = await readJson<Array<Record<string, unknown>>>(snapshotFile).then(
        (snapshot) => snapshot.materials,
      );
      materials.push({
        ...materials[0],
        type: 'acme.adoption-only',
        tagName: 'acme-adoption-only',
      });
      await writeFile(
        snapshotFile,
        `${JSON.stringify({ ...(await readJson<Record<string, unknown>>(snapshotFile)), materials })}\n`,
      );

      const changedCheck = await checkRemoteHostSkills({ root: host.root });
      expect(changedCheck.changed).toBe(true);
      const committed = await readFile(
        join(host.root, '.base-screen', 'host-snapshot.json'),
        'utf8',
      );
      const materialsJson = await readJson<{ materials: Array<Record<string, unknown>> }>(
        join(host.root, '.base-screen', 'host-snapshot.json'),
      );
      expect(materialsJson.materials.some((item) => item.type === 'acme.adoption-only')).toBe(
        false,
      );
      await expect(refreshHostSkills({ root: host.root })).resolves.toMatchObject({
        mode: 'refresh',
      });
      await verifyHostSkills({ root: host.root });
      expect(
        (
          await readJson<{ materials: Array<Record<string, unknown>> }>(
            join(host.root, '.base-screen', 'host-snapshot.json'),
          )
        ).materials.some((item) => item.type === 'acme.adoption-only'),
      ).toBe(true);

      const doctor = await doctorHostSkills({ root: host.root });
      expect(doctor.mode).toBe('doctor');
      for (const check of doctor.checks) expect(check.ok).toBe(true);
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('doctor reports a missing configured credential and missing config', async () => {
    const host = await makeHost();
    try {
      await vendorHostSkillKit({ hostRoot: host.root });
      await writeFile(
        join(host.root, '.base-screen', 'host-skills.json'),
        `${JSON.stringify(
          {
            packageManager: 'npm',
            snapshotScript: SNAPSHOT_SCRIPT,
            credentialEnvVars: ['XJ_TOKEN'],
          },
          null,
          2,
        )}\n`,
      );
      const doctor = await doctorHostSkills({ root: host.root });
      const credential = doctor.checks.find((check) => check.name === 'credential:XJ_TOKEN');
      expect(credential).toBeTruthy();
      expect(credential!.ok).toBe(false);
      expect(credential!.detail).toContain('not set or empty');

      await rm(join(host.root, '.base-screen', 'host-skills.json'), { force: true });
      const degraded = await doctorHostSkills({ root: host.root });
      expect(degraded.checks.find((check) => check.name === 'config')!.ok).toBe(false);
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps the committed snapshot and Skills unchanged when a refresh fails', async () => {
    const host = await makeHost();
    try {
      await vendorHostSkillKit({ hostRoot: host.root });
      const snapshotPath = join(host.root, '.base-screen', 'host-snapshot.json');
      const snapshotBefore = await readFile(snapshotPath, 'utf8');
      const screenMarker = join(
        host.root,
        '.agents',
        'skills',
        'design-acme-screens',
        'generation-manifest.json',
      );
      const screenBefore = await readFile(screenMarker, 'utf8');

      await writeFile(
        join(host.root, 'scripts', 'export-context.mjs'),
        "throw new Error('authorization=secret-value');\n",
        'utf8',
      );
      await expect(refreshHostSkills({ root: host.root })).rejects.toThrow(
        'Snapshot exporter failed',
      );
      expect(await readFile(snapshotPath, 'utf8')).toBe(snapshotBefore);
      expect(await readFile(screenMarker, 'utf8')).toBe(screenBefore);
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('restores the canonical snapshot when a generated target blocks refresh', async () => {
    const host = await makeHost();
    try {
      await vendorHostSkillKit({ hostRoot: host.root });
      const snapshotPath = join(host.root, '.base-screen', 'host-snapshot.json');
      const snapshotBefore = await readFile(snapshotPath, 'utf8');
      const skillsRoot = join(host.root, '.agents', 'skills');
      const screenFile = join(skillsRoot, 'design-acme-screens', 'SKILL.md');
      const screenBefore = await readFile(screenFile, 'utf8');
      await rm(join(skillsRoot, 'create-acme-material'), { recursive: true, force: true });
      await mkdir(join(skillsRoot, 'create-acme-material'));
      await writeFile(join(skillsRoot, 'create-acme-material', 'SKILL.md'), 'unmanaged', 'utf8');

      await expect(refreshHostSkills({ root: host.root })).rejects.toThrow(
        'Refusing to update unmarked Skill directory',
      );
      expect(await readFile(snapshotPath, 'utf8')).toBe(snapshotBefore);
      expect(await readFile(screenFile, 'utf8')).toBe(screenBefore);
      await expect(verifyHostSkills({ root: host.root })).rejects.toThrow(
        'Refusing to update unmarked Skill directory',
      );
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('verify fails on drift and on snapshot digest mismatch without writing', async () => {
    const host = await makeHost();
    try {
      await vendorHostSkillKit({ hostRoot: host.root });
      const skillsRoot = join(host.root, '.agents', 'skills');

      await writeFile(
        join(skillsRoot, 'design-acme-screens', 'SKILL.md'),
        `${await readFile(join(skillsRoot, 'design-acme-screens', 'SKILL.md'), 'utf8')}\nmanual\n`,
        'utf8',
      );
      await expect(verifyHostSkills({ root: host.root })).rejects.toThrow('Generated Skill drift');

      const screenFile = join(skillsRoot, 'design-acme-screens', 'SKILL.md');
      const restored = (await readFile(screenFile, 'utf8')).replace('\nmanual\n', '');
      await writeFile(screenFile, restored, 'utf8');
      await writeFile(
        join(skillsRoot, 'design-acme-screens', 'generation-manifest.json'),
        `${JSON.stringify(
          {
            ...(await readJson<Record<string, unknown>>(
              join(skillsRoot, 'design-acme-screens', 'generation-manifest.json'),
            )),
            snapshotDigest: 'tampered',
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      await expect(verifyHostSkills({ root: host.root })).rejects.toThrow(
        'snapshot digest mismatch',
      );
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects invalid config and snapshot values before generation', async () => {
    expect(() => validateConfig({ packageManager: 'node', snapshotScript: 'export' })).toThrow(
      'packageManager must be pnpm, npm, or yarn',
    );
    expect(() => validateConfig({ packageManager: 'npm', snapshotScript: 'bad script' })).toThrow(
      'snapshotScript must be a safe script name',
    );
    expect(() =>
      validateConfig({
        packageManager: 'npm',
        snapshotScript: 'export',
        credentialEnvVars: ['BAD NAME'],
      }),
    ).toThrow('credentialEnvVars');

    const base = await makeSnapshot();
    expect(() => canonicalizeSnapshot({ ...base, unexpected: true })).toThrow(
      'unknown field unexpected',
    );
    const missing = { ...base } as Record<string, unknown>;
    delete missing.datasets;
    expect(() => canonicalizeSnapshot(missing)).toThrow('missing datasets');
    expect(() => canonicalizeSnapshot({ ...base, screenGuidelines: 'apiKey: secret' })).toThrow(
      'credential-like value',
    );
    expect(() =>
      canonicalizeSnapshot({ ...base, materialGuidelines: 'https://cdn.example.com/mod.mjs' }),
    ).toThrow('remote URL or module address');
    expect(() =>
      canonicalizeSnapshot({ ...base, screenGuidelines: '<script>alert(1)</script>' }),
    ).toThrow('executable content');
    expect(() =>
      canonicalizeSnapshot({ ...base, host: { ...(base.host as object), token: 'x' } }),
    ).toThrow('field token');

    const host = await makeHost();
    try {
      await expect(
        initHostSkillConfig({ root: host.root, snapshotScript: 'missing-exporter' }),
      ).rejects.toThrow('does not define the configured snapshot script');
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  });

  it('canonicalizes arrays by stable identity with deterministic text and digest', async () => {
    const snapshot = await makeSnapshot();
    const reversed = {
      ...snapshot,
      materials: [...(snapshot.materials as Array<Record<string, unknown>>)].reverse(),
      resourceTypes: [...(snapshot.resourceTypes as Array<Record<string, unknown>>)].reverse(),
      datasets: [...(snapshot.datasets as Array<Record<string, unknown>>)].reverse(),
    };
    const first = canonicalizeSnapshot(snapshot);
    const second = canonicalizeSnapshot(reversed);
    expect(first.text).toBe(second.text);
    expect(first.digest).toBe(second.digest);
    expect(first.canonical.materials.map((item: { type: string }) => item.type)).toEqual([
      'acme.chart',
      'acme.text',
    ]);
    expect(first.canonical.datasets.map((item: { resourceId: string }) => item.resourceId)).toEqual(
      ['daily-sales'],
    );
  });

  it('enforces the exporter deadline', async () => {
    const host = await makeHost();
    const output = join(await temporaryDirectory('base-screen-timeout-output'), 'snapshot.json');
    try {
      await writeFile(
        join(host.root, 'scripts', 'export-context.mjs'),
        'await new Promise((resolve) => setTimeout(resolve, 1000));\n',
        'utf8',
      );
      await expect(
        runSnapshotExporter(
          host.root,
          { packageManager: 'npm', snapshotScript: SNAPSHOT_SCRIPT },
          output,
          25,
        ),
      ).rejects.toThrow('timed out');
    } finally {
      await rm(host.root, { recursive: true, force: true });
      await rm(dirname(output), { recursive: true, force: true });
    }
  });

  it('migrates a matching legacy layout and refuses modified legacy copies', async () => {
    const host = await makeHost();
    try {
      await writeLegacyLayout(host.root);

      const result = await vendorHostSkillKit({ hostRoot: host.root });
      expect(result.manifest.layout).toBe('tooling');
      await expect(
        stat(join(host.root, '.base-screen', 'host-skill-kit-manifest.json')),
      ).rejects.toThrow();
      for (const skillName of MANAGED_SKILLS) {
        await expect(stat(join(host.root, '.agents', 'skills', skillName))).rejects.toThrow();
      }
      expect(
        await stat(
          join(
            host.root,
            '.base-screen',
            'tooling',
            'base-screen-host-skills',
            'manage-base-screen-host-skills',
            'SKILL.md',
          ),
        ),
      ).toBeTruthy();
      await verifyHostSkills({ root: host.root });
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('refuses to migrate a legacy layout with modified managed files', async () => {
    const host = await makeHost();
    try {
      await writeLegacyLayout(host.root);
      const legacySkill = join(
        host.root,
        '.agents',
        'skills',
        'manage-base-screen-host-skills',
        'SKILL.md',
      );
      await writeFile(legacySkill, `${await readFile(legacySkill, 'utf8')}\nmanual edit\n`, 'utf8');
      await expect(vendorHostSkillKit({ hostRoot: host.root })).rejects.toThrow(
        'Legacy layout is not fully managed',
      );
      await expect(
        stat(join(host.root, '.base-screen', 'host-skill-tooling.json')),
      ).rejects.toThrow();
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('refuses managed updates with manual edits, an unmanaged legacy copy, or a script conflict', async () => {
    const host = await makeHost();
    try {
      await vendorHostSkillKit({ hostRoot: host.root });
      const managedSkill = join(
        host.root,
        '.base-screen',
        'tooling',
        'base-screen-host-skills',
        'manage-base-screen-host-skills',
        'SKILL.md',
      );
      await writeFile(
        managedSkill,
        `${await readFile(managedSkill, 'utf8')}\nmanual edit\n`,
        'utf8',
      );
      await expect(vendorHostSkillKit({ hostRoot: host.root })).rejects.toThrow(
        'manually changed managed file',
      );
      await writeFile(
        managedSkill,
        (await readFile(managedSkill, 'utf8')).replace('\nmanual edit\n', ''),
        'utf8',
      );

      await mkdir(join(host.root, '.agents', 'skills', 'manage-base-screen-host-skills'));
      await writeFile(
        join(host.root, '.agents', 'skills', 'manage-base-screen-host-skills', 'SKILL.md'),
        'owned by host',
        'utf8',
      );
      await expect(vendorHostSkillKit({ hostRoot: host.root })).rejects.toThrow(
        'Legacy Skill copies under .agents/skills are not fully managed',
      );
      await rm(join(host.root, '.agents', 'skills', 'manage-base-screen-host-skills'), {
        recursive: true,
        force: true,
      });

      const packageFile = join(host.root, 'package.json');
      const packageJson = await readJson<{ scripts: Record<string, string> }>(packageFile);
      packageJson.scripts['base-screen:skills'] = 'echo conflicting';
      await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
      await expect(vendorHostSkillKit({ hostRoot: host.root })).rejects.toThrow('conflicting');
    } finally {
      await rm(host.root, { recursive: true, force: true });
    }
  }, 60_000);
});

async function writeLegacyLayout(hostRoot: string): Promise<void> {
  const skillsRoot = join(hostRoot, '.agents', 'skills');
  for (const skillName of MANAGED_SKILLS) {
    await cp(join(REPO_SKILLS_ROOT, skillName), join(skillsRoot, skillName), {
      recursive: true,
    });
  }
  await cp(join(REPO_SKILLS_ROOT, 'shared'), join(skillsRoot, 'shared'), { recursive: true });
  await mkdir(join(skillsRoot, 'manage-base-screen-host-skills', 'scripts'), { recursive: true });
  await cp(
    join(REPO_SKILLS_ROOT, 'manage-base-screen-host-skills', 'scripts', 'snapshot-file.mjs'),
    join(skillsRoot, 'manage-base-screen-host-skills', 'scripts', 'snapshot-file.mjs'),
  );
  const files = new Map<string, string>();
  for (const skillName of MANAGED_SKILLS) {
    const collected = await collectFiles(join(skillsRoot, skillName), skillsRoot);
    for (const [name, content] of collected) files.set(name, sha256(content));
  }
  const shared = await collectFiles(join(skillsRoot, 'shared'), skillsRoot);
  for (const [name, content] of shared) files.set(`shared/${name}`, sha256(content));
  files.set(
    'manage-base-screen-host-skills/scripts/snapshot-file.mjs',
    sha256(
      await readFile(
        join(skillsRoot, 'manage-base-screen-host-skills', 'scripts', 'snapshot-file.mjs'),
        'utf8',
      ),
    ),
  );
  const sourceDigest = sha256(
    [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, digest]) => `${name}\0${digest}`)
      .join('\n'),
  );
  await mkdir(join(hostRoot, '.base-screen'), { recursive: true });
  await writeFile(
    join(hostRoot, '.base-screen', 'host-skill-kit-manifest.json'),
    `${JSON.stringify(
      { generator: 'base-screen-host-skill-kit', files: Object.fromEntries(files), sourceDigest },
      null,
      2,
    )}\n`,
  );
}
