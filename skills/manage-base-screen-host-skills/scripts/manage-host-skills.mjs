import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHostMaterialSkill } from '../../create-base-screen-host-material-skill/scripts/create-host-material-skill.mjs';
import { createHostSkill } from '../../create-base-screen-host-skill/scripts/create-host-screen-skill.mjs';
import { readAndCanonicalizeSnapshot } from './snapshot-file.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_RELATIVE = join('.base-screen', 'host-skills.json');
const SNAPSHOT_RELATIVE = join('.base-screen', 'host-snapshot.json');
const TOOLING_RELATIVE = join('.base-screen', 'tooling', 'base-screen-host-skills');
const MANIFEST_RELATIVE = join('.base-screen', 'host-skill-tooling.json');
const DEFAULT_SNAPSHOT_SCRIPT = 'export:base-screen-skill-context';
const HOST_SCRIPT_NAME = 'base-screen:skills';
const HOST_SCRIPT_VALUE =
  'node .base-screen/tooling/base-screen-host-skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs';
const SNAPSHOT_TIMEOUT_MS = 120_000;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/u;
const SAFE_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u;
const PACKAGE_MANAGERS = new Set(['pnpm', 'npm', 'yarn']);
const GENERATORS = {
  screen: 'create-base-screen-host-skill',
  material: 'create-base-screen-host-material-skill',
};

export async function initHostSkillConfig({
  root = process.cwd(),
  packageManager,
  snapshotScript,
  credentialEnvVars,
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
    ...(credentialEnvVars === undefined ? {} : { credentialEnvVars }),
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
      ...(credentialEnvVars === undefined ? {} : { credentialEnvVars }),
    }),
  );
  return configPath;
}

