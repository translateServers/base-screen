import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const root = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'base-screen-tarballs-'));

try {
  for (const [directory, definition] of Object.entries(PACKAGE_DEFINITIONS)) {
    const packageDirectory = join(root, 'packages', directory);
    const packageTarballs = join(temporaryRoot, directory);
    mkdirSync(packageTarballs, { recursive: true });
    run('pnpm', ['pack', '--pack-destination', packageTarballs], packageDirectory);
    const tarballName = readdirSync(packageTarballs).find((name) => name.endsWith('.tgz'));
    if (!tarballName) {
      throw new Error(`TARBALL_MISSING: ${directory}`);
    }
    const tarball = join(packageTarballs, tarballName);
    assertTarballContents(tarball);
    run('pnpm', ['exec', 'publint', tarball], root);
    run('pnpm', ['exec', 'attw', '--profile', 'esm-only', tarball], root);

    const consumer = mkdtempSync(join(temporaryRoot, `${directory}-consumer-`));
    writeFileSync(
      join(consumer, 'package.json'),
      `${JSON.stringify({ name: `${directory}-consumer`, private: true, type: 'module' }, null, 2)}\n`,
    );
    run('pnpm', ['add', tarball], consumer);
    const smoke = join(consumer, 'smoke.mjs');
    const barePackage = definition.name;
    await import(`node:fs/promises`).then(({ writeFile }) =>
      writeFile(smoke, `import '${barePackage}';\n`, 'utf8'),
    );
    run('node', [smoke], consumer);
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
