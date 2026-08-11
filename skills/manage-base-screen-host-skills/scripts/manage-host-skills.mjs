import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHostMaterialSkill } from '../../create-base-screen-host-material-skill/scripts/create-host-material-skill.mjs';
import { createHostSkill } from '../../create-base-screen-host-skill/scripts/create-host-screen-skill.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(SCRIPT_DIR, '..', '..');
const CONFIG_RELATIVE = join('.base-screen', 'host-skills.json');
const DEFAULT_SNAPSHOT_SCRIPT = 'export:base-screen-skill-context';
const SNAPSHOT_TIMEOUT_MS = 120_000;
const MAX_CONTEXT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_CONTEXT_TOTAL_BYTES = 12 * 1024 * 1024;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/u;
const PACKAGE_MANAGERS = new Set(['pnpm', 'npm', 'yarn']);
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
const REQUIRED_CONTEXT_FILES = CONTEXT_FILES.slice(0, 8);
const SCREEN_FILES = [
  'host.json',
  'design-guidelines.md',
  'materials.json',
  'resource-types.json',
  'datasets.json',
  'dataset-samples.json',
];
const MATERIAL_FILES = [
  'host.json',
  'material-authoring.json',
  'material-guidelines.md',
  'components.json',
  'materials.json',
  'resource-types.json',
  'datasets.json',
  'dataset-samples.json',
];
const GENERATORS = {
  screen: 'create-base-screen-host-skill',
  material: 'create-base-screen-host-material-skill',
};

export async function initHostSkillConfig({
  root = process.cwd(),
  packageManager,
  snapshotScript,
} = {}) {
  const hostRoot = await assertHostRoot(root);
  const configPath = join(hostRoot, CONFIG_RELATIVE);
  if ((await pathState(configPath)) !== 'missing')
    throw new Error(`Refusing to overwrite existing host Skill config: ${configPath}`);

  const packageJson = await readJsonFile(join(hostRoot, 'package.json'), 'package.json');
  const scripts = packageJson.scripts;
  const resolvedPackageManager = packageManager ?? inferPackageManager(packageJson.packageManager);
  const resolvedSnapshotScript = snapshotScript ?? DEFAULT_SNAPSHOT_SCRIPT;
  validateConfig({
    packageManager: resolvedPackageManager,
    snapshotScript: resolvedSnapshotScript,
  });
  if (!isObject(scripts) || typeof scripts[resolvedSnapshotScript] !== 'string') {
    throw new Error(
      `package.json does not define the configured snapshot script ${resolvedSnapshotScript}`,
    );
  }

  await mkdir(dirname(configPath), { recursive: true });
  await atomicWrite(
    configPath,
    json({
      packageManager: resolvedPackageManager,
      snapshotScript: resolvedSnapshotScript,
    }),
  );
  return configPath;
}

export async function checkHostSkills({ root = process.cwd(), mode = 'check' } = {}) {
  if (!['check', 'sync', 'verify'].includes(mode)) throw new Error(`Unsupported mode ${mode}`);
  const hostRoot = await assertHostRoot(root);
  const config = await readConfig(hostRoot);
  await assertSnapshotScript(hostRoot, config);
  return withPreparedContext(hostRoot, config, async ({ results, skillsParent }) => {
    if (mode === 'check') {
      return {
        mode,
        screenSkill: results.screen.skillName,
        materialSkill: results.material.skillName,
      };
    }
    if (mode === 'verify') {
      await verifyGeneratedTarget(skillsParent, results.screen);
      await verifyGeneratedTarget(skillsParent, results.material);
      return {
        mode,
        screenSkill: results.screen.skillName,
        materialSkill: results.material.skillName,
      };
    }
    await syncGeneratedTargets(skillsParent, [results.screen, results.material]);
    return {
      mode,
      screenTarget: join(skillsParent, results.screen.skillName),
      materialTarget: join(skillsParent, results.material.skillName),
    };
  });
}

