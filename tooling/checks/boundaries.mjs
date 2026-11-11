import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { PACKAGE_DEFINITIONS } from './packages.mjs';

const ALLOWED_WORKSPACE_DEPENDENCIES = Object.freeze({
  contracts: [],
  core: ['contracts'],
  'plugin-core': ['contracts'],
  'plugin-manager': ['contracts', 'plugin-core'],
  'plugin-sdk': ['contracts', 'plugin-core'],
  'host-kit': ['contracts'],
  renderer: ['contracts', 'core', 'plugin-core'],
  engine: ['contracts', 'core', 'renderer', 'plugin-core', 'plugin-manager'],
  material: ['contracts', 'plugin-core', 'plugin-sdk'],
  react: ['contracts', 'plugin-core', 'plugin-sdk', 'sdk'],
  vue: ['contracts', 'plugin-core', 'plugin-sdk', 'sdk'],
  sdk: [
    'contracts',
    'core',
    'renderer',
    'engine',
    'material',
    'plugin-core',
    'plugin-manager',
    'plugin-sdk',
  ],
});

const FRAMEWORK_ROOTS = new Map([
  ['react', 'react'],
  ['react-dom', 'react-dom'],
  ['vue', 'vue'],
]);

const ALLOWED_EXTERNAL_DEPENDENCIES = Object.freeze({
  contracts: ['zod'],
});

// ADR-0074：外围插件分区。packages 区维持零第三方依赖；plugins 区逐插件显式申报，
// 不接受通配与继承。依赖方向单向：plugins 可用 packages，packages 绝不可用 plugins。
const PLUGIN_ROOT = 'plugins';
const PLUGIN_ALLOWED_WORKSPACE_DEPENDENCIES = Object.freeze([
  'contracts',
  'plugin-core',
  'plugin-sdk',
]);
const PLUGIN_ALLOWED_EXTERNAL_DEPENDENCIES = Object.freeze({
  'plugin-echarts': ['echarts'],
});

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function readManifest(directory) {
  return JSON.parse(readFileSync(join('packages', directory, 'package.json'), 'utf8'));
}

function readPluginManifest(directory) {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, directory, 'package.json'), 'utf8'));
}

function listDirectories(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function packageDirectoryByName(name) {
  return Object.entries(PACKAGE_DEFINITIONS).find(
    ([, definition]) => definition.name === name,
  )?.[0];
}

function dependencyEntries(manifest) {
  return Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  });
}

function frameworkRoot(importName) {
  for (const [root, canonical] of FRAMEWORK_ROOTS) {
    if (importName === root || importName.startsWith(`${root}/`)) {
      return canonical;
    }
  }
  return undefined;
}

export function detectCycle(graph) {
  const visiting = new Set();
  const visited = new Set();

  function visit(node) {
    if (visiting.has(node)) {
      return true;
    }
    if (visited.has(node)) {
      return false;
    }
    visiting.add(node);
    for (const dependency of graph.get(node) ?? []) {
      if (visit(dependency)) {
        return true;
      }
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  return [...graph.keys()].some(visit);
}

function collectSourceFiles(base, directory) {
  const roots = [join(base, directory, 'src'), join(base, directory, 'tests')];
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(target);
      } else if (/\.(?:ts|tsx|vue)$/.test(entry.name)) {
        files.push(target);
      }
    }
  };
  for (const root of roots) {
    if (existsSync(root)) visit(root);
  }
  return files;
}

function collectImports(source) {
  const imports = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    imports.push(match[1]);
  }
  return imports;
}

function validateManifestDependencies(directory, manifest, graph, pluginPackageNames) {
  const allowedWorkspaceDependencies = new Set(ALLOWED_WORKSPACE_DEPENDENCIES[directory]);
  const dependencies = [];

  for (const [dependencyName] of dependencyEntries(manifest)) {
    if (pluginPackageNames.has(dependencyName)) {
      fail('PLUGIN_DEPENDENCY_FORBIDDEN', `${directory} -> ${dependencyName}`);
    }
    const dependencyDirectory = packageDirectoryByName(dependencyName);
    if (dependencyDirectory) {
      if (!allowedWorkspaceDependencies.has(dependencyDirectory)) {
        fail('FORBIDDEN_WORKSPACE_DEPENDENCY', `${directory} -> ${dependencyName}`);
      }
      dependencies.push(dependencyDirectory);
      continue;
    }

    const framework = frameworkRoot(dependencyName);
    if (framework) {
      const allowed =
        (directory === 'react' && (framework === 'react' || framework === 'react-dom')) ||
        (directory === 'vue' && framework === 'vue');
      if (!allowed) {
        fail('FORBIDDEN_EXTERNAL_DEPENDENCY', `${directory} -> ${dependencyName}`);
      }
      continue;
    }

    if (!ALLOWED_EXTERNAL_DEPENDENCIES[directory]?.includes(dependencyName)) {
      fail('FORBIDDEN_EXTERNAL_DEPENDENCY', `${directory} -> ${dependencyName}`);
    }
  }

  graph.set(directory, dependencies);
}

