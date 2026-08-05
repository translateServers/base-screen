import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_DEFINITIONS } from './check-packages.mjs';

const ALLOWED_WORKSPACE_DEPENDENCIES = Object.freeze({
  contracts: [],
  core: ['contracts'],
  'plugin-core': ['contracts'],
  'plugin-manager': ['contracts', 'plugin-core'],
  'plugin-sdk': ['contracts', 'plugin-core'],
  renderer: ['contracts', 'core', 'plugin-core'],
  engine: ['contracts', 'core', 'renderer', 'plugin-core', 'plugin-manager'],
  material: ['contracts', 'plugin-core', 'plugin-sdk'],
  react: ['contracts', 'plugin-core', 'plugin-sdk'],
  vue: ['contracts', 'plugin-core', 'plugin-sdk'],
  sdk: ['contracts', 'core', 'renderer', 'engine', 'material', 'plugin-manager', 'plugin-sdk'],
  testing: Object.keys(PACKAGE_DEFINITIONS).filter((directory) => directory !== 'testing'),
});

const FRAMEWORK_ROOTS = new Map([
  ['react', 'react'],
  ['react-dom', 'react-dom'],
  ['vue', 'vue'],
]);

const ALLOWED_EXTERNAL_DEPENDENCIES = Object.freeze({
  contracts: ['zod'],
});

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function readManifest(directory) {
  return JSON.parse(readFileSync(join('packages', directory, 'package.json'), 'utf8'));
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

function collectSourceFiles(directory) {
  const roots = [join('packages', directory, 'src'), join('packages', directory, 'tests')];
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

function validateManifestDependencies(directory, manifest, graph) {
  const allowedWorkspaceDependencies = new Set(ALLOWED_WORKSPACE_DEPENDENCIES[directory]);
  const dependencies = [];

  for (const [dependencyName] of dependencyEntries(manifest)) {
    const dependencyDirectory = packageDirectoryByName(dependencyName);
    if (dependencyDirectory) {
      if (dependencyDirectory === 'testing' && directory !== 'testing') {
        fail('TESTING_DEPENDENCY_FORBIDDEN', `${directory} -> ${dependencyName}`);
      }
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

function validateSourceImports(directory, manifest) {
  const declaredDependencies = new Set(dependencyEntries(manifest).map(([name]) => name));
  const buildWithTsc = PACKAGE_DEFINITIONS[directory].build === 'tsc';

  for (const sourceFile of collectSourceFiles(directory)) {
    const source = readFileSync(sourceFile, 'utf8');
    for (const importName of collectImports(source)) {
      if (importName.startsWith('../') && importName.includes('/packages/')) {
        fail('SOURCE_DEEP_IMPORT', `${sourceFile} -> ${importName}`);
      }
      if (
        importName.startsWith('examples/') ||
        importName.startsWith('scripts/') ||
        importName.startsWith('nebula')
      ) {
        fail('FORBIDDEN_SOURCE_ROOT', `${sourceFile} -> ${importName}`);
      }
      if (
        buildWithTsc &&
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
  const graph = new Map();
  for (const directory of Object.keys(PACKAGE_DEFINITIONS)) {
    const manifest = readManifest(directory);
    validateManifestDependencies(directory, manifest, graph);
    validateSourceImports(directory, manifest);
  }
  if (detectCycle(graph)) {
    fail('DEPENDENCY_CYCLE', 'workspace production dependency graph');
  }
}

if (import.meta.main) {
  validateBoundaries();
}
