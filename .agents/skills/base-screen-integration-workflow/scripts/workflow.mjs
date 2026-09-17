import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CONFIG,
  CONSUMER,
  changedFiles,
  digestPaths,
  ENTRY,
  fail,
  fileHash,
  fingerprints,
  hash,
  INDEX,
  json,
  LOCAL,
  optionalJson,
  readJson,
  removeFile,
  resolveRoots,
  SKILL,
  SNAPSHOT,
  SOURCE,
  safePath,
  TOOLING,
  validateIndex,
  walk,
  writeChanged,
} from './files.mjs';
import { runCheck, verificationKey } from './runner.mjs';
import {
  hostCommand,
  hostDerivationDigest,
  loadHost,
  sourceHealth,
  supplierCommand,
  synchronize,
  validateConsumption,
} from './sync.mjs';

const routes = ['host', 'upstream', 'both', 'needs-info'];
const stages = ['pending', 'complete', 'not-needed'];
const flags = new Set([
  'base',
  'host',
  'task',
  'capability',
  'goal',
  'route',
  'decision',
  'next',
  'spec',
  'upstream',
  'downstream',
  'profile',
  'json',
  'recover',
  'check',
]);

export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (!flags.has(name) || Object.hasOwn(options, name)) fail('ARGUMENT_INVALID', value);
    if (['json', 'recover', 'check'].includes(name)) options[name] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail('ARGUMENT_VALUE_MISSING', value);
      options[name] = argv[++i];
    }
  }
  if (options.profile && !['focused', 'delivery'].includes(options.profile))
    fail('PROFILE_INVALID', options.profile);
  if (options.route && !routes.includes(options.route)) fail('ROUTE_INVALID', options.route);
  for (const key of ['upstream', 'downstream']) {
    if (options[key] && !stages.includes(options[key])) fail('STAGE_INVALID', key);
  }
  return { command: positional[0] || 'status', argument: positional[1], options };
}

function taskName(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id || '')) fail('TASK_ID_INVALID', String(id));
  return LOCAL + '/tasks/' + id + '.json';
}

function findTask(roots, id) {
  const relative = taskName(id);
  const candidates = [...new Set([roots.origin, roots.base, roots.host])]
    .map((root) => join(root, relative))
    .filter(existsSync);
  if (candidates.length !== 1) fail(candidates.length ? 'TASK_AMBIGUOUS' : 'TASK_MISSING', id);
  return {
    path: candidates[0],
    root: [...new Set([roots.origin, roots.base, roots.host])].find(
      (root) => join(root, relative) === candidates[0],
    ),
    task: readJson(candidates[0]),
  };
}

function baseline(root) {
  if (!existsSync(root)) return null;
  return {
    fingerprint: fingerprints(root).verification,
    modified: Object.fromEntries(
      changedFiles(root).map((name) => [name, fileHash(safePath(root, name))]),
    ),
  };
}

function availableIndex(roots) {
  if (existsSync(join(roots.base, INDEX)))
    return validateIndex(roots.base, readJson(join(roots.base, INDEX)));
  const snapshot = optionalJson(join(roots.host, SNAPSHOT));
  if (!snapshot) fail('CONTEXT_UNAVAILABLE', 'No supplier checkout or consumed snapshot.');
  return snapshot;
}

function toolingHealth(roots) {
  const manifest = optionalJson(join(roots.host, TOOLING));
  if (!manifest) return ['TOOLING_UNREGISTERED'];
  const names = walk(roots.host, SKILL);
  const issues = [];
  if (json(names) !== json(Object.keys(manifest.files).sort())) issues.push('TOOLING_FILE_SET');
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (fileHash(safePath(roots.host, name)) !== digest) issues.push('TOOLING_MODIFIED:' + name);
  }
  if (
    existsSync(roots.base) &&
    digestPaths(roots.base, walk(roots.base, SKILL)) !== manifest.digest
  ) {
    issues.push('TOOLING_UPDATE_AVAILABLE');
  }
  return issues;
}

function assertTooling(roots) {
  const issues = toolingHealth(roots).filter((issue) => issue !== 'TOOLING_UPDATE_AVAILABLE');
  if (issues.length) fail('TOOLING_INVALID', issues.join(', '));
}