export async function runSnapshotExporter(
  root,
  config,
  outputDirectory,
  timeoutMs = SNAPSHOT_TIMEOUT_MS,
) {
  validateConfig(config);
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0)
    throw new Error('Snapshot output directory is required.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('Snapshot exporter timeout must be a positive number.');
  let invocation;
  try {
    invocation = await resolvePackageManagerInvocation(
      config.packageManager,
      config.snapshotScript,
    );
  } catch (error) {
    await clearSnapshotOutput(outputDirectory);
    throw new Error(`Unable to locate snapshot exporter command: ${error.message}`);
  }
  let child;
  try {
    child = spawn(invocation.command, invocation.args, {
      cwd: root,
      env: { ...process.env, BASE_SCREEN_HOST_SKILL_CONTEXT_DIR: outputDirectory },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    await clearSnapshotOutput(outputDirectory);
    throw new Error(`Unable to start snapshot exporter: ${error.message}`);
  }
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const capture = (target, chunk) => {
    const text = String(chunk);
    if (target === 'stdout') stdout = `${stdout}${text}`.slice(-16_384);
    else stderr = `${stderr}${text}`.slice(-16_384);
  };
  child.stdout?.on('data', (chunk) => capture('stdout', chunk));
  child.stderr?.on('data', (chunk) => capture('stderr', chunk));
  const result = await new Promise((resolveResult, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolveResult({ code, signal });
    });
  }).catch(async (error) => {
    await clearSnapshotOutput(outputDirectory);
    throw new Error(`Unable to start snapshot exporter: ${error.message}`);
  });
  if (timedOut) {
    await clearSnapshotOutput(outputDirectory);
    throw new Error(`Snapshot exporter timed out after ${timeoutMs}ms.`);
  }
  if (result.code !== 0) {
    const detail = redact(`${stdout}\n${stderr}`).trim();
    await clearSnapshotOutput(outputDirectory);
    throw new Error(
      `Snapshot exporter failed with ${result.code === null ? result.signal : `exit code ${result.code}`}.${
        detail.length > 0 ? `\n${detail}` : ''
      }`,
    );
  }
}

async function resolvePackageManagerInvocation(packageManager, snapshotScript) {
  if (process.platform !== 'win32')
    return { command: packageManager, args: ['run', snapshotScript] };
  const nodeDirectory = dirname(process.execPath);
  const entryPoints = {
    npm: join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    pnpm: join(nodeDirectory, 'node_modules', 'corepack', 'dist', 'pnpm.js'),
    yarn: join(nodeDirectory, 'node_modules', 'corepack', 'dist', 'yarn.js'),
  };
  const command = entryPoints[packageManager];
  if (command === undefined || (await pathState(command)) !== 'file')
    throw new Error(`Unable to locate the ${packageManager} JavaScript entry point.`);
  return { command: process.execPath, args: [command, 'run', snapshotScript] };
}

export async function validateContextDirectory(contextDirectory) {
  const entries = await readdir(contextDirectory, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const unknown = entries.filter((entry) => !CONTEXT_FILES.includes(entry.name));
  if (unknown.length > 0)
    throw new Error(
      `Snapshot contains unsupported entries: ${unknown.map((entry) => entry.name).join(', ')}`,
    );
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error(`Snapshot entry ${entry.name} must be a regular file.`);
    const info = await stat(join(contextDirectory, entry.name));
    if (info.size > MAX_CONTEXT_FILE_BYTES)
      throw new Error(`Snapshot file ${entry.name} exceeds ${MAX_CONTEXT_FILE_BYTES} bytes.`);
    const content = await readFile(join(contextDirectory, entry.name), 'utf8');
    if (containsCredentialLikeValue(content))
      throw new Error(`Snapshot file ${entry.name} contains a credential-like value.`);
  }
  for (const required of REQUIRED_CONTEXT_FILES) {
    if (!names.has(required)) throw new Error(`Snapshot is missing ${required}.`);
  }
  const totalBytes = await sumFileBytes(contextDirectory, entries);
  if (totalBytes > MAX_CONTEXT_TOTAL_BYTES)
    throw new Error(`Snapshot exceeds ${MAX_CONTEXT_TOTAL_BYTES} bytes in total.`);
}

export async function routeContext(contextDirectory, bundleRoot) {
  const screenDirectory = join(bundleRoot, 'screen');
  const materialDirectory = join(bundleRoot, 'material');
  await mkdir(screenDirectory, { recursive: true });
  await mkdir(materialDirectory, { recursive: true });
  await copyAllowlistedFiles(contextDirectory, screenDirectory, SCREEN_FILES);
  await copyAllowlistedFiles(contextDirectory, materialDirectory, MATERIAL_FILES);
  return { screenDirectory, materialDirectory };
}

