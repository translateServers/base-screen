import { spawn } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  digestPaths,
  fail,
  fileHash,
  fingerprints,
  hash,
  inventory,
  json,
  LOCAL,
  optionalJson,
  safePath,
  walk,
  writeChanged,
} from './files.mjs';

const require = createRequire(import.meta.url);

function pnpmEntry() {
  const candidates = [
    join(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js'),
    join(dirname(process.execPath), '../lib/node_modules/corepack/dist/pnpm.js'),
  ];
  try {
    candidates.push(require.resolve('corepack/dist/pnpm.js'));
  } catch {
    /* Not a workspace dependency. */
  }
  if (process.env.npm_execpath) candidates.push(process.env.npm_execpath);
  const entry = candidates.find(existsSync);
  if (!entry) fail('PNPM_ENTRY_MISSING', 'Run through corepack pnpm integration.');
  return entry;
}

function batchArgument(value) {
  if (/[\r\n"%!&|<>^]/.test(value)) fail('PNPM_PATH_UNSAFE', value);
  return '"' + value + '"';
}

function shellArgument(value) {
  if (/[\r\n\0]/.test(value)) fail('PNPM_PATH_UNSAFE', value);
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export async function execute(command, log) {
  let executable;
  let args;
  if (command.tool === 'pnpm') {
    executable = process.execPath;
    args = [pnpmEntry(), ...command.args];
  } else if (command.tool === 'node') {
    executable = process.execPath;
    args = command.args;
  } else if (command.tool === 'git') {
    executable = 'git';
    args = command.args;
  } else if (command.tool === 'powershell') {
    executable = 'powershell';
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ...command.args];
  } else {
    fail('COMMAND_TOOL_INVALID', command.tool);
  }
  mkdirSync(dirname(log), { recursive: true });
  // Lifecycle scripts often call pnpm again. Keep those calls on Corepack's per-project
  // dispatcher as well; a globally installed pnpm may have a different pinned release.
  const shimDirectory = join(dirname(log), 'bin');
  const corepack = pnpmEntry();
  if (process.platform === 'win32') {
    writeChanged(
      join(shimDirectory, 'pnpm.cmd'),
      '@' + batchArgument(process.execPath) + ' ' + batchArgument(corepack) + ' %*\r\n',
    );
  } else {
    const shim = join(shimDirectory, 'pnpm');
    writeChanged(
      shim,
      '#!/bin/sh\nexec ' +
        shellArgument(process.execPath) +
        ' ' +
        shellArgument(corepack) +
        ' "$@"\n',
    );
    chmodSync(shim, 0o755);
  }
  const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = shimDirectory + delimiter + (env[pathKey] || '');
  const fd = openSync(log, 'a');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: command.cwd,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', fd, fd],
        env,
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('Command exited ' + code)),
      );
    });
  } catch (error) {
    fail('COMMAND_FAILED', command.id + '; log=' + log + '; ' + error.message);
  } finally {
    closeSync(fd);
  }
}

export function environment(roots) {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    baseManager: optionalJson(join(roots.base, 'package.json'))?.packageManager,
    hostManager: optionalJson(join(roots.host, 'package.json'))?.packageManager,
    ci: Boolean(process.env.CI),
    timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    nodeOptions: process.env.NODE_OPTIONS || '',
  };
}

function verificationInputKey(roots, command) {
  const root = command.repo === 'base' ? roots.base : roots.host;
  const provenance =
    command.repo === 'host'
      ? optionalJson(join(roots.host, 'frontend/vendor/base-screen/SOURCE.json'))
      : null;
  const input = command.inputs
    ? digestPaths(
        root,
        inventory(root).filter(
          (name) =>
            name !== 'frontend/vendor/base-screen/SOURCE.json' &&
            command.inputs.some((prefix) => name === prefix || name.startsWith(prefix + '/')),
        ),
      )
    : fingerprints(root).verification;
  return hash(
    json({
      input,
      environment: environment(roots),
      id: command.id,
      args: command.args,
      inputs: command.inputs || null,
      tool: command.tool,
      cwd: command.cwd,
      supplierArtifacts: provenance
        ? { packages: provenance.packages, lockfiles: provenance.lockfiles }
        : null,
      runner: fileHash(fileURLToPath(import.meta.url)),
    }),
  );
}

export function verificationKey(roots, command) {
  const root = command.repo === 'base' ? roots.base : roots.host;
  const outputs =
    command.repo === 'base'
      ? readdirSync(join(root, 'packages'), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .flatMap((entry) => [
            ...walk(root, 'packages/' + entry.name + '/dist'),
            ...walk(root, 'packages/' + entry.name + '/LICENSE'),
          ])
      : command.id === 'host-build'
        ? walk(root, 'frontend/dist')
        : [];
  return hash(
    json({ input: verificationInputKey(roots, command), outputs: digestPaths(root, outputs) }),
  );
}

export async function runCheck(roots, command, { run = execute, cache = true } = {}) {
  let key = verificationKey(roots, command);
  const receiptPath = safePath(roots.origin, LOCAL + '/receipts/' + command.id + '.json');
  const previous = optionalJson(receiptPath);
  if (cache && !process.env.CI && !command.online && previous?.key === key && previous.ok) {
    return { ...previous, cached: true };
  }
  const log = safePath(roots.origin, LOCAL + '/logs/' + command.id + '-' + Date.now() + '.log');
  writeChanged(receiptPath, json({ id: command.id, ok: false, key, log }));
  if (command.id === 'base-delivery') {
    await run({ ...command, id: 'base-format', args: ['format'] }, log);
    key = verificationKey(roots, command);
  }
  const inputKey = verificationInputKey(roots, command);
  // A failed rerun invalidates a previous receipt before any child process starts.
  writeChanged(receiptPath, json({ id: command.id, ok: false, key, log }));
  await run(command, log);
  const finalKey = verificationKey(roots, command);
  // Formatting was completed before taking this baseline. All checks now require stable input.
  if (verificationInputKey(roots, command) !== inputKey) {
    fail('CHECK_INPUT_CHANGED', command.id);
  }
  const receipt = {
    id: command.id,
    key: finalKey,
    ok: true,
    log,
    cached: false,
    online: Boolean(command.online),
  };
  writeChanged(receiptPath, json(receipt));
  return receipt;
}