export function bootstrap(roots) {
  if (!existsSync(join(roots.base, SKILL))) fail('SUPPLIER_TOOLING_MISSING', roots.base);
  if (!existsSync(join(roots.host, 'package.json'))) fail('HOST_MISSING', roots.host);
  const names = walk(roots.base, SKILL);
  const previous = optionalJson(join(roots.host, TOOLING));
  const existing = walk(roots.host, SKILL);
  if (!previous && existing.length) fail('UNMANAGED_TOOLING', roots.host);
  if (previous) assertTooling(roots);
  const targets = [...new Set([...names, ...existing, CONFIG, TOOLING, 'package.json'])];
  const backups = new Map(
    targets.map((name) => {
      const path = safePath(roots.host, name);
      return [name, existsSync(path) ? readFileSync(path) : null];
    }),
  );
  let changed = false;
  try {
    for (const name of names)
      changed =
        writeChanged(safePath(roots.host, name), readFileSync(safePath(roots.base, name))) ||
        changed;
    for (const name of existing.filter((name) => !names.includes(name))) {
      removeFile(roots.host, name);
      changed = true;
    }
    const manifest = {
      source: 'base-screen',
      digest: digestPaths(roots.base, names),
      files: Object.fromEntries(names.map((name) => [name, fileHash(safePath(roots.base, name))])),
    };
    changed = writeChanged(safePath(roots.host, TOOLING), json(manifest)) || changed;
    if (!existsSync(join(roots.host, CONFIG))) {
      changed =
        writeChanged(
          safePath(roots.host, CONFIG),
          json({
            role: 'consumer',
            peer: '../base-screen',
            adapter: 'scripts/base-screen-integration-host.mjs',
          }),
        ) || changed;
    }
    const packageJson = readJson(join(roots.host, 'package.json'));
    if (
      packageJson.scripts?.integration !== undefined &&
      packageJson.scripts.integration !== ENTRY
    ) {
      fail('ENTRY_CONFLICT', 'package.json scripts.integration');
    }
    if (packageJson.scripts?.integration !== ENTRY) {
      packageJson.scripts = { ...packageJson.scripts, integration: ENTRY };
      changed = writeChanged(join(roots.host, 'package.json'), json(packageJson)) || changed;
    }
    return { ok: true, changed, next: 'pnpm integration status' };
  } catch (error) {
    for (const [name, content] of backups) {
      if (content === null) removeFile(roots.host, name);
      else writeChanged(safePath(roots.host, name), content);
    }
    throw error;
  }
}

export async function inspect(roots, host) {
  const health = sourceHealth(roots.host, host);
  const index = availableIndex(roots);
  const mapping = validateConsumption(roots.host, host);
  const source = existsSync(roots.base) ? fingerprints(roots.base) : undefined;
  const consumed = optionalJson(join(roots.host, SNAPSHOT));
  const tasks = [...new Set([roots.base, roots.host])].filter(existsSync).flatMap((root) =>
    walk(root, LOCAL + '/tasks')
      .map((name) => readJson(join(root, name)))
      .filter((task) => task.state !== 'complete')
      .map((task) => ({ id: task.id, route: task.route, stages: task.stages, next: task.next })),
  );
  const journal = optionalJson(join(roots.host, LOCAL + '/sync-journal.json'));
  const recovery =
    journal && !['complete', 'restored'].includes(journal.state) ? journal.state : null;
  return {
    ok: health.ok && !recovery,
    upstreamAvailable: Boolean(source),
    consumed: {
      state: health.state,
      commit: health.source?.commit || null,
      dirty: health.source?.dirty ?? null,
    },
    pendingPackages: source ? source.packages !== health.source?.packageInputsDigest : null,
    pendingContext: source
      ? source.knowledge !== consumed?.source?.knowledgeDigest ||
        health.source?.hostDerivationDigest !== hostDerivationDigest(roots.host, host)
      : null,
    issues: [...health.issues, ...toolingHealth(roots)],
    recovery,
    capabilities: index.capabilities.map((item) => ({
      id: item.id,
      title: item.title,
      owner: item.owner,
      consumption: mapping.capabilities.find((entry) => entry.id === item.id)?.status || 'pending',
    })),
    tasks,
    next: recovery
      ? 'Inspect recovery journal, then sync --recover'
      : !health.source
        ? 'begin a task, then sync to establish package provenance'
        : 'context <capability>',
  };
}

