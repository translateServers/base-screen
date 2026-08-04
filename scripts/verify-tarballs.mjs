import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PACKAGE_DEFINITIONS } from './check-packages.mjs';

function run(command, args, cwd) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  execFileSync(executable, args, {
    cwd,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}

function assertTarballContents(tarball) {
  const entries = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' }).trim().split(/\r?\n/);
  const illegalEntry = entries.find(
    (entry) =>
      !/^package\/(?:dist\/|LICENSE$|package\.json$|README(?:\.md)?$|NOTICE(?:\.md)?$)/.test(entry),
  );
  if (illegalEntry) {
    throw new Error(`TARBALL_UNEXPECTED_FILE: ${illegalEntry}`);
  }
}

function packageDirectoryByName(name) {
  return Object.entries(PACKAGE_DEFINITIONS).find(
    ([, definition]) => definition.name === name,
  )?.[0];
}

function workspaceDependencyDirectories(directory) {
  const manifest = JSON.parse(readFileSync(join('packages', directory, 'package.json'), 'utf8'));
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  })
    .map((name) => packageDirectoryByName(name))
    .filter((candidate) => candidate !== undefined);
}

function patchWorkspaceDependencySpecs(directory, tarball) {
  const dependencies = workspaceDependencyDirectories(directory);
  if (dependencies.length === 0) {
    return tarball;
  }
  const working = mkdtempSync(join(temporaryRoot, `patch-${directory}-`));
  execFileSync('tar', ['-xzf', tarball, '-C', working]);
  const manifestPath = join(working, 'package', 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let changed = false;
  for (const dependencyType of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const entries = manifest[dependencyType];
    if (!entries) {
      continue;
    }
    for (const name of Object.keys(entries)) {
      const dependencyDirectory = packageDirectoryByName(name);
      if (dependencyDirectory === undefined) {
        continue;
      }
      const dependencyTarball = packedTarballs.get(dependencyDirectory);
      if (!dependencyTarball) {
        throw new Error(`TARBALL_DEPENDENCY_NOT_PACKED: ${directory} -> ${name}`);
      }
      entries[name] = `file:${dependencyTarball.replace(/\\/g, '/')}`;
      changed = true;
    }
  }
  if (!changed) {
    return tarball;
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const patched = join(dirname(tarball), `${directory}-patched.tgz`);
  execFileSync('tar', ['-czf', patched, 'package'], { cwd: working });
  return patched;
}

function packageBuildOrder() {
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  const visit = (directory) => {
    if (visited.has(directory)) {
      return;
    }
    if (visiting.has(directory)) {
      throw new Error(`TARBALL_DEPENDENCY_CYCLE: ${directory}`);
    }
    visiting.add(directory);
    for (const dependency of workspaceDependencyDirectories(directory)) {
      visit(dependency);
    }
    visiting.delete(directory);
    visited.add(directory);
    ordered.push(directory);
  };

  for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
    visit(directory);
  }
  return ordered;
}

const root = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'base-screen-tarballs-'));
const packedTarballs = new Map();

try {
  for (const directory of packageBuildOrder()) {
    const definition = PACKAGE_DEFINITIONS[directory];
    const packageDirectory = join(root, 'packages', directory);
    const packageTarballs = join(temporaryRoot, directory);
    mkdirSync(packageTarballs, { recursive: true });
    run('pnpm', ['pack', '--pack-destination', packageTarballs], packageDirectory);
    const tarballName = readdirSync(packageTarballs).find((name) => name.endsWith('.tgz'));
    if (!tarballName) {
      throw new Error(`TARBALL_MISSING: ${directory}`);
    }
    const tarball = join(packageTarballs, tarballName);
    packedTarballs.set(directory, tarball);
    assertTarballContents(tarball);
    run('pnpm', ['exec', 'publint', tarball], root);
    run('pnpm', ['exec', 'attw', '--profile', 'esm-only', tarball], root);

    const installTarball = patchWorkspaceDependencySpecs(directory, tarball);
    packedTarballs.set(directory, installTarball);
    const consumer = mkdtempSync(join(temporaryRoot, `${directory}-consumer-`));
    writeFileSync(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: `${directory}-consumer`,
          private: true,
          type: 'module',
          dependencies: { [definition.name]: `file:${installTarball.replace(/\\/g, '/')}` },
        },
        null,
        2,
      )}\n`,
    );
    run('pnpm', ['install'], consumer);
    const smoke = join(consumer, 'smoke.mjs');
    const barePackage = definition.name;
    let smokeSource = `import '${barePackage}';\n`;
    if (directory === 'contracts') {
      smokeSource = `import { deepStrictEqual } from 'node:assert';
import artifact from '${barePackage}/screen-document.schema.json' with { type: 'json' };
import {
  SCREEN_DOCUMENT_JSON_SCHEMA,
  parseScreenDocument,
  serializeScreenDocument,
} from '${barePackage}';

deepStrictEqual(artifact, SCREEN_DOCUMENT_JSON_SCHEMA);
const document = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};
const parsed = parseScreenDocument(document);
if (!parsed.ok || parsed.diagnostics.length !== 0) {
  throw new Error('contracts: document parse failed');
}
const serialized = serializeScreenDocument(parsed.value);
if (typeof serialized !== 'string' || serialized.length === 0) {
  throw new Error('contracts: serialization failed');
}
`;
    }
    await import(`node:fs/promises`).then(({ writeFile }) => writeFile(smoke, smokeSource, 'utf8'));
    run('node', [smoke], consumer);
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
