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
import { satisfies, validRange } from 'semver';
import { PACKAGE_DEFINITIONS } from '../checks/packages.mjs';

const EXAMPLE_PLUGIN_DIRECTORIES = ['plugin-materials'];

import { writeHostAppVueTarballConsumerFiles } from '../consumer-files/host-app-vue-consumer-files.mjs';
import {
  writeTarballConsumerFiles,
  writeVanillaTarballConsumerFiles,
  writeViewerOnlyTarballConsumerFiles,
} from '../consumer-files/tarball-consumer-files.mjs';
import { assertSingleCopy, readConsumerRange } from './single-copy.mjs';

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
  return (
    Object.entries(PACKAGE_DEFINITIONS).find(([, definition]) => definition.name === name)?.[0] ??
    EXAMPLE_PLUGIN_DIRECTORIES.find((directory) => name === `@base-screen/${directory}`)
  );
}

function readWorkspaceDependencyDirectories(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  })
    .map((name) => packageDirectoryByName(name))
    .filter((candidate) => candidate !== undefined);
}

function workspaceDependencyDirectories(directory) {
  return readWorkspaceDependencyDirectories(join('packages', directory, 'package.json'));
}

// 公共入口不只有 JS：host-tokens.css 是唯一允许的非脚本导出（ADR-0095）。
// ATTW 会把这类入口判为类型解析失败，检查时按入口名排除，其余入口照常校验。
function nonScriptEntrypoints(tarball) {
  const manifest = readTarballManifest(tarball);
  const exportsField = manifest.exports;
  if (!exportsField || typeof exportsField !== 'object') {
    return [];
  }
  return Object.entries(exportsField)
    .filter(([, target]) => typeof target === 'string' && !/\.(?:js|mjs|cjs)$/.test(target))
    .map(([subpath]) => subpath);
}

function readTarballManifest(tarball) {
  const cwd = dirname(tarball);
  return JSON.parse(
    execFileSync('tar', ['-xOf', tarOperand(cwd, tarball), 'package/package.json'], {
      cwd,
      encoding: 'utf8',
    }),
  );
}

function assertTarballDependencySpecs(directory, tarball) {
  const manifest = readTarballManifest(tarball);
  if (
    ['engine', 'sdk'].includes(directory) &&
    !manifest.sideEffects?.includes('./dist/host-tokens.css')
  ) {
    throw new Error(`TARBALL_CSS_SIDE_EFFECT_MISSING: ${directory}`);
  }
  for (const dependencyType of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(manifest[dependencyType] ?? {})) {
      const dependencyDirectory = packageDirectoryByName(name);
      if (/^(?:workspace:|link:|file:)/.test(spec)) {
        throw new Error(`TARBALL_SOURCE_DEPENDENCY_SPEC: ${directory} -> ${name}@${spec}`);
      }
      if (dependencyDirectory === undefined) continue;
      const dependency = readTarballManifest(packedTarballs.get(dependencyDirectory));
      if (validRange(spec) === null || !satisfies(dependency.version, spec)) {
        throw new Error(
          `TARBALL_DEPENDENCY_RANGE_INVALID: ${directory} -> ${name}@${spec}, packed ${dependency.version}`,
        );
      }
      const region = PACKAGE_DEFINITIONS[directory] === undefined ? 'plugins' : 'packages';
      const source = JSON.parse(
        readFileSync(join(root, region, directory, 'package.json'), 'utf8'),
      );
      const original = source[dependencyType]?.[name];
      const prefix = { 'workspace:^': '^', 'workspace:~': '~', 'workspace:*': '' }[original];
      if (prefix !== undefined && spec !== `${prefix}${dependency.version}`) {
        throw new Error(`TARBALL_WORKSPACE_CONVERSION_INVALID: ${directory} -> ${name}@${spec}`);
      }
    }
  }
}