function context(roots, ids, host) {
  const current = availableIndex(roots);
  const snapshot = optionalJson(join(roots.host, SNAPSHOT));
  const source = optionalJson(join(roots.host, SOURCE));
  const mapping = validateConsumption(roots.host, host);
  return ids.map((id) => {
    const upstream = current.capabilities.find((item) => item.id === id);
    if (!upstream) fail('CAPABILITY_UNKNOWN', id);
    const consumed = snapshot?.capabilities.find((item) => item.id === id);
    return {
      id,
      upstream,
      consumed:
        source && snapshot?.source.packageInputsDigest === source.packageInputsDigest
          ? consumed || null
          : null,
      host: mapping.capabilities.find((item) => item.id === id) || null,
      proposals: (mapping.proposals || []).filter((proposal) => proposal.capabilities.includes(id)),
      note: consumed
        ? 'Current checkout and consumed package context are listed separately.'
        : 'Consumed capability has no verified snapshot; do not assume current API is installed.',
    };
  });
}

function checksFor(roots, host, task, profile) {
  const mapping = validateConsumption(roots.host, host);
  const checks = [];
  if (profile === 'delivery') {
    if (task.route === 'upstream' || task.route === 'both') checks.push(supplierCommand(roots));
    for (const id of host.delivery) checks.push(hostCommand(roots, host, id));
  }
  for (const id of task.capabilities) {
    const item = mapping.capabilities.find((item) => item.id === id);
    if (!item) fail('CONSUMPTION_MAPPING_MISSING', id);
    for (const check of item[profile] || []) checks.push(hostCommand(roots, host, check));
  }
  if (profile === 'focused' && ['upstream', 'both'].includes(task.route)) {
    const index = availableIndex(roots);
    const packages = new Set([
      'contracts',
      'core',
      'engine',
      'renderer',
      'plugin-core',
      'plugin-manager',
      'material',
      'vue',
      'sdk',
      'testing',
    ]);
    for (const capability of index.capabilities.filter((item) =>
      task.capabilities.includes(item.id),
    )) {
      for (const check of capability.checks) {
        if (check !== 'workflow' && !packages.has(check)) fail('SUPPLIER_CHECK_UNKNOWN', check);
        checks.unshift({
          id: 'base-test-' + check,
          repo: 'base',
          cwd: roots.base,
          tool: 'pnpm',
          args:
            check === 'workflow'
              ? ['exec', 'vitest', 'run', 'tests/integration-workflow']
              : ['--filter', '@base-screen/' + check, 'test'],
        });
      }
    }
  }
  return [...new Map(checks.map((check) => [check.id, check])).values()];
}

