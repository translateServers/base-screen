import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_SKILLS_ROOT = resolve(SCRIPT_DIR, '..', '..');
const MANIFEST_RELATIVE = join('.base-screen', 'host-skill-tooling.json');
const MANIFEST_GENERATOR = 'base-screen-host-skill-kit';
const MANAGED_SKILLS = [
  'create-base-screen-host-skill',
  'create-base-screen-host-material-skill',
  'manage-base-screen-host-skills',
];

export async function vendorHostSkillKit({ hostRoot, update = false } = {}) {
  if (typeof hostRoot !== 'string' || hostRoot.length === 0)
    throw new Error('--host must point to a host repository.');
  const targetRoot = resolve(hostRoot);
  if ((await pathState(join(targetRoot, 'package.json'))) !== 'file')
    throw new Error(`Host root must contain package.json: ${targetRoot}`);
  const targetSkillsRoot = join(targetRoot, '.agents', 'skills');
  const targetManifestPath = join(targetRoot, MANIFEST_RELATIVE);
  const sourceFiles = await collectManagedFiles(SOURCE_SKILLS_ROOT);
  const manifest = {
    generator: MANIFEST_GENERATOR,
    sourceRevision: await readGitRevision(SOURCE_SKILLS_ROOT),
    sourceDigest: digestFiles(sourceFiles),
    managedSkills: MANAGED_SKILLS.slice(),
    files: Object.fromEntries(
      [...sourceFiles.entries()].map(([name, content]) => [name, sha256(content)]),
    ),
  };
  await assertSupplyState(targetSkillsRoot, targetManifestPath, update, manifest);
  await installManagedFiles(targetSkillsRoot, targetManifestPath, sourceFiles, manifest, update);
  return { targetRoot, targetSkillsRoot, targetManifestPath, manifest };
}

async function assertSupplyState(skillsRoot, manifestPath, update, nextManifest) {
  const existingManifestState = await pathState(manifestPath);
  const existingManaged = await Promise.all(
    MANAGED_SKILLS.map(async (skillName) => ({
      skillName,
      state: await pathState(join(skillsRoot, skillName)),
    })),
  );
  if (!update) {
    if (
      existingManifestState !== 'missing' ||
      existingManaged.some((item) => item.state !== 'missing')
    )
      throw new Error(
        'Refusing to overwrite existing host Skill tooling; pass --update for a managed kit.',
      );
    return;
  }
  if (
    existingManifestState !== 'file' ||
    existingManaged.some((item) => item.state !== 'directory')
  )
    throw new Error('Refusing to update an incomplete or unmarked host Skill tooling kit.');
  const existingManifest = await readJson(manifestPath);
  validateManifest(existingManifest);
  const currentFiles = await collectManagedFiles(skillsRoot);
  const expectedNames = Object.keys(existingManifest.files).sort();
  const currentNames = [...currentFiles.keys()].sort();
  if (JSON.stringify(expectedNames) !== JSON.stringify(currentNames))
    throw new Error('Refusing to update host Skill tooling with missing or extra files.');
  for (const [name, content] of currentFiles) {
    if (sha256(content) !== existingManifest.files[name])
      throw new Error(`Refusing to update manually changed managed file: ${name}`);
  }
  if (digestFiles(currentFiles) !== existingManifest.sourceDigest)
    throw new Error('Refusing to update a manually changed host Skill tooling manifest.');
  if (!MANAGED_SKILLS.every((skillName) => nextManifest.managedSkills.includes(skillName)))
    throw new Error('Next tooling manifest does not contain the complete managed Skill set.');
}

