import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const PACKAGE_DEFINITIONS = Object.freeze({
  contracts: { build: 'tsc', name: '@base-screen/contracts' },
  core: { build: 'tsc', name: '@base-screen/core' },
  renderer: { build: 'vite', name: '@base-screen/renderer' },
  engine: {
    build: 'vite',
    name: '@base-screen/engine',
    sideEffects: ['./dist/host-tokens.css'],
  },
  material: {
    build: 'vite',
    name: '@base-screen/material',
    sideEffects: ['./dist/auto-register.js'],
  },
  'plugin-core': { build: 'tsc', name: '@base-screen/plugin-core' },
  'plugin-manager': { build: 'tsc', name: '@base-screen/plugin-manager' },
  'plugin-sdk': { build: 'tsc', name: '@base-screen/plugin-sdk' },
  'host-kit': { build: 'tsc', name: '@base-screen/host-kit' },
  react: { build: 'vite', name: '@base-screen/react' },
  vue: { build: 'vite', name: '@base-screen/vue' },
  sdk: {
    build: 'vite',
    name: '@base-screen/sdk',
    sideEffects: [
      './dist/auto-register.js',
      './dist/designer-auto-register.js',
      './dist/viewer-auto-register.js',
      './dist/host-tokens.css',
    ],
  },
});

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function readPackage(directory, region = 'packages') {
  const packagePath = join(region, directory, 'package.json');
  return JSON.parse(readFileSync(packagePath, 'utf8'));
}

function collectFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else files.push(target);
    }
  };
  if (existsSync(directory)) visit(directory);
  return files;
}

function assertSourceIsPublishableOnly(directory, region) {
  const source = join(region, directory, 'src');
  for (const file of collectFiles(source)) {
    if (/\.test\.[cm]?tsx?$/.test(file)) {
      fail('SOURCE_TEST_FILE_FORBIDDEN', file);
    }
    if (file.split(/[\\/]/).includes('__fixtures__')) {
      fail('SOURCE_FIXTURE_FORBIDDEN', file);
    }
  }
}

function assertBuildConfigIsSourceOnly(directory, region) {
  const configPath = join(region, directory, 'tsconfig.build.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  if (config.compilerOptions?.rootDir !== 'src') {
    fail('BUILD_TSCONFIG_ROOT_DIR_INVALID', `${region}/${directory}`);
  }
  if (JSON.stringify(config.include) !== JSON.stringify(['src/**/*.ts'])) {
    fail('BUILD_TSCONFIG_INCLUDE_INVALID', `${region}/${directory}`);
  }
  const exclude = config.exclude ?? [];
  for (const required of ['src/**/*.test.ts', 'src/**/__fixtures__/**']) {
    if (!exclude.includes(required)) {
      fail('BUILD_TSCONFIG_EXCLUDE_INVALID', `${region}/${directory} -> ${required}`);
    }
  }
  if (config.compilerOptions?.declaration !== true) {
    fail('BUILD_DECLARATION_REQUIRED', `${region}/${directory}`);
  }
}

function assertDistIsClean(directory, region) {
  const dist = join(region, directory, 'dist');
  for (const file of collectFiles(dist)) {
    if (/\.test\./.test(basename(file)) || file.split(/[\\/]/).includes('__fixtures__')) {
      fail('DIST_TEST_ARTIFACT_FORBIDDEN', file);
    }
  }
}

function assertPublishablePackage(directory, definition, region = 'packages') {
  const manifest = readPackage(directory, region);
  const expectedSideEffects = definition.sideEffects ?? false;

  // 版本不在这里断言：版本是 changesets 的单一来源（release 会把它从 0.0.0 抬到基线段），
  // 在这里钉死一个具体值只会在 release 之后立刻把 M0 门禁变红，且没有额外保护。
  if (manifest.name !== definition.name) {
    fail('PACKAGE_NAME_MISMATCH', `${region}/${directory}`);
  }
  if (manifest.private === true || manifest.type !== 'module') {
    fail('PUBLISH_CONFIGURATION_FORBIDDEN', directory);
  }
  if (
    manifest.publishConfig?.access !== 'public' ||
    manifest.publishConfig?.registry !== 'https://registry.npmjs.org/'
  ) {
    fail('PUBLISH_CONFIGURATION_INVALID', directory);
  }
  if (manifest.license !== 'MIT') {
    fail('PACKAGE_LICENSE_MISMATCH', directory);
  }
  if (manifest.scripts?.publish || manifest.scripts?.prepublishOnly) {
    fail('PUBLISH_CONFIGURATION_FORBIDDEN', `${region}/${directory}`);
  }
  if (
    manifest.repository?.type !== 'git' ||
    manifest.repository?.url !== 'git+https://github.com/translateServers/base-screen.git' ||
    manifest.repository?.directory !== `${region}/${directory}` ||
    manifest.homepage !== 'https://github.com/translateServers/base-screen#readme' ||
    manifest.bugs !== 'https://github.com/translateServers/base-screen/issues'
  ) {
    fail('PACKAGE_METADATA_MISMATCH', `${region}/${directory}`);
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(['dist'])) {
    fail('PACKAGE_FILES_MISMATCH', `${region}/${directory}`);
  }
  if (
    JSON.stringify(manifest.sideEffects) !== JSON.stringify(expectedSideEffects) ||
    manifest.exports?.['.']?.types !== './dist/index.d.ts'
  ) {
    fail('PACKAGE_EXPORT_MISMATCH', `${region}/${directory}`);
  }
  if (manifest.exports?.['.']?.import !== './dist/index.js') {
    fail('PACKAGE_EXPORT_MISMATCH', `${region}/${directory}`);
  }
  if (!existsSync(join(region, directory, 'src', 'index.ts'))) {
    fail('PACKAGE_ENTRY_MISSING', `${region}/${directory}`);
  }
  if (!existsSync(join(region, directory, 'tsconfig.json'))) {
    fail('PACKAGE_TSCONFIG_MISSING', `${region}/${directory}`);
  }
  if (!existsSync(join(region, directory, 'tsconfig.build.json'))) {
    fail('PACKAGE_BUILD_TSCONFIG_MISSING', `${region}/${directory}`);
  }
  if (definition.build === 'vite' && !existsSync(join(region, directory, 'vite.config.ts'))) {
    fail('PACKAGE_VITE_CONFIG_MISSING', `${region}/${directory}`);
  }

  assertSourceIsPublishableOnly(directory, region);
  assertBuildConfigIsSourceOnly(directory, region);
  assertDistIsClean(directory, region);
}

export function validatePackages() {
  const actualDirectories = readdirSync('packages', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedDirectories = Object.keys(PACKAGE_DEFINITIONS).sort();

  if (JSON.stringify(actualDirectories) !== JSON.stringify(expectedDirectories)) {
    fail('PACKAGE_SET_MISMATCH', actualDirectories.join(', '));
  }

  for (const [directory, definition] of Object.entries(PACKAGE_DEFINITIONS)) {
    assertPublishablePackage(directory, definition);
  }
}

if (import.meta.main) {
  validatePackages();
}