export async function workflow(argv, { cwd = process.cwd(), run } = {}) {
  const { command, argument, options } = parseArgs(argv);
  const roots = resolveRoots(cwd, options);
  if (command === 'bootstrap') return bootstrap(roots);
  const host = await loadHost(roots.host);
  if (command === 'status') {
    const result = await inspect(roots, host);
    if (options.check && (!result.ok || result.issues.length || result.pendingContext)) {
      fail('INTEGRATION_CHECK_FAILED', json(result));
    }
    return result;
  }
  if (command === 'context')
    return { ok: true, context: context(roots, (argument || '').split(','), host) };
  if (command === 'begin') {
    const id = argument;
    const path = safePath(roots.origin, taskName(id));
    const candidates = [...new Set([roots.base, roots.host])].filter((root) =>
      existsSync(join(root, taskName(id))),
    );
    if (candidates.length && !existsSync(path)) fail('TASK_OWNED_BY_OTHER_REPO', candidates[0]);
    const previous = optionalJson(path);
    if (previous?.state === 'complete') fail('TASK_ALREADY_COMPLETE', id);
    const ids = options.capability?.split(',') || previous?.capabilities;
    if (!ids?.length) fail('CAPABILITY_REQUIRED', '--capability');
    const taskContext = context(roots, ids, host);
    const task = previous || {
      id,
      origin: roots.supplier ? 'base-screen' : 'xjdatahub',
      baseline: { base: baseline(roots.base), host: baseline(roots.host) },
      stages: { upstream: 'pending', downstream: 'pending', joint: 'pending' },
      evidence: [],
      state: 'active',
      route: 'needs-info',
      decision: '',
      goal: '',
    };
    task.capabilities = ids;
    for (const key of ['route', 'goal', 'decision', 'spec', 'next']) {
      if (options[key] !== undefined) task[key] = options[key];
    }
    for (const key of ['upstream', 'downstream']) if (options[key]) task.stages[key] = options[key];
    if (!task.next) task.next = 'Resolve ownership and read the selected references.';
    writeChanged(path, json(task));
    return {
      ok: true,
      task: { id, route: task.route, stages: task.stages, next: task.next },
      context: taskContext,
    };
  }
  const { path, root, task } = findTask(roots, options.task);
  if (task.state === 'complete') fail('TASK_ALREADY_COMPLETE', task.id);
  // Receipts and logs follow the task owner, even when execution starts in its peer.
  roots.origin = root;
  if (command === 'sync') {
    if (task.route === 'needs-info' || !task.decision) fail('BOUNDARY_DECISION_REQUIRED', task.id);
    assertTooling(roots);
    bootstrap(roots);
    const result = await synchronize(roots, host, task, { ...options, run });
    bootstrap(roots);
    task.sync = {
      packageInputsDigest: optionalJson(join(roots.host, SOURCE))?.packageInputsDigest,
      ...result,
    };
    task.stages.joint = 'pending';
    task.next = 'Complete source work, then verify --profile delivery.';
    writeChanged(path, json(task));
    return { ok: true, ...result, next: task.next };
  }
  if (command === 'verify') {
    const profile = options.profile || 'focused';
    if (profile === 'delivery') {
      const status = await inspect(roots, host);
      if (!status.ok || status.pendingPackages || status.pendingContext || status.issues.length) {
        fail('SYNC_REQUIRED', json(status));
      }
    }
    const commands = checksFor(roots, host, task, profile);
    const evidence = [];
    for (const command of commands) evidence.push(await runCheck(roots, command, { run }));
    task.evidence = evidence;
    task.profile = profile;
    task.stages.joint = profile === 'delivery' ? 'complete' : 'pending';
    task.next =
      profile === 'delivery'
        ? 'Review implementation stages, then finish.'
        : 'Complete work and run delivery verification.';
    writeChanged(path, json(task));
    return { ok: true, profile, evidence, next: task.next };
  }
  if (command === 'finish') {
    if (task.route === 'needs-info' || !task.decision) fail('BOUNDARY_DECISION_REQUIRED', task.id);
    if (
      task.stages.upstream === 'pending' ||
      task.stages.downstream === 'pending' ||
      task.profile !== 'delivery' ||
      (['upstream', 'both'].includes(task.route) && task.stages.upstream !== 'complete') ||
      (['host', 'both'].includes(task.route) && task.stages.downstream !== 'complete')
    ) {
      fail('TASK_INCOMPLETE', json(task.stages));
    }
    const status = await inspect(roots, host);
    if (!status.ok || status.pendingPackages || status.pendingContext || status.issues.length)
      fail('INTEGRATION_NOT_READY', json(status));
    for (const command of checksFor(roots, host, task, 'delivery')) {
      const receipt = task.evidence.find((item) => item.id === command.id);
      if (!receipt?.ok || receipt.key !== verificationKey(roots, command))
        fail('VERIFICATION_STALE', command.id);
    }
    task.state = 'complete';
    task.stages.joint = 'complete';
    task.next =
      'No remaining local work. Commit, deployment and production operations are separate.';
    writeChanged(path, json(task));
    return {
      ok: true,
      id: task.id,
      goal: task.goal,
      route: task.route,
      stages: task.stages,
      checks: task.evidence.map(({ id, cached }) => ({ id, cached })),
      next: task.next,
    };
  }
  fail('COMMAND_UNKNOWN', command);
}

export function boundedOutput(value, root, { jsonOutput = false } = {}) {
  const full = json(value);
  if (full.length <= 4000) return full;
  const report = safePath(root, LOCAL + '/reports/' + hash(full) + '.json');
  writeChanged(report, full);
  const output = {
    ok: value.ok ?? true,
    truncated: true,
    report,
    summary: full.slice(0, jsonOutput ? 1800 : 2600),
    next: value.next || 'Read the report only for the selected capability or error.',
  };
  while (json(output).length > 4000)
    output.summary = output.summary.slice(0, Math.floor(output.summary.length * 0.8));
  return json(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const value = await workflow(process.argv.slice(2));
    process.stdout.write(
      boundedOutput(value, process.cwd(), { jsonOutput: process.argv.includes('--json') }),
    );
  } catch (error) {
    const value = { ok: false, error: error.message };
    process.stderr.write(boundedOutput(value, process.cwd(), { jsonOutput: true }));
    process.exitCode = 1;
  }
}
