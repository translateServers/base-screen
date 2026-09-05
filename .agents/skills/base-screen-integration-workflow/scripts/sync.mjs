import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONFIG,
  CONSUMER,
  digestPaths,
  fail,
  fileHash,
  fingerprints,
  hash,
  INDEX,
  json,
  LOCAL,
  managedFiles,
  optionalJson,
  readJson,
  removeFile,
  revision,
  SNAPSHOT,
  SOURCE,
  safePath,
  tarFiles,
  validateIndex,
  walk,
  writeChanged,
} from './files.mjs';
import { execute, runCheck } from './runner.mjs';

export async function loadHost(root) {
  const config = optionalJson(join(root, CONFIG));
  if (!config?.adapter) fail('HOST_ADAPTER_MISSING', CONFIG);
  const adapter = safePath(root, config.adapter);
  const { integrationHost } = await import(pathToFileURL(adapter).href);
  if (!Array.isArray(integrationHost?.packages) || !Array.isArray(integrationHost?.managed)) {
    fail('HOST_ADAPTER_INVALID', config.adapter);
  }
  for (const name of integrationHost.packages) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(name)) fail('PACKAGE_INVALID', name);
  }
  for (const path of integrationHost.managed) safePath(root, path);
  return integrationHost;
}

export function hostCommand(roots, host, id) {
  const spec = host.commands[id];
  if (!spec) fail('COMMAND_UNKNOWN', id);
  return {
    ...spec,
    id,
    repo: 'host',
    cwd: spec.cwd ? safePath(roots.host, spec.cwd) : roots.host,
  };
}

export function hostDerivationDigest(root, host) {
  const config = readJson(join(root, CONFIG));
  const paths = [config.adapter, ...(host.deriveInputs || []).flatMap((path) => walk(root, path))];
  return digestPaths(root, paths);
}

export function supplierCommand(roots, delivery = true) {
  return {
    id: delivery ? 'base-delivery' : 'base-focused',
    repo: 'base',
    cwd: roots.base,
    tool: 'pnpm',
    args: [delivery ? 'verify:m0' : 'verify:fast'],
  };
}

export function sourceHealth(root, host, { installed = true } = {}) {
  const issues = [];
  const source = optionalJson(join(root, SOURCE));
  if (!source)
    return { ok: false, state: 'unregistered', issues: ['SOURCE_MISSING'], source: null };
  if (
    source.sourceRepo !== 'base-screen' ||
    !/^[a-f0-9]{40,64}$/.test(source.commit || '') ||
    !/^[a-f0-9]{64}$/.test(source.treeDigest || '') ||
    !/^[a-f0-9]{64}$/.test(source.packageInputsDigest || '') ||
    !/^[a-f0-9]{64}$/.test(source.contextSnapshotDigest || '') ||
    typeof source.dirty !== 'boolean' ||
    !Array.isArray(source.packages) ||
    !source.lockfiles ||
    !source.managedFiles
  )
    return { ok: false, state: 'invalid', issues: ['SOURCE_INVALID'], source };
  const expected = new Set(host.packages.map((name) => '@base-screen/' + name));
  if (fileHash(join(root, SNAPSHOT)) !== source.contextSnapshotDigest)
    issues.push('CONTEXT_DIGEST');
  const managedNames = managedFiles(root, host.managed).filter(
    (name) =>
      name !== SOURCE &&
      name !== SNAPSHOT &&
      !name.endsWith('.tgz') &&
      !host.lockfiles.includes(name),
  );
  if (json(Object.keys(source.lockfiles).sort()) !== json([...host.lockfiles].sort()))
    issues.push('LOCKFILE_SET_INVALID');
  if (json(Object.keys(source.managedFiles).sort()) !== json(managedNames.sort()))
    issues.push('MANAGED_FILE_SET_INVALID');
  if (source.packages.length !== expected.size) issues.push('PACKAGE_SET_INVALID');
  for (const entry of source.packages) {
    if (entry.file !== 'base-screen-' + String(entry.name).slice(13) + '-0.0.0.tgz') {
      issues.push('PACKAGE_FILENAME_INVALID');
      continue;
    }
    if (!expected.delete(entry.name)) issues.push('PACKAGE_UNEXPECTED:' + entry.name);
    const packagePath = 'frontend/vendor/base-screen/' + entry.file;
    try {
      if (fileHash(safePath(root, packagePath)) !== entry.sha256) {
        issues.push('PACKAGE_DIGEST:' + entry.name);
        continue;
      }
      if (installed) {
        const files = tarFiles(join(root, packagePath));
        for (const installation of host.installations) {
          if (!installation.packages.includes(entry.name.slice(13))) continue;
          const installRoot = join(root, installation.cwd, 'node_modules', entry.name);
          for (const [name, content] of files) {
            if (name !== 'package.json' && !name.startsWith('dist/')) continue;
            if (fileHash(join(installRoot, name)) !== hash(content)) {
              issues.push('INSTALLED_DIGEST:' + installation.cwd + ':' + entry.name + ':' + name);
              break;
            }
          }
        }
      }
    } catch (error) {
      issues.push(error.message);
    }
  }
  if (expected.size) issues.push('PACKAGE_MISSING:' + [...expected].join(','));
  for (const [name, digest] of Object.entries({ ...source.lockfiles, ...source.managedFiles })) {
    if (fileHash(safePath(root, name)) !== digest) issues.push('MANAGED_DIGEST:' + name);
  }
  return { ok: issues.length === 0, state: issues.length ? 'drifted' : 'verified', issues, source };
}

