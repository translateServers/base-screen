import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initHostSkillConfig, refreshHostSkills } from './manage-host-skills.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_SKILLS_ROOT = resolve(SCRIPT_DIR, '..', '..');
const MANIFEST_RELATIVE = join('.base-screen', 'host-skill-tooling.json');
const TOOLING_RELATIVE = join('.base-screen', 'tooling', 'base-screen-host-skills');
const CONFIG_RELATIVE = join('.base-screen', 'host-skills.json');
const MANIFEST_GENERATOR = 'base-screen-host-skill-kit';
const LEGACY_MANIFEST_RELATIVE = join('.base-screen', 'host-skill-kit-manifest.json');
const HOST_SCRIPT_NAME = 'base-screen:skills';
const HOST_SCRIPT_VALUE =
  'node .base-screen/tooling/base-screen-host-skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs';
const MANAGED_SKILLS = [
  'create-base-screen-host-skill',
  'create-base-screen-host-material-skill',
  'manage-base-screen-host-skills',
];
const MANAGED_AUXILIARY = ['shared/material-handoff.mjs'];

export async function vendorHostSkillKit({ hostRoot, packageManager, snapshotScript } = {}) {
  if (typeof hostRoot !== 'string' || hostRoot.length === 0)
    throw new Error('--host must point to a host repository.');
  const targetRoot = resolve(hostRoot);
  if ((await pathState(join(targetRoot, 'package.json'))) !== 'file')
    throw new Error(`Host root must contain package.json: ${targetRoot}`);
  const targetToolingRoot = join(targetRoot, TOOLING_RELATIVE);
  const targetManifestPath = join(targetRoot, MANIFEST_RELATIVE);
  const legacyManifestPath = join(targetRoot, LEGACY_MANIFEST_RELATIVE);
  const targetConfigPath = join(targetRoot, CONFIG_RELATIVE);
  const packageFile = join(targetRoot, 'package.json');

  const sourceFiles = await collectManagedFiles(SOURCE_SKILLS_ROOT);
  const manifest = {
    generator: MANIFEST_GENERATOR,
    layout: 'tooling',
    sourceRevision: await readGitRevision(SOURCE_SKILLS_ROOT),
    sourceDigest: digestFiles(sourceFiles),
    managedSkills: MANAGED_SKILLS.slice(),
    files: Object.fromEntries(
      [...sourceFiles.entries()].map(([name, content]) => [name, sha256(content)]),
    ),
  };

  // Preflight (no mutation).
  const manifestState = await pathState(targetManifestPath);
  const existingManifest =
    manifestState === 'file' ? await readJson(targetManifestPath) : undefined;
  // A real old host keeps its old kit manifest at .base-screen/host-skill-tooling.json without the
  // `layout: "tooling"` field. Treat that file as the legacy manifest instead of the target one.
  const isCurrentLayout = existingManifest !== undefined && existingManifest.layout === 'tooling';
  const legacyManifestState = await pathState(legacyManifestPath);
  if (legacyManifestState === 'file' && isCurrentLayout)
    throw new Error(
      'Both host-skill-tooling.json and host-skill-kit-manifest.json exist; remove the obsolete legacy manifest, then re-run.',
    );
  const isUpdate = isCurrentLayout;
  const legacySources = [];
  if (legacyManifestState === 'file') legacySources.push(legacyManifestPath);
  if (manifestState === 'file' && !isCurrentLayout) legacySources.push(targetManifestPath);
  if (legacySources.length > 1)
    throw new Error('Multiple legacy host Skill manifests exist; keep only one, then re-run.');
  const replacingToolingManifest = legacySources.some((item) => item === targetManifestPath);
  await assertSupplyState(
    targetToolingRoot,
    targetManifestPath,
    isUpdate,
    manifest,
    replacingToolingManifest,
  );
  const legacy =
    legacySources.length === 1
      ? await prepareLegacyMigration(
          targetRoot,
          legacySources[0],
          legacySources[0] === targetManifestPath,
        )
      : await prepareLegacyCleanup(targetRoot, targetManifestPath, isUpdate);
  const packageJson = await readJson(packageFile);
  assertHostScriptCompatible(packageJson);

  // Apply, with rollback of every artifact on any later failure.
  const packageBackup = await readOptional(packageFile);
  let configCreated = false;
  let toolkit;
  let generated;
  try {
    if ((await pathState(targetConfigPath)) === 'missing') {
      await initHostSkillConfig({ root: targetRoot, packageManager, snapshotScript });
      configCreated = true;
    } else {
      if ((await pathState(targetConfigPath)) !== 'file')
        throw new Error(`Host Skill config must be a file: ${targetConfigPath}`);
      if (packageManager !== undefined || snapshotScript !== undefined) {
        throw new Error(
          '--package-manager and --snapshot-script only apply when host-skills.json is absent.',
        );
      }
    }
    await refreshHostSkills({ root: targetRoot, dryRun: true });
    toolkit = await installManagedFiles(
      targetToolingRoot,
      targetManifestPath,
      sourceFiles,
      manifest,
      isUpdate,
    );
    generated = await refreshHostSkills({ root: targetRoot });
    await registerHostScript(packageFile, packageJson);
    await removeLegacyArtifacts(legacy);
    await toolkit.commit();
    return {
      targetRoot,
      targetToolingRoot,
      targetManifestPath,
      targetConfigPath,
      configCreated,
      manifest,
      generated,
    };
  } catch (error) {
    await toolkit?.restore().catch(() => {});
    if (packageBackup !== undefined) await writeFile(packageFile, packageBackup).catch(() => {});
    else await rm(packageFile, { force: true }).catch(() => {});
    if (configCreated) await rm(targetConfigPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function assertSupplyState(
  toolingRoot,
  manifestPath,
  update,
  nextManifest,
  replacingLegacy = false,
) {
  const existingManifestState = await pathState(manifestPath);
  const managedStates = await Promise.all(
    MANAGED_SKILLS.map(async (skillName) => ({
      skillName,
      state: await pathState(join(toolingRoot, skillName)),
    })),
  );
  if (!update) {
    if (replacingLegacy) {
      if (
        existingManifestState !== 'file' ||
        managedStates.some((item) => item.state !== 'missing')
      )
        throw new Error('Refusing to migrate over an incomplete or unmarked legacy layout.');
    } else if (
      existingManifestState !== 'missing' ||
      managedStates.some((item) => item.state !== 'missing')
    ) {
      throw new Error(
        'Refusing to overwrite existing host Skill tooling; re-run the same command for a managed update.',
      );
    }
    return;
  }
  const existingManifest = await readJson(manifestPath);
  validateManifest(existingManifest);
  if (existingManifestState !== 'file' || managedStates.some((item) => item.state !== 'directory'))
    throw new Error('Refusing to update an incomplete or unmarked host Skill tooling kit.');
  const currentFiles = await collectManagedFiles(toolingRoot);
  const managedCurrentFiles = new Map(
    [...currentFiles.entries()].filter(([name]) => Object.hasOwn(existingManifest.files, name)),
  );
  const expectedNames = Object.keys(existingManifest.files).sort();
  const currentNames = [...managedCurrentFiles.keys()].sort();
  if (JSON.stringify(expectedNames) !== JSON.stringify(currentNames))
    throw new Error('Refusing to update host Skill tooling with missing or extra files.');
  for (const [name, content] of managedCurrentFiles) {
    if (sha256(content) !== existingManifest.files[name])
      throw new Error(`Refusing to update manually changed managed file: ${name}`);
  }
  if (digestFiles(managedCurrentFiles) !== existingManifest.sourceDigest)
    throw new Error('Refusing to update a manually changed host Skill tooling manifest.');
  if (!MANAGED_SKILLS.every((skillName) => nextManifest.managedSkills.includes(skillName)))
    throw new Error('Next tooling manifest does not contain the complete managed Skill set.');
}

async function prepareLegacyMigration(
  targetRoot,
  legacyManifestPath,
  replacesToolingManifest = false,
) {
  const legacyManifest = await readJson(legacyManifestPath);
  if (
    !isObject(legacyManifest) ||
    legacyManifest.generator !== MANIFEST_GENERATOR ||
    !isObject(legacyManifest.files) ||
    typeof legacyManifest.sourceDigest !== 'string'
  )
    throw new Error('Legacy tooling manifest is invalid; migrate the old layout manually.');
  const legacySkillsRoot = join(targetRoot, '.agents', 'skills');
  const { mismatch } = await findLegacyMismatch(legacySkillsRoot, legacyManifest);
  if (mismatch !== null)
    throw new Error(
      `Legacy layout is not fully managed (${mismatch}); fix or remove the manual change, then re-run.`,
    );
  return {
    kind: 'migration',
    // When the legacy manifest lives at the target path, the install step replaces it with the
    // new layout manifest, so there is no separate legacy manifest file to remove.
    legacyManifestPath: replacesToolingManifest ? undefined : legacyManifestPath,
    legacySkillsRoot,
    skills: MANAGED_SKILLS.slice(),
  };
}

async function prepareLegacyCleanup(targetRoot, manifestPath, update) {
  if (!update) return { kind: 'none', legacySkillsRoot: join(targetRoot, '.agents', 'skills') };
  const manifest = await readJson(manifestPath);
  const legacySkillsRoot = join(targetRoot, '.agents', 'skills');
  const { mismatch, present } = await findLegacyMismatch(legacySkillsRoot, manifest);
  if (!present) return { kind: 'none', legacySkillsRoot };
  if (mismatch !== null) {
    throw new Error(
      `Legacy Skill copies under .agents/skills are not fully managed (${mismatch}); move them away, then re-run.`,
    );
  }
  return {
    kind: 'cleanup',
    legacyManifestPath: undefined,
    legacySkillsRoot,
    skills: MANAGED_SKILLS.slice(),
  };
}

async function findLegacyMismatch(legacySkillsRoot, manifest) {
  const managedPrefixes = new Set([
    ...MANAGED_SKILLS,
    ...MANAGED_AUXILIARY.map((name) => name.split('/')[0]),
  ]);
  let present = false;
  for (const prefix of managedPrefixes) {
    const state = await pathState(join(legacySkillsRoot, prefix));
    if (state === 'directory' || state === 'file') present = true;
  }
  if (!present) return { mismatch: null, present: false };
  const legacyFiles = await collectManagedFiles(legacySkillsRoot);
  for (const [name, digest] of Object.entries(manifest.files)) {
    const prefix = name.split('/')[0];
    if (!managedPrefixes.has(prefix)) continue;
    const content = legacyFiles.get(name);
    if (content === undefined) return { mismatch: `missing managed file: ${name}`, present: true };
    if (!legacyDigestMatches(content, digest))
      return { mismatch: `modified managed file: ${name}`, present: true };
  }
  const extra = [...legacyFiles.keys()].filter((name) => {
    const prefix = name.split('/')[0];
    return managedPrefixes.has(prefix) && !Object.hasOwn(manifest.files, name);
  });
  if (extra.length > 0)
    return { mismatch: `extra file(s) not in the manifest: ${extra.join(', ')}`, present: true };
  return { mismatch: null, present: true };
}

// Legacy manifests recorded LF-based digests, but a Windows host with core.autocrlf checked the
// managed files out with CRLF. Treat a file as unmodified when either its raw or LF-normalized
// digest matches, so checkout line-ending conversion is not mistaken for a manual edit.
function legacyDigestMatches(content, digest) {
  return sha256(content) === digest || sha256(normalizeLineEndings(content)) === digest;
}

function normalizeLineEndings(value) {
  return Buffer.from(value.toString('utf8').replace(/\r\n/gu, '\n'), 'utf8');
}

async function removeLegacyArtifacts(legacy) {
  if (legacy.kind === 'none') return;
  for (const skillName of legacy.skills) {
    await rm(join(legacy.legacySkillsRoot, skillName), { recursive: true, force: true }).catch(
      () => {},
    );
  }
  for (const name of MANAGED_AUXILIARY) {
    await rm(join(legacy.legacySkillsRoot, name), { force: true }).catch(() => {});
  }
  await rmEmptyDirectories(legacy.legacySkillsRoot, MANAGED_AUXILIARY);
  if (legacy.legacyManifestPath !== undefined)
    await rm(legacy.legacyManifestPath, { force: true }).catch(() => {});
}

async function rmEmptyDirectories(root, auxiliaryNames) {
  for (const name of auxiliaryNames) {
    const directory = dirname(join(root, name));
    if (directory === root) continue;
    try {
      const entries = await readdir(directory);
      if (entries.length === 0) await rm(directory, { recursive: true, force: true });
    } catch {
      // Directory is missing or not empty; nothing to remove.
    }
  }
}

async function installManagedFiles(
  targetToolingRoot,
  targetManifestPath,
  sourceFiles,
  manifest,
  update,
) {
  await mkdir(targetToolingRoot, { recursive: true });
  await mkdir(dirname(targetManifestPath), { recursive: true });
  const stage = await mkdtemp(join(targetToolingRoot, '.base-screen-host-kit-stage-'));
  const backup = await mkdtemp(join(targetToolingRoot, '.base-screen-host-kit-backup-'));
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
        await rename(join(targetToolingRoot, skillName), join(backup, skillName));
        moved.push(skillName);
      }
      for (const name of MANAGED_AUXILIARY) {
        if ((await pathState(join(targetToolingRoot, name))) !== 'file') continue;
        await mkdir(dirname(join(backup, name)), { recursive: true });
        await rename(join(targetToolingRoot, name), join(backup, name));
        moved.push(name);
      }
    }
    for (const skillName of MANAGED_SKILLS) {
      await rename(join(stage, skillName), join(targetToolingRoot, skillName));
      placed.push(skillName);
    }
    for (const name of MANAGED_AUXILIARY) {
      await mkdir(dirname(join(targetToolingRoot, name)), { recursive: true });
      await rename(join(stage, name), join(targetToolingRoot, name));
      placed.push(name);
    }
    await atomicWrite(targetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    for (const skillName of placed)
      await rm(join(targetToolingRoot, skillName), { recursive: true, force: true }).catch(
        () => {},
      );
    for (const skillName of moved) {
      await mkdir(dirname(join(targetToolingRoot, skillName)), { recursive: true });
      await rename(join(backup, skillName), join(targetToolingRoot, skillName)).catch(() => {});
    }
    if (oldManifest === undefined) await rm(targetManifestPath, { force: true }).catch(() => {});
    else await atomicWrite(targetManifestPath, oldManifest).catch(() => {});
    await rm(stage, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    throw error;
  }
  return {
    async restore() {
      for (const skillName of placed)
        await rm(join(targetToolingRoot, skillName), { recursive: true, force: true }).catch(
          () => {},
        );
      for (const skillName of moved) {
        await mkdir(dirname(join(targetToolingRoot, skillName)), { recursive: true });
        await rename(join(backup, skillName), join(targetToolingRoot, skillName)).catch(() => {});
      }
      if (oldManifest === undefined) await rm(targetManifestPath, { force: true }).catch(() => {});
      else await atomicWrite(targetManifestPath, oldManifest).catch(() => {});
      await rm(stage, { recursive: true, force: true });
      await rm(backup, { recursive: true, force: true });
    },
    async commit() {
      await rm(stage, { recursive: true, force: true });
      await rm(backup, { recursive: true, force: true });
    },
  };
}

function assertHostScriptCompatible(packageJson) {
  if (!isObject(packageJson.scripts)) return;
  const existing = packageJson.scripts[HOST_SCRIPT_NAME];
  if (existing !== undefined && existing !== HOST_SCRIPT_VALUE) {
    throw new Error(
      `package.json already defines "${HOST_SCRIPT_NAME}" as ${JSON.stringify(existing)}; the toolkit requires exactly ${JSON.stringify(HOST_SCRIPT_VALUE)}. Remove or adjust the conflicting script, then re-run.`,
    );
  }
}

async function registerHostScript(packageFile, packageJson) {
  if (!isObject(packageJson.scripts)) packageJson.scripts = {};
  if (packageJson.scripts[HOST_SCRIPT_NAME] !== undefined) return;
  packageJson.scripts[HOST_SCRIPT_NAME] = HOST_SCRIPT_VALUE;
  await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
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
  for (const name of MANAGED_AUXILIARY) {
    const auxiliaryPath = join(root, name);
    if ((await pathState(auxiliaryPath)) === 'file') {
      result.set(name, await readFile(auxiliaryPath));
    } else if (root === SOURCE_SKILLS_ROOT) {
      throw new Error(`Shared Skill helper is missing: ${auxiliaryPath}`);
    }
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
  const options = {
    hostRoot: undefined,
    packageManager: undefined,
    snapshotScript: undefined,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--host') {
      options.hostRoot = argv[++index];
      if (options.hostRoot === undefined) throw new Error('--host requires a value.');
    } else if (argument === '--package-manager' || argument === '--snapshot-script') {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} requires a value.`);
      if (argument === '--package-manager') options.packageManager = value;
      else options.snapshotScript = value;
    } else if (argument !== '--help') throw new Error(`Unknown argument ${argument}.`);
  }
  if (options.hostRoot === undefined) throw new Error('--host is required.');
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.hostRoot === undefined) {
      console.log(
        'Usage: node vendor-host-skill-kit.mjs --host <host-root> [--package-manager <pnpm|npm|yarn>] [--snapshot-script <name>]',
      );
      return;
    }
    const result = await vendorHostSkillKit({
      hostRoot: options.hostRoot,
      packageManager: options.packageManager,
      snapshotScript: options.snapshotScript,
    });
    console.log(
      `Installed the host toolkit at ${result.targetToolingRoot} and refreshed ${result.generated.screenTarget} and ${result.generated.materialTarget}.`,
    );
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

export const vendorInternals = {
  collectManagedFiles,
  digestFiles,
  parseArgs,
  validateManifest,
};