export async function verifyGeneratedTarget(parent, result) {
  const target = join(parent, result.skillName);
  const state = await pathState(target);
  if (state !== 'directory') throw new Error(`Generated Skill is missing: ${target}`);
  await assertGeneratedMarker(target, result.skillName);
  const actual = await collectFiles(target);
  const expected = new Set(result.files.keys());
  const extras = [...actual.keys()].filter((name) => !expected.has(name));
  const missing = [...expected].filter((name) => !actual.has(name));
  if (extras.length > 0 || missing.length > 0) {
    throw new Error(
      `Generated Skill drift at ${target}: missing [${missing.join(', ')}], extra [${extras.join(', ')}].`,
    );
  }
  for (const [name, expectedContent] of result.files) {
    if (actual.get(name) !== expectedContent)
      throw new Error(`Generated Skill drift at ${join(target, name)}.`);
  }
}

async function withPreparedContext(root, config, callback) {
  const workRoot = await mkdtemp(join(tmpdir(), 'base-screen-host-skill-adoption-'));
  const contextDirectory = join(workRoot, 'context');
  const bundlesRoot = join(workRoot, 'bundles');
  const skillsParent = join(root, '.agents', 'skills');
  await mkdir(contextDirectory, { recursive: true });
  await mkdir(bundlesRoot, { recursive: true });
  try {
    await runSnapshotExporter(root, config, contextDirectory);
    await validateContextDirectory(contextDirectory);
    const bundles = await routeContext(contextDirectory, bundlesRoot);
    const results = {
      screen: await createHostSkill({
        inputDir: bundles.screenDirectory,
        outputParent: skillsParent,
        checkOnly: true,
      }),
      material: await createHostMaterialSkill({
        inputDir: bundles.materialDirectory,
        outputParent: skillsParent,
        checkOnly: true,
      }),
    };
    return await callback({ results, skillsParent });
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function syncGeneratedTargets(parent, results) {
  await mkdir(parent, { recursive: true });
  for (const result of results) await assertTargetCanUpdate(parent, result);
  const stage = await mkdtemp(join(parent, '.base-screen-host-skill-sync-'));
  const backup = await mkdtemp(join(parent, '.base-screen-host-skill-backup-'));
  const moved = [];
  const placed = [];
  try {
    for (const result of results) await writeFiles(join(stage, result.skillName), result.files);
    for (const result of results) {
      const target = join(parent, result.skillName);
      if ((await pathState(target)) === 'directory') {
        await rename(target, join(backup, result.skillName));
        moved.push(result.skillName);
      }
    }
    for (const result of results) {
      await rename(join(stage, result.skillName), join(parent, result.skillName));
      placed.push(result.skillName);
    }
  } catch (error) {
    for (const skillName of placed)
      await rm(join(parent, skillName), { recursive: true, force: true }).catch(() => {});
    for (const skillName of moved)
      await rename(join(backup, skillName), join(parent, skillName)).catch(() => {});
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
  }
}

async function assertTargetCanUpdate(parent, result) {
  const target = join(parent, result.skillName);
  const state = await pathState(target);
  if (state === 'file') throw new Error(`Generated Skill target is a file: ${target}`);
  if (state === 'directory')
    await assertGeneratedMarker(target, result.skillName, undefined, result);
}

async function assertGeneratedMarker(target, skillName, expectedManifest, result) {
  let marker;
  let rawMarker;
  try {
    rawMarker = await readFile(join(target, 'generation-manifest.json'), 'utf8');
    marker = JSON.parse(rawMarker);
  } catch (error) {
    throw new Error(`Refusing to update unmarked Skill directory ${target}: ${error.message}`);
  }
  const expectedGenerator =
    result?.skillName === skillName
      ? result.skillName.startsWith('design-')
        ? GENERATORS.screen
        : GENERATORS.material
      : undefined;
  if (
    marker.skillName !== skillName ||
    (expectedGenerator !== undefined && marker.generator !== expectedGenerator)
  )
    throw new Error(`Refusing to update unmarked Skill directory ${target}.`);
  if (expectedManifest !== undefined && rawMarker !== expectedManifest)
    throw new Error(`Generated Skill marker changed unexpectedly at ${target}.`);
}

async function writeFiles(root, files) {
  for (const [name, content] of files) {
    const destination = join(root, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, 'utf8');
  }
}

async function collectFiles(root) {
  const result = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile())
        result.set(
          relative(root, absolute).replaceAll('\\', '/'),
          await readFile(absolute, 'utf8'),
        );
      else throw new Error(`Generated Skill contains unsupported entry ${absolute}.`);
    }
  }
  await visit(root);
  return result;
}

async function copyAllowlistedFiles(source, target, names) {
  for (const name of names) {
    const sourcePath = join(source, name);
    if ((await pathState(sourcePath)) === 'file') {
      await copyFile(sourcePath, join(target, name));
    }
  }
}