export function upstreamSnapshot(base, packageInputsDigest) {
  const index = validateIndex(base, readJson(join(base, INDEX)));
  const state = fingerprints(base);
  return {
    source: {
      ...revision(base),
      treeDigest: state.tree,
      packageInputsDigest,
      knowledgeDigest: state.knowledge,
    },
    capabilities: index.capabilities,
  };
}

const journalName = LOCAL + '/sync-journal.json';

function beginTransaction(root, host) {
  const previous = optionalJson(join(root, journalName));
  if (previous && previous.state !== 'complete' && previous.state !== 'restored') {
    fail('RECOVERY_REQUIRED', join(root, journalName));
  }
  const names = [...new Set([...managedFiles(root, host.managed), SOURCE, SNAPSHOT])].sort();
  const backup = LOCAL + '/backups/' + Date.now() + '-' + process.pid;
  const before = {};
  for (const name of names) {
    const path = safePath(root, name);
    before[name] = fileHash(path);
    if (before[name] !== null)
      writeChanged(safePath(root, backup + '/' + name), readFileSync(path));
  }
  const journal = {
    state: 'applying',
    backup,
    before,
    expected: { ...before },
    installTouched: false,
  };
  writeChanged(safePath(root, journalName), json(journal));
  return journal;
}

function capture(root, host, journal) {
  const names = [
    ...new Set([
      ...Object.keys(journal.before),
      ...managedFiles(root, host.managed),
      SOURCE,
      SNAPSHOT,
    ]),
  ];
  journal.expected = Object.fromEntries(
    names.map((name) => [name, fileHash(safePath(root, name))]),
  );
  writeChanged(safePath(root, journalName), json(journal));
}

export async function recoverSync(roots, host, { run = execute } = {}) {
  const journal = optionalJson(join(roots.host, journalName));
  if (!journal || ['complete', 'restored'].includes(journal.state)) return { restored: false };
  const allowed = [...host.managed, SOURCE, SNAPSHOT];
  if (
    !journal.backup?.startsWith(LOCAL + '/backups/') ||
    Object.keys({ ...journal.before, ...journal.expected }).some(
      (name) => !allowed.some((prefix) => name === prefix || name.startsWith(prefix + '/')),
    )
  ) {
    fail('RECOVERY_JOURNAL_INVALID', journalName);
  }
  for (const [name, digest] of Object.entries(journal.before)) {
    if (digest !== null && fileHash(safePath(roots.host, journal.backup + '/' + name)) !== digest) {
      fail('RECOVERY_BACKUP_INVALID', name);
    }
  }
  const conflicts = Object.entries(journal.expected).filter(
    ([name, digest]) => fileHash(safePath(roots.host, name)) !== digest,
  );
  if (conflicts.length) fail('RECOVERY_CONFLICT', conflicts.map(([name]) => name).join(', '));
  try {
    for (const name of Object.keys(journal.expected)) {
      if (journal.before[name] === null || journal.before[name] === undefined)
        removeFile(roots.host, name);
      else
        writeChanged(
          safePath(roots.host, name),
          readFileSync(safePath(roots.host, journal.backup + '/' + name)),
        );
    }
    journal.expected = Object.fromEntries(
      Object.keys(journal.expected).map((name) => [name, fileHash(safePath(roots.host, name))]),
    );
    journal.state = 'repairing';
    writeChanged(safePath(roots.host, journalName), json(journal));
    if (journal.installTouched) {
      for (const id of host.repair) {
        await run(
          hostCommand(roots, host, id),
          safePath(roots.origin, LOCAL + '/logs/recover-' + id + '.log'),
        );
      }
    }
    journal.state = 'restored';
    writeChanged(safePath(roots.host, journalName), json(journal));
    return { restored: true };
  } catch (error) {
    journal.state = 'recovery-failed';
    journal.error = error.message;
    writeChanged(safePath(roots.host, journalName), json(journal));
    fail('RECOVERY_FAILED', error.message);
  }
}

