import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_SKILLS_ROOT = join(FIXTURES_DIR, '..', '..', 'skills');
const SCREEN_FIXTURE = join(FIXTURES_DIR, 'legacy-host-skill-smoke');
const MATERIAL_FIXTURE = join(FIXTURES_DIR, 'legacy-host-material-skill-smoke');
export const MANAGED_SKILLS = [
  'create-base-screen-host-skill',
  'create-base-screen-host-material-skill',
  'manage-base-screen-host-skills',
];
export const SNAPSHOT_SCRIPT = 'export:base-screen-skill-context';

export async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

export async function makeSnapshot(): Promise<Record<string, unknown>> {
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

export async function makeHost(overrides: Record<string, unknown> = {}): Promise<{
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

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function digestManifestFileHashes(files: Record<string, string>): string {
  return sha256(
    Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, digest]) => `${name}\0${digest}`)
      .join('\n'),
  );
}

export async function collectFiles(root: string, base: string): Promise<Map<string, string>> {
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

export async function writeLegacyLayout(
  hostRoot: string,
  { manifestName = 'host-skill-kit-manifest.json' }: { manifestName?: string } = {},
): Promise<void> {
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
  for (const [name, content] of shared) files.set(name, sha256(content));
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
    join(hostRoot, '.base-screen', manifestName),
    `${JSON.stringify(
      // A real old host writes no `layout` field; only the new managed kit carries
      // `layout: "tooling"`.
      { generator: 'base-screen-host-skill-kit', files: Object.fromEntries(files), sourceDigest },
      null,
      2,
    )}\n`,
  );
}

export async function writeLegacyBusinessSkills(hostRoot: string): Promise<void> {
  const skillsRoot = join(hostRoot, '.agents', 'skills');
  for (const skill of [
    {
      name: 'design-acme-screens',
      generator: 'create-base-screen-host-skill',
      inputs: { 'host.json': sha256('host'), 'design-guidelines.md': sha256('guidelines') },
    },
    {
      name: 'create-acme-material',
      generator: 'create-base-screen-host-material-skill',
      inputs: { 'material-authoring.json': sha256('authoring') },
    },
  ]) {
    await mkdir(join(skillsRoot, skill.name), { recursive: true });
    await writeFile(
      join(skillsRoot, skill.name, 'generation-manifest.json'),
      `${JSON.stringify(
        { generator: skill.generator, hostId: 'acme', skillName: skill.name, inputs: skill.inputs },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
}