async function sumFileBytes(directory, entries) {
  let total = 0;
  for (const entry of entries) total += (await stat(join(directory, entry.name))).size;
  return total;
}

async function clearSnapshotOutput(directory) {
  const resolvedDirectory = resolve(directory);
  const resolvedTempRoot = resolve(tmpdir());
  const tempPrefix =
    resolvedTempRoot.endsWith('/') || resolvedTempRoot.endsWith('\\')
      ? resolvedTempRoot
      : `${resolvedTempRoot}${process.platform === 'win32' ? '\\' : '/'}`;
  if (!resolvedDirectory.startsWith(tempPrefix)) return;
  await rm(resolvedDirectory, { recursive: true, force: true }).catch(() => {});
  await mkdir(resolvedDirectory, { recursive: true }).catch(() => {});
}

async function readConfig(root) {
  const config = await readJsonFile(join(root, CONFIG_RELATIVE), CONFIG_RELATIVE);
  validateConfig(config);
  return config;
}

export function validateConfig(config) {
  if (!isObject(config)) throw new Error('host-skills.json must contain an object.');
  const keys = Object.keys(config);
  if (keys.length !== 2 || !keys.includes('packageManager') || !keys.includes('snapshotScript'))
    throw new Error('host-skills.json must contain exactly packageManager and snapshotScript.');
  if (!PACKAGE_MANAGERS.has(config.packageManager))
    throw new Error('host-skills.json.packageManager must be pnpm, npm, or yarn.');
  if (typeof config.snapshotScript !== 'string' || !SAFE_IDENTIFIER.test(config.snapshotScript))
    throw new Error('host-skills.json.snapshotScript must be a safe script name.');
}

async function assertSnapshotScript(root, config) {
  const packageJson = await readJsonFile(join(root, 'package.json'), 'package.json');
  if (
    !isObject(packageJson.scripts) ||
    typeof packageJson.scripts[config.snapshotScript] !== 'string'
  )
    throw new Error(`package.json does not define ${config.snapshotScript}.`);
}

async function assertHostRoot(root) {
  const hostRoot = resolve(root);
  const info = await pathState(join(hostRoot, 'package.json'));
  if (info !== 'file') throw new Error(`Host root must contain package.json: ${hostRoot}`);
  return hostRoot;
}

function inferPackageManager(value) {
  if (typeof value === 'string') {
    const candidate = value.split('@', 1)[0];
    if (PACKAGE_MANAGERS.has(candidate)) return candidate;
  }
  return 'pnpm';
}

async function readJsonFile(file, label) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`);
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/u, ''));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function atomicWrite(file, content) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, 'utf8');
  try {
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function redact(value) {
  return value.replace(
    /(-----BEGIN [^-]+-----|["']?(?:password|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*)[^\s,;]+/giu,
    '$1[redacted]',
  );
}

function containsCredentialLikeValue(value) {
  return /-----BEGIN (?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----|["']?(?:password|secret|token|api[_-]?key|authorization)["']?\s*[:=]/iu.test(
    value,
  );
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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
    command: argv[0] ?? 'help',
    root: undefined,
    packageManager: undefined,
    snapshotScript: undefined,
  };
  let index = 1;
  while (index < argv.length) {
    const argument = argv[index++];
    if (
      argument === '--root' ||
      argument === '--package-manager' ||
      argument === '--snapshot-script'
    ) {
      const value = argv[index++];
      if (value === undefined) throw new Error(`${argument} requires a value.`);
      if (argument === '--root') options.root = value;
      else if (argument === '--package-manager') options.packageManager = value;
      else options.snapshotScript = value;
    } else if (argument !== '--help') {
      throw new Error(`Unknown argument ${argument}.`);
    }
  }
  if (!['init', 'check', 'sync', 'verify', 'help'].includes(options.command))
    throw new Error(`Unknown command ${options.command}.`);
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'help') {
      console.log('Usage: node manage-host-skills.mjs <init|check|sync|verify> [--root <path>]');
      return;
    }
    const root = await assertHostRoot(options.root ?? process.cwd());
    if (options.command === 'init') {
      const configPath = await initHostSkillConfig({
        root,
        packageManager: options.packageManager,
        snapshotScript: options.snapshotScript,
      });
      console.log(`Created ${configPath}.`);
      return;
    }
    const result = await checkHostSkills({ root, mode: options.command });
    console.log(JSON.stringify(result, null, 2));
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

export const adoptionInternals = {
  assertHostRoot,
  collectFiles,
  inferPackageManager,
  pathState,
  redact,
  sha256,
};