// 外围插件：workspace 依赖限制在稳定契约面，外部依赖必须逐插件显式申报（ADR-0074 决策 2、6）。
function validatePluginManifestDependencies(directory, manifest) {
  for (const [dependencyName] of dependencyEntries(manifest)) {
    const dependencyDirectory = packageDirectoryByName(dependencyName);
    if (dependencyDirectory) {
      if (!PLUGIN_ALLOWED_WORKSPACE_DEPENDENCIES.includes(dependencyDirectory)) {
        fail('FORBIDDEN_PLUGIN_WORKSPACE_DEPENDENCY', `${directory} -> ${dependencyName}`);
      }
      continue;
    }
    if (frameworkRoot(dependencyName)) {
      fail('FORBIDDEN_PLUGIN_EXTERNAL_DEPENDENCY', `${directory} -> ${dependencyName}`);
    }
    if (!PLUGIN_ALLOWED_EXTERNAL_DEPENDENCIES[directory]?.includes(dependencyName)) {
      fail('FORBIDDEN_PLUGIN_EXTERNAL_DEPENDENCY', `${directory} -> ${dependencyName}`);
    }
  }
}

function validateSourceImports(base, directory, manifest, requireExtension) {
  const declaredDependencies = new Set(dependencyEntries(manifest).map(([name]) => name));
  const root = `${base}/${directory}`;
  const isPlugin = base === PLUGIN_ROOT;

  for (const sourceFile of collectSourceFiles(base, directory)) {
    const source = readFileSync(sourceFile, 'utf8');
    const normalizedFile = sourceFile.split(/[\\/]/).join('/');
    for (const importName of collectImports(source)) {
      if (importName.startsWith('../') && importName.includes(`/${base}/`)) {
        fail('SOURCE_DEEP_IMPORT', `${sourceFile} -> ${importName}`);
      }
      if (
        importName.startsWith('examples/') ||
        importName.startsWith('tooling/') ||
        importName.startsWith('nebula')
      ) {
        fail('FORBIDDEN_SOURCE_ROOT', `${sourceFile} -> ${importName}`);
      }
      // 外围插件之间不允许相对路径互相引用：只能经各自声明的工作区依赖协作。
      if (isPlugin && importName.startsWith('.')) {
        const target = posix.normalize(posix.join(posix.dirname(normalizedFile), importName));
        if (target !== root && !target.startsWith(`${root}/`)) {
          fail('PLUGIN_RELATIVE_IMPORT_ESCAPE', `${sourceFile} -> ${importName}`);
        }
      }
      if (
        requireExtension &&
        importName.startsWith('.') &&
        !importName.endsWith('.js') &&
        !importName.endsWith('.json')
      ) {
        fail('EXTENSIONLESS_ESM_IMPORT', `${sourceFile} -> ${importName}`);
      }
      const dependencyDirectory = packageDirectoryByName(importName);
      const framework = frameworkRoot(importName);
      if (
        (dependencyDirectory || framework) &&
        !declaredDependencies.has(importName) &&
        !declaredDependencies.has(framework)
      ) {
        fail('UNDECLARED_DEPENDENCY', `${sourceFile} -> ${importName}`);
      }
    }
  }
}

export function validateBoundaries() {
  const pluginManifests = new Map(
    listDirectories(PLUGIN_ROOT).map((directory) => [directory, readPluginManifest(directory)]),
  );
  const pluginPackageNames = new Set(
    [...pluginManifests.values()].map((manifest) => manifest.name),
  );

  const graph = new Map();
  for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
    const manifest = readManifest(directory);
    validateManifestDependencies(directory, manifest, graph, pluginPackageNames);
    validateSourceImports(
      'packages',
      directory,
      manifest,
      PACKAGE_DEFINITIONS[directory].build === 'tsc',
    );
  }
  for (const [directory, manifest] of pluginManifests) {
    validatePluginManifestDependencies(directory, manifest);
    validateSourceImports(PLUGIN_ROOT, directory, manifest, false);
  }
  if (detectCycle(graph)) {
    fail('DEPENDENCY_CYCLE', 'workspace production dependency graph');
  }
}

if (import.meta.main) {
  validateBoundaries();
}