function writeConsumerWorkspaceConfig(consumer) {
  const overrides = [...packedTarballs].map(([directory, tarball]) => {
    const manifest = readTarballManifest(tarball);
    return `  '${manifest.name}': 'file:${tarball.replace(/\\/g, '/')}'`;
  });
  const linker = process.platform === 'win32' ? 'nodeLinker: hoisted\n' : '';
  writeFileSync(
    join(consumer, 'pnpm-workspace.yaml'),
    `${linker}overrides:\n${overrides.join('\n')}\n`,
  );
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

function consumerPackageSpec(directory) {
  return readTarballManifest(packedTarballs.get(directory)).version;
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

/**
 * 单包分发承诺：宿主只装 `base-screen` 一个包，内部实现已内联。
 * 这里盯三件事——运行时依赖里不能再出现 `@base-screen/*`、安装后不能出现
 * `@base-screen` scope 目录、子路径在纯净工程里能真实加载。
 */
function verifySinglePackageConsumer() {
  const consumer = mkdtempSync(join(temporaryRoot, 'single-package-consumer-'));
  writeConsumerWorkspaceConfig(consumer);
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'single-package-consumer',
        private: true,
        type: 'module',
        packageManager: 'pnpm@11.18.0',
        dependencies: { 'base-screen': tarballSpec('base-screen') },
      },
      null,
      2,
    )}\n`,
  );
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);

  const lockfile = readFileSync(join(consumer, 'pnpm-lock.yaml'), 'utf8');
  if (lockfile.includes('workspace:') || lockfile.includes('link:')) {
    throw new Error('SINGLE_PACKAGE_TARBALL_WORKSPACE_LINK_FOUND');
  }
  if (existsSync(join(consumer, 'node_modules', '@base-screen'))) {
    throw new Error('SINGLE_PACKAGE_EXTRA_PACKAGE_INSTALLED: @base-screen');
  }

  const installed = JSON.parse(
    readFileSync(join(consumer, 'node_modules', 'base-screen', 'package.json'), 'utf8'),
  );
  const leaked = Object.keys(installed.dependencies ?? {}).filter((name) =>
    name.startsWith('@base-screen/'),
  );
  if (leaked.length > 0) {
    throw new Error(`SINGLE_PACKAGE_RUNTIME_DEPENDENCY: ${leaked.join(', ')}`);
  }

  writeFileSync(
    join(consumer, 'smoke.mjs'),
    `import { parseScreenDocument } from 'base-screen/contracts';
import { createHttpProjectAdapter, toHostKitSearch } from 'base-screen/host-kit';

