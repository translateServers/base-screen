import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { PACKAGE_DEFINITIONS } from './check-packages.mjs';
import { writeHostAppVueTarballConsumerFiles } from './host-app-vue-consumer-files.mjs';
import {
  writeTarballConsumerFiles,
  writeVanillaTarballConsumerFiles,
} from './tarball-consumer-files.mjs';

function run(command, args, cwd) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  execFileSync(executable, args, {
    cwd,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}

// Git Bash 自带的 GNU tar 会把 `C:\...` 形式的路径操作数当成远程 `host:file` 去解析
// （报 "Cannot connect to C: resolve failed"），Windows 自带的 bsdtar 则按本地文件处理。
// 交给 tar 的路径一律相对 cwd 传正斜杠，两种 tar 都接受。
function tarOperand(cwd, target) {
  return relative(cwd, target).replace(/\\/g, '/');
}

function listTarballEntries(tarball) {
  const cwd = dirname(tarball);
  return execFileSync('tar', ['-tf', tarOperand(cwd, tarball)], { cwd, encoding: 'utf8' })
    .trim()
    .split(/\r?\n/);
}

function assertTarballContents(tarball) {
  const entries = listTarballEntries(tarball);
  const illegalEntry = entries.find(
    (entry) =>
      !/^package\/(?:dist\/|LICENSE$|package\.json$|README(?:\.md)?$|NOTICE(?:\.md)?$)/.test(entry),
  );
  if (illegalEntry) {
    throw new Error(`TARBALL_UNEXPECTED_FILE: ${illegalEntry}`);
  }
}

function assertContractsSchemaSingularity(tarball) {
  const entries = listTarballEntries(tarball);
  const schemaEntries = entries.filter((entry) => entry.endsWith('screen-document.schema.json'));
  if (schemaEntries.length !== 1) {
    throw new Error(
      `CONTRACTS_SCHEMA_COUNT_INVALID: expected exactly one screen-document.schema.json in the tarball, found ${schemaEntries.length}`,
    );
  }
  if (schemaEntries[0] !== 'package/dist/screen-document.schema.json') {
    throw new Error(`CONTRACTS_SCHEMA_LOCATION_INVALID: ${schemaEntries[0]}`);
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
  const tarballDir = dirname(tarball);
  const args = ['-xzf', tarOperand(tarballDir, tarball), '-C', tarOperand(tarballDir, working)];
  execFileSync('tar', args, { cwd: tarballDir });
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
  execFileSync('tar', ['-czf', tarOperand(working, patched), 'package'], { cwd: working });
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

function tarballSpec(directory) {
  const tarball = packedTarballs.get(directory);
  if (!tarball) {
    throw new Error(`TARBALL_DEPENDENCY_NOT_PACKED: ${directory}`);
  }
  return `file:${tarball.replace(/\\/g, '/')}`;
}

function assertConsumerIsolation(consumer, name, requiredPackages, forbiddenPackages) {
  const code = name.toUpperCase();
  const lockfile = readFileSync(join(consumer, 'pnpm-lock.yaml'), 'utf8');
  if (lockfile.includes('workspace:') || lockfile.includes('link:')) {
    throw new Error(`${code}_TARBALL_WORKSPACE_LINK_FOUND`);
  }
  if (lockfile.includes(root.replace(/\\/g, '/'))) {
    throw new Error(`${code}_TARBALL_SOURCE_PATH_FOUND`);
  }
  for (const directory of requiredPackages) {
    const packageName = `@base-screen/${directory}`;
    if (!lockfile.includes(packageName)) {
      throw new Error(`${code}_TARBALL_PACKAGE_MISSING: ${packageName}`);
    }
    const tarball = packedTarballs.get(directory);
    if (tarball === undefined || !lockfile.includes(basename(tarball))) {
      throw new Error(`${code}_TARBALL_PACKAGE_NOT_PACKED: ${packageName}`);
    }
  }
  for (const forbiddenPackage of forbiddenPackages) {
    if (existsSync(join(consumer, 'node_modules', forbiddenPackage))) {
      throw new Error(`${code}_TARBALL_UNEXPECTED_PACKAGE: ${forbiddenPackage}`);
    }
  }
}

function verifyBridgeTarballConsumer(framework) {
  const consumer = mkdtempSync(join(temporaryRoot, `${framework}-vite-consumer-`));
  writeTarballConsumerFiles(consumer, framework, tarballSpec);
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);
  assertConsumerIsolation(
    consumer,
    framework,
    [
      'contracts',
      'core',
      'engine',
      'material',
      'plugin-core',
      'plugin-manager',
      'plugin-sdk',
      'renderer',
      'sdk',
      framework,
    ],
    [framework === 'react' ? 'vue' : 'react'],
  );
  run('pnpm', ['run', 'typecheck'], consumer);
  run('pnpm', ['run', 'build'], consumer);
  run('pnpm', ['run', 'verify'], consumer);
}

function verifyVanillaTarballConsumer() {
  const consumer = mkdtempSync(join(temporaryRoot, 'vanilla-vite-consumer-'));
  writeVanillaTarballConsumerFiles(consumer, tarballSpec);
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);
  assertConsumerIsolation(
    consumer,
    'vanilla',
    [
      'contracts',
      'core',
      'engine',
      'material',
      'plugin-core',
      'plugin-manager',
      'plugin-sdk',
      'renderer',
      'sdk',
    ],
    ['react', 'react-dom', 'vue'],
  );
  run('pnpm', ['run', 'typecheck'], consumer);
  run('pnpm', ['run', 'build'], consumer);
  run('pnpm', ['run', 'verify'], consumer);
}

/**
 * 宿主自建 Vue 工程的外部消费者校验：复制 `examples/host-app-vue` 前端，依赖换成真实
 * tarball，跑 typecheck / build / 浏览器闭环。它验证的是"宿主写自己的 Vue 应用来用这
 * 套 ABI"，而不是基座自带的 fixture。
 *
 * 后端由 `page.route` 按 REST 契约履约（决策 D6）：该门禁只对包 ABI 与前端接入负责，
 * 后端真实性由 `examples/host-api` 的 jest e2e 覆盖。
 */
function verifyHostAppVueTarballConsumer() {
  const consumer = mkdtempSync(join(temporaryRoot, 'host-app-vue-consumer-'));
  writeHostAppVueTarballConsumerFiles(consumer, tarballSpec, root);
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);
  assertConsumerIsolation(
    consumer,
    'host-app-vue',
    ['contracts', 'material', 'plugin-core', 'plugin-sdk', 'sdk', 'vue'],
    ['react', 'react-dom'],
  );
  run('pnpm', ['run', 'typecheck'], consumer);
  run('pnpm', ['run', 'build'], consumer);
  run('pnpm', ['run', 'verify'], consumer);
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
    if (directory === 'contracts') {
      assertContractsSchemaSingularity(tarball);
    }
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
          packageManager: 'pnpm@11.18.0',
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

const component = (dataSource) => ({
  id: 'c1',
  type: 'acme.kpi-card',
  name: 'Card',
  parentId: null,
  position: { x: 0, y: 0 },
  size: { width: 320, height: 160 },
  rotation: 0,
  zIndex: 1,
  status: { locked: false, hidden: false },
  props: {},
  style: {},
  dataSource,
});
const document = (components) => ({
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components,
  variables: [],
  blueprint: { rules: [] },
});
const hostResource = (binding, includeBinding) => ({
  type: 'host-resource',
  resourceType: 'xj_metric',
  resourceId: 'demo_cpu_usage',
  params: { limit: { kind: 'literal', value: 5 } },
  ...(includeBinding ? { binding } : {}),
});
const nullBindingDocument = document([component(hostResource(null, true))]);
const fullBindingDocument = document([
  component(
    hostResource(
      {
        fields: {
          dimension: ['host_name'],
          measures: ['avg_cpu_usage_percent'],
        },
      },
      true,
    ),
  ),
]);
const missingBindingDocument = document([component(hostResource(null, false))]);

const nullParsed = parseScreenDocument(nullBindingDocument);
if (!nullParsed.ok) {
  throw new Error('contracts: binding null document rejected');
}
const fullParsed = parseScreenDocument(fullBindingDocument);
if (!fullParsed.ok) {
  throw new Error('contracts: full binding document rejected');
}
const missingParsed = parseScreenDocument(missingBindingDocument);
if (missingParsed.ok) {
  throw new Error('contracts: missing binding document accepted');
}
const roundTripped = parseScreenDocument(JSON.parse(serializeScreenDocument(fullParsed.value)));
if (!roundTripped.ok) {
  throw new Error('contracts: full binding round trip failed');
}
const serialized = serializeScreenDocument(nullParsed.value);
if (typeof serialized !== 'string' || serialized.length === 0) {
  throw new Error('contracts: serialization failed');
}
`;
    }
    if (directory === 'core') {
      smokeSource = `import {
  applyScreenDocumentCommand,
  canvasPointToViewport,
  createScreenHistory,
} from '${barePackage}';

const document = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};
const command = applyScreenDocumentCommand(document, {
  type: 'update-canvas',
  patch: { width: 1280 },
});
if (!command.ok || command.document.canvas.width !== 1280) {
  throw new Error('core: command failed');
}
if (createScreenHistory(document).present !== document) {
  throw new Error('core: history failed');
}
if (canvasPointToViewport({ x: 1, y: 1 }, { zoom: 2, offset: { x: 0, y: 0 } }).x !== 2) {
  throw new Error('core: geometry failed');
}
`;
    }
    if (directory === 'plugin-core') {
      smokeSource = `import { parseBaseScreenMaterialManifest } from '${barePackage}';

