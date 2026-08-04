import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type UserConfig } from 'vite';

interface PackageManifest {
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

function readManifest(packageRoot: string): PackageManifest {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as PackageManifest;
}

function collectExternalPackages(manifest: PackageManifest): readonly string[] {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  });
}

export function createViteLibraryConfig(
  packageRoot: string,
  entries: string | Record<string, string> = join(packageRoot, 'src/index.ts'),
): UserConfig {
  const externalPackages = collectExternalPackages(readManifest(packageRoot));

  return defineConfig({
    build: {
      emptyOutDir: false,
      lib: {
        entry: entries,
        formats: ['es'],
        fileName: (_format, entryName) => (entryName === 'index' ? 'index.js' : `${entryName}.js`),
      },
      sourcemap: true,
      target: 'baseline-widely-available',
      rolldownOptions: {
        external: (id) =>
          id.startsWith('node:') ||
          externalPackages.some(
            (packageName) => id === packageName || id.startsWith(`${packageName}/`),
          ),
      },
    },
  });
}