if (typeof parseScreenDocument !== 'function') throw new Error('SINGLE_PACKAGE_CONTRACTS_MISSING');
if (typeof createHttpProjectAdapter !== 'function') throw new Error('SINGLE_PACKAGE_HOST_KIT_MISSING');
if (typeof toHostKitSearch !== 'function') throw new Error('SINGLE_PACKAGE_HELPER_MISSING');
const parsed = parseScreenDocument({});
if (typeof parsed.ok !== 'boolean') throw new Error('SINGLE_PACKAGE_PARSE_RESULT_INVALID');
`,
  );
  run('node', ['smoke.mjs'], consumer);
}

function verifyBridgeTarballConsumer(framework) {
  const consumer = mkdtempSync(join(temporaryRoot, `${framework}-vite-consumer-`));
  writeConsumerWorkspaceConfig(consumer);
  writeTarballConsumerFiles(consumer, framework, consumerPackageSpec);
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
  writeConsumerWorkspaceConfig(consumer);
  writeVanillaTarballConsumerFiles(consumer, consumerPackageSpec);
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);
  assertConsumerIsolation(
    consumer,
    'vanilla',
    ['contracts', 'material', 'sdk'],
    ['react', 'react-dom', 'vue'],
  );
  run('pnpm', ['run', 'typecheck'], consumer);
  run('pnpm', ['run', 'build'], consumer);
  run('pnpm', ['run', 'verify'], consumer);
}

function verifyViewerOnlyTarballConsumer() {
  const consumer = mkdtempSync(join(temporaryRoot, 'vue-viewer-only-consumer-'));
  writeConsumerWorkspaceConfig(consumer);
  writeViewerOnlyTarballConsumerFiles(consumer, 'vue', consumerPackageSpec);
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);
  assertConsumerIsolation(
    consumer,
    'vue-viewer-only',
    ['contracts', 'material', 'plugin-core', 'plugin-sdk', 'sdk', 'vue'],
    ['react', 'react-dom'],
  );
  run('pnpm', ['run', 'typecheck'], consumer);
  run('pnpm', ['run', 'build'], consumer);
  run('pnpm', ['run', 'verify'], consumer);
}

/**
 * 宿主自建 Vue 工程的外部消费者校验：复制 `examples/vue-host` 前端，依赖换成真实
 * tarball，跑 typecheck / build / 浏览器闭环。它验证的是"宿主写自己的 Vue 应用来用这
 * 套 ABI"，而不是基座自带的 fixture。
 *
 * 后端由 `page.route` 按 REST 契约履约（决策 D6）：该门禁只对包 ABI 与前端接入负责，
 * 后端真实性由 `examples/shared-backend` 的 jest e2e 覆盖。
 */
function verifyHostAppVueTarballConsumer() {
  const consumer = mkdtempSync(join(temporaryRoot, 'host-app-vue-consumer-'));
  writeConsumerWorkspaceConfig(consumer);
  writeHostAppVueTarballConsumerFiles(consumer, consumerPackageSpec, root);
  run('pnpm', ['install', '--strict-peer-dependencies'], consumer);
  assertConsumerIsolation(
    consumer,
    'vue-host',
    [
      'contracts',
      'host-kit',
      'material',
      'plugin-core',
      'plugin-sdk',
      'plugin-materials',
      'plugin-manager',
      'sdk',
      'vue',
    ],
    ['react', 'react-dom'],
  );
  // echarts 是宿主声明、插件 peer 的共享依赖：宿主与插件必须只用同一份实例（ADR-0097）。
  assertSingleCopy(consumer, 'echarts', readConsumerRange(consumer, 'echarts'));
  run('pnpm', ['run', 'typecheck'], consumer);
  run('pnpm', ['run', 'build'], consumer);
  run('pnpm', ['run', 'verify'], consumer);
}

const root = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'base-screen-tarballs-'));
const packedTarballs = new Map();
// 外围插件不在 packages 固定清单里，但 Vue 宿主会消费它们；外部消费者改写
// `@base-screen/plugin-*` 依赖时必须能解析到同批次 tarball。
try {
  for (const [directory, packageDirectory] of [
    ...packageBuildOrder().map((directory) => [directory, join(root, 'packages', directory)]),
    ...EXAMPLE_PLUGIN_DIRECTORIES.map((directory) => [directory, join(root, 'plugins', directory)]),
  ]) {
    const packageTarballs = join(temporaryRoot, directory);
    mkdirSync(packageTarballs, { recursive: true });
    run('pnpm', ['pack', '--pack-destination', packageTarballs], packageDirectory);
    const tarballName = readdirSync(packageTarballs).find((name) => name.endsWith('.tgz'));
    if (!tarballName) throw new Error(`TARBALL_MISSING: ${directory}`);
    packedTarballs.set(directory, join(packageTarballs, tarballName));
  }

  for (const [directory, tarball] of packedTarballs) {
    assertTarballContents(tarball);
    assertTarballDependencySpecs(directory, tarball);
    if (directory === 'contracts') assertContractsSchemaSingularity(tarball);
    if (PACKAGE_DEFINITIONS[directory] === undefined) continue;
    run('pnpm', ['exec', 'publint', tarball], root);
    const attwArgs = ['exec', 'attw', tarball, '--profile', 'esm-only'];
    const excludedEntrypoints = nonScriptEntrypoints(tarball);
    if (excludedEntrypoints.length > 0)
      attwArgs.push('--exclude-entrypoints', ...excludedEntrypoints);
    run('pnpm', attwArgs, root);
  }

  for (const directory of packageBuildOrder()) {
    const definition = PACKAGE_DEFINITIONS[directory];
    const tarball = tarballSpec(directory);
    const consumer = mkdtempSync(join(temporaryRoot, `${directory}-consumer-`));
    writeConsumerWorkspaceConfig(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: `${directory}-consumer`,
          private: true,
          type: 'module',
          packageManager: 'pnpm@11.18.0',
          dependencies: { [definition.name]: consumerPackageSpec(directory) },
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
  blueprint: { relations: [] },
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
  blueprint: { relations: [] },
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
  blueprint: { relations: [] },
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

  verifySinglePackageConsumer();
  verifyVanillaTarballConsumer();
  verifyViewerOnlyTarballConsumer();
  verifyBridgeTarballConsumer('react');
  verifyBridgeTarballConsumer('vue');
  verifyHostAppVueTarballConsumer();
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