const result = parseBaseScreenMaterialManifest({
  type: 'base.text',
  tagName: 'base-text',
  name: 'Text',
  category: 'Basic',
  keywords: [],
  defaultSize: { width: 100, height: 50 },
  defaultProps: {},
  defaultStyle: {},
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  styleSchema: { kind: 'object', properties: {}, required: [] },
  stylePanel: [],
  events: [],
  dataCapabilities: ['static'],
  designCapabilities: { resize: true, rotate: true, children: false },
});
if (!result.ok) {
  throw new Error('plugin-core: manifest parse failed');
}
`;
    }
    if (directory === 'plugin-manager') {
      smokeSource = `import { createBaseScreenPluginManager } from '${barePackage}';
import { createBaseScreenRemotePluginSandbox } from '${barePackage}/remote-sandbox';

if (typeof createBaseScreenRemotePluginSandbox !== 'function') {
  throw new Error('plugin-manager: remote sandbox export missing');
}

const manager = createBaseScreenPluginManager({
  instanceId: 'tarball-consumer',
  standaloneMaterialTagNames: [],
  plugins: [],
  grantedCapabilities: {},
  registry: { get: () => undefined },
  createCommandPort: undefined,
});
const result = await manager.activate();
if (!result.ok || manager.snapshot === undefined) {
  throw new Error('plugin-manager: activation failed');
}
await manager.dispose();
`;
    }
    if (directory === 'engine') {
      smokeSource = `import { ScreenProjectController } from '${barePackage}';

let document = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};
const controller = new ScreenProjectController({
  getDocument: () => document,
  replaceDocument: (next) => {
    document = next;
    return { ok: true, value: next, diagnostics: [] };
  },
});
if (!controller.establishDocumentBaseline(document).ok) {
  throw new Error('engine: direct-document baseline failed');
}
if (controller.phase !== 'ready' || controller.dirty) {
  throw new Error('engine: lifecycle controller failed');
}
`;
    }
    await import(`node:fs/promises`).then(({ writeFile }) => writeFile(smoke, smokeSource, 'utf8'));
    run('node', [smoke], consumer);
  }
  verifyVanillaTarballConsumer();
  verifyBridgeTarballConsumer('react');
  verifyBridgeTarballConsumer('vue');
  verifyHostAppVueTarballConsumer();
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