export async function synchronize(roots, host, task, options = {}) {
  const run = options.run || execute;
  if (!existsSync(roots.base)) fail('SUPPLIER_UNAVAILABLE', roots.base);
  const unfinished = optionalJson(join(roots.host, journalName));
  if (unfinished && !['complete', 'restored'].includes(unfinished.state)) {
    if (!options.recover)
      fail('RECOVERY_REQUIRED', 'Use sync --recover; inspect ' + join(roots.host, journalName));
    await recoverSync(roots, host, { run });
  }
  const health = sourceHealth(roots.host, host);
  const managedExpansion =
    health.issues.length === 1 &&
    health.issues[0] === 'MANAGED_FILE_SET_INVALID' &&
    Object.keys(health.source?.managedFiles ?? {}).every((name) =>
      managedFiles(roots.host, host.managed).includes(name),
    );
  if (!health.ok && health.state !== 'unregistered' && !managedExpansion) {
    fail('SOURCE_DRIFT', health.issues.join(', '));
  }
  const current = fingerprints(roots.base);
  const derivationDigest = hostDerivationDigest(roots.host, host);
  const needsDerivation =
    managedExpansion || health.source?.hostDerivationDigest !== derivationDigest;
  const needsPackages = health.source?.packageInputsDigest !== current.packages;
  const previousSnapshot = optionalJson(join(roots.host, SNAPSHOT));
  const needsContext = previousSnapshot?.source?.knowledgeDigest !== current.knowledge;
  if (!needsPackages && !needsContext && !needsDerivation)
    return { changed: false, packages: false, context: false, checks: [] };

  const beforeNames = managedFiles(roots.host, host.managed);
  const before = Object.fromEntries(
    beforeNames.map((name) => [name, fileHash(safePath(roots.host, name))]),
  );
  const existingChanges = Object.keys(task.baseline?.host?.modified || {}).filter((name) =>
    host.managed.some((prefix) => name === prefix || name.startsWith(prefix + '/')),
  );
  // A prior successful sync can remain uncommitted across tasks. Verified provenance
  // accounts for those outputs; an unregistered or drifted set does not.
  const accounted = new Set([
    ...Object.keys(health.source?.managedFiles || {}),
    ...Object.keys(health.source?.lockfiles || {}),
    ...(health.source?.packages || []).map((item) => 'frontend/vendor/base-screen/' + item.file),
    SOURCE,
    SNAPSHOT,
  ]);
  if (
    existingChanges.length &&
    !health.ok &&
    (!managedExpansion || existingChanges.some((name) => !accounted.has(name)))
  )
    fail('PREEXISTING_MANAGED_CHANGES', existingChanges.join(', '));

  const checks = [];
  const packed = [];
  let verified = current;
  if (needsPackages) {
    checks.push(
      await runCheck(roots, supplierCommand(roots, options.profile !== 'focused'), { run }),
    );
    verified = fingerprints(roots.base);
    const destination = safePath(roots.origin, LOCAL + '/packs/' + verified.packages);
    mkdirSync(destination, { recursive: true });
    for (const name of host.packages) {
      const id = 'pack-' + name;
      await run(
        {
          id,
          repo: 'base',
          cwd: roots.base,
          tool: 'pnpm',
          args: ['--filter', '@base-screen/' + name, 'pack', '--pack-destination', destination],
        },
        safePath(roots.origin, LOCAL + '/logs/' + id + '.log'),
      );
      const file = 'base-screen-' + name + '-0.0.0.tgz';
      const path = join(destination, file);
      const files = tarFiles(path);
      if (JSON.parse(files.get('package.json').toString()).name !== '@base-screen/' + name)
        fail('PACK_MANIFEST_INVALID', file);
      packed.push({ name: '@base-screen/' + name, file, sha256: fileHash(path), path });
    }
    if (fingerprints(roots.base).tree !== verified.tree)
      fail('SUPPLIER_CHANGED_DURING_PACK', roots.base);
  }
  const afterNames = managedFiles(roots.host, host.managed);
  const after = Object.fromEntries(
    afterNames.map((name) => [name, fileHash(safePath(roots.host, name))]),
  );
  if (json(before) !== json(after)) fail('HOST_CHANGED_DURING_PACK', roots.host);
  const journal = beginTransaction(roots.host, host);
  try {
    if (needsPackages) {
      for (const entry of packed) {
        writeChanged(
          safePath(roots.host, 'frontend/vendor/base-screen/' + entry.file),
          readFileSync(entry.path),
        );
      }
      capture(roots.host, host, journal);
    }
    if (needsPackages || needsDerivation) {
      for (const id of [...(needsPackages ? host.install : []), ...host.derive, ...host.validate]) {
        if (host.install.includes(id)) journal.installTouched = true;
        writeChanged(safePath(roots.host, journalName), json(journal));
        try {
          await run(
            hostCommand(roots, host, id),
            safePath(roots.origin, LOCAL + '/logs/sync-' + id + '.log'),
          );
        } finally {
          capture(roots.host, host, journal);
        }
      }
      if (fingerprints(roots.base).tree !== verified.tree)
        fail('SUPPLIER_CHANGED_DURING_SYNC', roots.base);
      if (hostDerivationDigest(roots.host, host) !== derivationDigest)
        fail('HOST_INPUT_CHANGED_DURING_SYNC', roots.host);
      const source = {
        ...(needsPackages
          ? {
              sourceRepo: 'base-screen',
              ...revision(roots.base),
              treeDigest: fingerprints(roots.base).tree,
              packageInputsDigest: verified.packages,
              packages: packed.map(({ path: _path, ...entry }) => entry),
            }
          : health.source),
        hostDerivationDigest: derivationDigest,
        lockfiles: Object.fromEntries(
          host.lockfiles.map((name) => [name, fileHash(safePath(roots.host, name))]),
        ),
        managedFiles: Object.fromEntries(
          managedFiles(roots.host, host.managed)
            .filter(
              (name) =>
                name !== SOURCE &&
                name !== SNAPSHOT &&
                !name.endsWith('.tgz') &&
                !host.lockfiles.includes(name),
            )
            .map((name) => [name, fileHash(safePath(roots.host, name))]),
        ),
      };
      writeChanged(safePath(roots.host, SOURCE), json(source));
    }
    const snapshotText = json(upstreamSnapshot(roots.base, verified.packages));
    writeChanged(safePath(roots.host, SNAPSHOT), snapshotText);
    const recordedSource = readJson(join(roots.host, SOURCE));
    recordedSource.contextSnapshotDigest = hash(snapshotText);
    writeChanged(safePath(roots.host, SOURCE), json(recordedSource));
    capture(roots.host, host, journal);
    const finalHealth = sourceHealth(roots.host, host);
    if (!finalHealth.ok) fail('SYNC_VERIFY_FAILED', finalHealth.issues.join(', '));
    journal.state = 'complete';
    writeChanged(safePath(roots.host, journalName), json(journal));
    return { changed: true, packages: needsPackages, context: true, checks };
  } catch (error) {
    capture(roots.host, host, journal);
    try {
      await recoverSync(roots, host, { run });
    } catch (recovery) {
      fail('SYNC_AND_RECOVERY_FAILED', error.message + '; ' + recovery.message);
    }
    throw error;
  }
}

export function validateConsumption(root, host) {
  const mapping = readJson(join(root, CONSUMER));
  if (!Array.isArray(mapping.capabilities)) fail('CONSUMER_INVALID', CONSUMER);
  const ids = new Set();
  for (const item of mapping.capabilities) {
    if (ids.has(item.id)) fail('CONSUMER_DUPLICATE', item.id);
    ids.add(item.id);
    if (!['integrated', 'not-adopted', 'pending'].includes(item.status))
      fail('CONSUMER_STATUS_INVALID', item.id);
    for (const name of item.references || []) {
      if (!existsSync(safePath(root, name))) fail('REFERENCE_MISSING', name);
    }
    for (const id of [...(item.focused || []), ...(item.delivery || [])]) {
      if (!host.commands[id]) fail('CONSUMER_CHECK_UNKNOWN', id);
    }
  }
  return mapping;
}
