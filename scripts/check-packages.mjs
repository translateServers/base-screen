import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PACKAGE_DEFINITIONS = Object.freeze({
  contracts: { build: 'tsc', name: '@base-screen/contracts' },
  core: { build: 'tsc', name: '@base-screen/core' },
  renderer: { build: 'vite', name: '@base-screen/renderer' },
  engine: { build: 'vite', name: '@base-screen/engine' },
  material: { build: 'vite', name: '@base-screen/material' },
  'plugin-core': { build: 'tsc', name: '@base-screen/plugin-core' },
  'plugin-manager': { build: 'tsc', name: '@base-screen/plugin-manager' },
  'plugin-sdk': { build: 'tsc', name: '@base-screen/plugin-sdk' },
  react: { build: 'vite', name: '@base-screen/react' },
  vue: { build: 'vite', name: '@base-screen/vue' },
  sdk: { build: 'vite', name: '@base-screen/sdk' },
  testing: { build: 'tsc', name: '@base-screen/testing' },
});

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function readPackage(directory) {
  const packagePath = join('packages', directory, 'package.json');
  return JSON.parse(readFileSync(packagePath, 'utf8'));
}

function assertM0Package(directory, definition) {
  const manifest = readPackage(directory);

  if (manifest.name !== definition.name || manifest.version !== '0.0.0') {
    fail('PACKAGE_NAME_MISMATCH', directory);
  }
  if (manifest.private !== true || manifest.type !== 'module') {
    fail('PUBLISH_CONFIGURATION_FORBIDDEN', directory);
  }
  if (manifest.license !== 'MIT') {
    fail('PACKAGE_LICENSE_MISMATCH', directory);
  }
  if (manifest.publishConfig || manifest.scripts?.publish || manifest.scripts?.prepublishOnly) {
    fail('PUBLISH_CONFIGURATION_FORBIDDEN', directory);
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(['dist'])) {
    fail('PACKAGE_FILES_MISMATCH', directory);
  }
  if (manifest.sideEffects !== false || manifest.exports?.['.']?.types !== './dist/index.d.ts') {
    fail('PACKAGE_EXPORT_MISMATCH', directory);
  }
  if (manifest.exports?.['.']?.import !== './dist/index.js') {
    fail('PACKAGE_EXPORT_MISMATCH', directory);
  }
  if (!existsSync(join('packages', directory, 'src', 'index.ts'))) {
    fail('PACKAGE_ENTRY_MISSING', directory);
  }
  if (!existsSync(join('packages', directory, 'tsconfig.json'))) {
    fail('PACKAGE_TSCONFIG_MISSING', directory);
  }
  if (!existsSync(join('packages', directory, 'tsconfig.build.json'))) {
    fail('PACKAGE_BUILD_TSCONFIG_MISSING', directory);
  }
  if (definition.build === 'vite' && !existsSync(join('packages', directory, 'vite.config.ts'))) {
    fail('PACKAGE_VITE_CONFIG_MISSING', directory);
  }
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
    assertM0Package(directory, definition);
  }
}

if (import.meta.main) {
  validatePackages();
}