async function installManagedFiles(
  targetSkillsRoot,
  targetManifestPath,
  sourceFiles,
  manifest,
  update,
) {
  await mkdir(targetSkillsRoot, { recursive: true });
  await mkdir(dirname(targetManifestPath), { recursive: true });
  const stage = await mkdtemp(join(targetSkillsRoot, '.base-screen-host-kit-stage-'));
  const backup = await mkdtemp(join(targetSkillsRoot, '.base-screen-host-kit-backup-'));
  const moved = [];
  const placed = [];
  const oldManifest = await readOptional(targetManifestPath);
  try {
    for (const skillName of MANAGED_SKILLS)
      await mkdir(join(stage, skillName), { recursive: true });
    for (const [name, content] of sourceFiles) {
      const destination = join(stage, name);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    if (update) {
      for (const skillName of MANAGED_SKILLS) {
        await rename(join(targetSkillsRoot, skillName), join(backup, skillName));
        moved.push(skillName);
      }
    }
    for (const skillName of MANAGED_SKILLS) {
      await rename(join(stage, skillName), join(targetSkillsRoot, skillName));
      placed.push(skillName);
    }
    await atomicWrite(targetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    for (const skillName of placed)
      await rm(join(targetSkillsRoot, skillName), { recursive: true, force: true }).catch(() => {});
    for (const skillName of moved)
      await rename(join(backup, skillName), join(targetSkillsRoot, skillName)).catch(() => {});
    if (oldManifest === undefined) await rm(targetManifestPath, { force: true }).catch(() => {});
    else await atomicWrite(targetManifestPath, oldManifest).catch(() => {});
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
  }
}

async function collectManagedFiles(root) {
  const result = new Map();
  for (const skillName of MANAGED_SKILLS) {
    const skillRoot = join(root, skillName);
    const state = await pathState(skillRoot);
    if (state === 'missing') {
      if (root === SOURCE_SKILLS_ROOT) throw new Error(`Source Skill is missing: ${skillRoot}`);
      continue;
    }
    if (state !== 'directory') throw new Error(`Managed Skill must be a directory: ${skillRoot}`);
    await collectDirectoryFiles(skillRoot, root, result);
  }
  return result;
}

async function collectDirectoryFiles(root, relativeRoot, result) {
  const entries = await readdir(root, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) await collectDirectoryFiles(absolute, relativeRoot, result);
    else if (entry.isFile()) {
      const name = relative(relativeRoot, absolute).replaceAll('\\', '/');
      result.set(name, await readFile(absolute));
    } else {
      throw new Error(`Managed Skill contains unsupported entry: ${absolute}`);
    }
  }
}

function validateManifest(manifest) {
  if (
    !isObject(manifest) ||
    manifest.generator !== MANIFEST_GENERATOR ||
    !Array.isArray(manifest.managedSkills) ||
    JSON.stringify(manifest.managedSkills) !== JSON.stringify(MANAGED_SKILLS) ||
    typeof manifest.sourceDigest !== 'string' ||
    typeof manifest.sourceRevision !== 'string' ||
    !isObject(manifest.files)
  ) {
    throw new Error('host-skill-tooling.json is not a valid managed kit manifest.');
  }
}

async function readGitRevision(root) {
  const result = await new Promise((resolveResult) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      shell: false,
      windowsHide: true,
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output = `${output}${String(chunk)}`.slice(-256);
    });
    child.once('error', () => resolveResult(undefined));
    child.once('close', (code) => resolveResult(code === 0 ? output.trim() : undefined));
  });
  return typeof result === 'string' && result.length > 0 ? result : 'working-tree';
}

function digestFiles(files) {
  const content = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}\0${sha256(value)}`)
    .join('\n');
  return sha256(content);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function atomicWrite(file, content) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content);
  try {
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readOptional(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read managed kit manifest: ${error.message}`);
  }
}

async function pathState(value) {
  try {
    const info = await lstat(value);
    return info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other';
  } catch {
    return 'missing';
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(argv) {
  const options = { hostRoot: undefined, update: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--host') {
      options.hostRoot = argv[++index];
      if (options.hostRoot === undefined) throw new Error('--host requires a value.');
    } else if (argument === '--update') options.update = true;
    else if (argument !== '--help') throw new Error(`Unknown argument ${argument}.`);
  }
  if (options.hostRoot === undefined) throw new Error('--host is required.');
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await vendorHostSkillKit({ hostRoot: options.hostRoot, update: options.update });
    console.log(`Supplied ${result.manifest.managedSkills.join(', ')} to ${result.targetRoot}.`);
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

export const vendorInternals = { collectManagedFiles, digestFiles, validateManifest };