export async function refreshHostSkills({ root = process.cwd(), dryRun = false } = {}) {
  const hostRoot = await assertHostRoot(root);
  const config = await readConfig(hostRoot);
  await assertSnapshotScript(hostRoot, config);
  const workRoot = await mkdtemp(join(tmpdir(), 'base-screen-host-skill-refresh-'));
  try {
    const exportFile = join(workRoot, 'export.json');
    await runSnapshotExporter(hostRoot, config, exportFile);
    const { text, digest } = await readAndCanonicalizeSnapshot(exportFile);
    const canonicalFile = join(workRoot, 'host-snapshot.json');
    await writeFile(canonicalFile, text, 'utf8');
    const skillsParent = join(hostRoot, '.agents', 'skills');
    const results = {
      screen: await createHostSkill({
        snapshotFile: canonicalFile,
        outputParent: skillsParent,
        checkOnly: true,
      }),
      material: await createHostMaterialSkill({
        snapshotFile: canonicalFile,
        outputParent: skillsParent,
        checkOnly: true,
      }),
    };
    if (dryRun) {
      return {
        mode: 'refresh-preflight',
        snapshotDigest: digest,
        screenSkill: results.screen.skillName,
        materialSkill: results.material.skillName,
      };
    }
    const snapshotPath = join(hostRoot, SNAPSHOT_RELATIVE);
    const previousSnapshot = await readOptionalText(snapshotPath);
    await atomicWrite(snapshotPath, text);
    try {
      await syncGeneratedTargets(skillsParent, [results.screen, results.material]);
    } catch (error) {
      if (previousSnapshot === undefined) await rm(snapshotPath, { force: true }).catch(() => {});
      else await atomicWrite(snapshotPath, previousSnapshot).catch(() => {});
      throw error;
    }
    return {
      mode: 'refresh',
      snapshotPath,
      snapshotDigest: digest,
      screenTarget: join(skillsParent, results.screen.skillName),
      materialTarget: join(skillsParent, results.material.skillName),
    };
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

export async function verifyHostSkills({ root = process.cwd() } = {}) {
  const hostRoot = await assertHostRoot(root);
  await readConfig(hostRoot);
  const snapshotPath = join(hostRoot, SNAPSHOT_RELATIVE);
  const state = await pathState(snapshotPath);
  if (state !== 'file') throw new Error(`Committed snapshot is missing: ${snapshotPath}`);
  const { digest } = await readAndCanonicalizeSnapshot(snapshotPath, { requireCanonical: true });
  const skillsParent = join(hostRoot, '.agents', 'skills');
  const results = {
    screen: await createHostSkill({ snapshotFile: snapshotPath, checkOnly: true }),
    material: await createHostMaterialSkill({ snapshotFile: snapshotPath, checkOnly: true }),
  };
  await verifyGeneratedTarget(skillsParent, results.screen, digest);
  await verifyGeneratedTarget(skillsParent, results.material, digest);
  return {
    mode: 'verify',
    snapshotDigest: digest,
    screenSkill: results.screen.skillName,
    materialSkill: results.material.skillName,
  };
}

export async function checkRemoteHostSkills({ root = process.cwd() } = {}) {
  const hostRoot = await assertHostRoot(root);
  const config = await readConfig(hostRoot);
  await assertSnapshotScript(hostRoot, config);
  const workRoot = await mkdtemp(join(tmpdir(), 'base-screen-host-skill-check-remote-'));
  try {
    const snapshotFile = join(workRoot, 'host-snapshot.json');
    await runSnapshotExporter(hostRoot, config, snapshotFile);
    const { digest } = await readAndCanonicalizeSnapshot(snapshotFile);
    const snapshotPath = join(hostRoot, SNAPSHOT_RELATIVE);
    let previousDigest;
    if ((await pathState(snapshotPath)) === 'file') {
      try {
        previousDigest = (
          await readAndCanonicalizeSnapshot(snapshotPath, { requireCanonical: true })
        ).digest;
      } catch {
        previousDigest = undefined;
      }
    }
    return {
      mode: 'check-remote',
      changed: previousDigest === undefined || previousDigest !== digest,
      snapshotDigest: digest,
      previousDigest: previousDigest ?? null,
    };
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

export async function doctorHostSkills({ root = process.cwd() } = {}) {
  const hostRoot = await assertHostRoot(root);
  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'node',
    ok: Number.isFinite(nodeMajor) && nodeMajor >= 22,
    detail: `Node ${process.version}`,
  });
  let config;
  try {
    config = await readConfig(hostRoot);
    checks.push({ name: 'config', ok: true, detail: join(hostRoot, CONFIG_RELATIVE) });
  } catch (error) {
    checks.push({
      name: 'config',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  if (config !== undefined) {
    try {
      await assertSnapshotScript(hostRoot, config);
      checks.push({ name: 'snapshotScript', ok: true, detail: config.snapshotScript });
    } catch (error) {
      checks.push({
        name: 'snapshotScript',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      await resolvePackageManagerInvocation(config.packageManager, config.snapshotScript);
      checks.push({ name: 'packageManager', ok: true, detail: config.packageManager });
    } catch (error) {
      checks.push({
        name: 'packageManager',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    for (const name of config.credentialEnvVars ?? []) {
      const value = process.env[name];
      checks.push({
        name: `credential:${name}`,
        ok: typeof value === 'string' && value.length > 0,
        detail:
          typeof value === 'string' && value.length > 0
            ? 'set'
            : 'not set or empty in this environment',
      });
    }
  }
  const toolingRoot = join(hostRoot, TOOLING_RELATIVE);
  const manifestPath = join(hostRoot, MANIFEST_RELATIVE);
  if ((await pathState(manifestPath)) === 'file') {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const actual = await collectToolingFiles(toolingRoot);
      const expected = new Map(Object.entries(manifest.files ?? {}));
      const missing = [...expected.keys()].filter((name) => !actual.has(name));
      const changed = [...expected.entries()].filter(
        ([name, digest]) => actual.get(name) !== digest,
      );
      checks.push({
        name: 'toolkit',
        ok: missing.length === 0 && changed.length === 0,
        detail:
          missing.length === 0 && changed.length === 0
            ? `${expected.size} managed files match`
            : `missing [${missing.join(', ')}], changed [${changed.map(([name]) => name).join(', ')}]`,
      });
    } catch (error) {
      checks.push({
        name: 'toolkit',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    checks.push({ name: 'toolkit', ok: false, detail: 'Managed tooling manifest is missing' });
  }
  const snapshotPath = join(hostRoot, SNAPSHOT_RELATIVE);
  if ((await pathState(snapshotPath)) === 'file') {
    try {
      const { digest } = await readAndCanonicalizeSnapshot(snapshotPath, {
        requireCanonical: true,
      });
      checks.push({ name: 'snapshot', ok: true, detail: digest.slice(0, 12) });
    } catch (error) {
      checks.push({
        name: 'snapshot',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    checks.push({ name: 'snapshot', ok: false, detail: 'Committed snapshot is missing' });
  }
  const skillsParent = join(hostRoot, '.agents', 'skills');
  if (config !== undefined && (await pathState(snapshotPath)) === 'file') {
    try {
      const results = {
        screen: await createHostSkill({ snapshotFile: snapshotPath, checkOnly: true }),
        material: await createHostMaterialSkill({ snapshotFile: snapshotPath, checkOnly: true }),
      };
      const { digest } = await readAndCanonicalizeSnapshot(snapshotPath);
      await verifyGeneratedTarget(skillsParent, results.screen, digest);
      await verifyGeneratedTarget(skillsParent, results.material, digest);
      checks.push({
        name: 'generatedSkills',
        ok: true,
        detail: `${results.screen.skillName}, ${results.material.skillName}`,
      });
    } catch (error) {
      checks.push({
        name: 'generatedSkills',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    checks.push({ name: 'generatedSkills', ok: false, detail: 'Not checked' });
  }
  return { mode: 'doctor', hostRoot, checks };
}

export async function runSnapshotExporter(
  root,
  config,
  snapshotFile,
  timeoutMs = SNAPSHOT_TIMEOUT_MS,
) {
  validateConfig(config);
  if (typeof snapshotFile !== 'string' || snapshotFile.length === 0)
    throw new Error('Snapshot file path is required.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('Snapshot exporter timeout must be a positive number.');
  let invocation;
  try {
    invocation = await resolvePackageManagerInvocation(
      config.packageManager,
      config.snapshotScript,
    );
  } catch (error) {
    await clearSnapshotOutput(snapshotFile);
    throw new Error(`Unable to locate snapshot exporter command: ${error.message}`);
  }
  let child;
  try {
    child = spawn(invocation.command, invocation.args, {
      cwd: root,
      env: { ...process.env, BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE: snapshotFile },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    await clearSnapshotOutput(snapshotFile);
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
    await clearSnapshotOutput(snapshotFile);
    throw new Error(`Unable to start snapshot exporter: ${error.message}`);
  });
  if (timedOut) {
    await clearSnapshotOutput(snapshotFile);
    throw new Error(`Snapshot exporter timed out after ${timeoutMs}ms.`);
  }
  if (result.code !== 0) {
    const detail = redact(`${stdout}\n${stderr}`).trim();
    await clearSnapshotOutput(snapshotFile);
    throw new Error(
      `Snapshot exporter failed with ${result.code === null ? result.signal : `exit code ${result.code}`}.${
        detail.length > 0 ? `\n${detail}` : ''
      }`,
    );
  }
}

export function validateConfig(config) {
  if (!isObject(config)) throw new Error('host-skills.json must contain an object.');
  const allowed = new Set(['packageManager', 'snapshotScript', 'credentialEnvVars']);
  for (const key of Object.keys(config))
    if (!allowed.has(key)) throw new Error(`host-skills.json contains unknown field ${key}`);
  if (!Object.hasOwn(config, 'packageManager') || !Object.hasOwn(config, 'snapshotScript'))
    throw new Error('host-skills.json must contain packageManager and snapshotScript.');
  if (!PACKAGE_MANAGERS.has(config.packageManager))
    throw new Error('host-skills.json.packageManager must be pnpm, npm, or yarn.');
  if (typeof config.snapshotScript !== 'string' || !SAFE_IDENTIFIER.test(config.snapshotScript))
    throw new Error('host-skills.json.snapshotScript must be a safe script name.');
  if (config.credentialEnvVars !== undefined) {
    if (
      !Array.isArray(config.credentialEnvVars) ||
      config.credentialEnvVars.length === 0 ||
      config.credentialEnvVars.length > 16 ||
      config.credentialEnvVars.some((name) => typeof name !== 'string' || !SAFE_ENV_NAME.test(name))
    ) {
      throw new Error(
        'host-skills.json.credentialEnvVars must contain 1 to 16 safe environment variable names.',
      );
    }
  }
}

async function assertSnapshotScript(root, config) {
  const packageJson = await readJsonFile(join(root, 'package.json'), 'package.json');
  if (
    !isObject(packageJson.scripts) ||
    typeof packageJson.scripts[config.snapshotScript] !== 'string'
  )
    throw new Error(`package.json does not define ${config.snapshotScript}.`);
}

async function verifyGeneratedTarget(parent, result, snapshotDigest) {
  const target = join(parent, result.skillName);
  const state = await pathState(target);
  if (state !== 'directory') throw new Error(`Generated Skill is missing: ${target}`);
  await assertGeneratedMarker(target, result.skillName, undefined, result, snapshotDigest);
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

async function assertGeneratedMarker(target, skillName, expectedManifest, result, snapshotDigest) {
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
  if (snapshotDigest !== undefined && marker.snapshotDigest !== snapshotDigest)
    throw new Error(`Generated Skill snapshot digest mismatch at ${target}.`);
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

async function collectToolingFiles(root) {
  const result = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const content = await readFile(absolute);
        result.set(relative(root, absolute).replaceAll('\\', '/'), sha256(content));
      }
    }
  }
  if ((await pathState(root)) === 'directory') await visit(root);
  return result;
}

async function clearSnapshotOutput(snapshotFile) {
  const resolvedFile = resolve(snapshotFile);
  const resolvedTempRoot = resolve(tmpdir());
  const tempPrefix =
    resolvedTempRoot.endsWith('/') || resolvedTempRoot.endsWith('\\')
      ? resolvedTempRoot
      : `${resolvedTempRoot}${process.platform === 'win32' ? '\\' : '/'}`;
  if (!resolvedFile.startsWith(tempPrefix)) return;
  await rm(resolvedFile, { force: true }).catch(() => {});
}

async function readConfig(root) {
  const config = await readJsonFile(join(root, CONFIG_RELATIVE), CONFIG_RELATIVE);
  validateConfig(config);
  return config;
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

async function readOptionalText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
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
  const options = { command: 'refresh', root: undefined };
  let index = 0;
  while (index < argv.length) {
    const argument = argv[index++];
    if (argument === '--root') {
      const value = argv[index++];
      if (value === undefined) throw new Error('--root requires a value.');
      options.root = value;
    } else if (argument === '--help') {
      options.command = 'help';
    } else if (['refresh', 'verify', 'check-remote', 'doctor'].includes(argument)) {
      options.command = argument;
    } else {
      throw new Error(`Unknown argument ${argument}.`);
    }
  }
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'help') {
      console.log(
        'Usage: node manage-host-skills.mjs [refresh|verify|check-remote|doctor] [--root <path>]\n' +
          '  (no command)  Pull the latest snapshot and atomically refresh both host Skills.\n' +
          '  verify        Offline check of the committed snapshot and both generated Skills.\n' +
          '  check-remote  Export a temporary snapshot and report drift without writing.\n' +
          '  doctor        Report Node, config, credentials, toolkit, snapshot, and Skill state.',
      );
      return;
    }
    const root = options.root ?? process.cwd();
    let result;
    if (options.command === 'refresh') result = await refreshHostSkills({ root });
    else if (options.command === 'verify') result = await verifyHostSkills({ root });
    else if (options.command === 'check-remote') result = await checkRemoteHostSkills({ root });
    else result = await doctorHostSkills({ root });
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
  collectToolingFiles,
  inferPackageManager,
  pathState,
  redact,
  sha256,
};
