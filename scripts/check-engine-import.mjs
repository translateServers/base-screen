import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const engineSource = join(root, 'packages', 'engine', 'src');
const commonRoot = join(engineSource, 'common');
const browserRoot = join(engineSource, 'browser');

// Environment APIs that exist in both browsers and Node, so they carry no DOM coupling.
// Anything outside this list that only a DOM lib can satisfy is reported as a violation.
const UNIVERSAL_GLOBALS = new Set([
  'AbortController',
  'AbortSignal',
  'clearInterval',
  'clearTimeout',
  'queueMicrotask',
  'setInterval',
  'setTimeout',
  'structuredClone',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',
]);

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function collectTypeScriptFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(target);
    }
  };
  visit(directory);
  return files;
}

// Gate 1: compile common/ with the DOM lib withheld. TypeScript resolves every identifier
// through real lexical scope, so domain names such as `document: ScreenDocument` parameters
// stay legal while any genuine browser global surfaces as an unresolved name.
function assertCommonIsEnvironmentAgnostic() {
  const workspace = mkdtempSync(join(tmpdir(), 'base-screen-engine-common-'));
  const configPath = join(workspace, 'tsconfig.json');
  try {
    writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          extends: join(root, 'tsconfig.base.json').split('\\').join('/'),
          compilerOptions: {
            lib: ['ES2022'],
            noEmit: true,
            skipLibCheck: true,
            types: [],
          },
          include: [`${commonRoot.split('\\').join('/')}/**/*.ts`],
        },
        null,
        2,
      )}\n`,
    );

    let output = '';
    try {
      execFileSync(
        process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
        ['exec', 'tsc', '--noEmit', '-p', configPath],
        { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
      );
      return;
    } catch (error) {
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    const unresolved = new Map();
    for (const line of output.split(/\r?\n/)) {
      const match =
        /^(.*?)\((\d+),\d+\): error TS(?:2304|2552|2583|2584): Cannot find name '([^']+)'/.exec(
          line,
        );
      if (match === null) continue;
      const [, file, lineNumber, name] = match;
      if (UNIVERSAL_GLOBALS.has(name)) continue;
      unresolved.set(`${relative(root, resolve(root, file))}:${lineNumber}`, name);
    }

    if (unresolved.size > 0) {
      const detail = [...unresolved].map(([location, name]) => `${location} -> ${name}`).join(', ');
      fail('ENGINE_COMMON_BROWSER_GLOBAL_FORBIDDEN', detail);
    }

    const unexpected = output
      .split(/\r?\n/)
      .filter((line) => /error TS/.test(line) && !/Cannot find name '/.test(line));
    if (unexpected.length > 0) {
      fail('ENGINE_COMMON_PROBE_FAILED', unexpected.join(' | '));
    }
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
}

// Gate 2: the common/ dependency closure must never reach browser/.
function relativeImports(file) {
  const source = readFileSync(file, 'utf8');
  const specifiers = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1].startsWith('.')) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier.replace(/\?.*$/, ''));
  for (const candidate of [base.replace(/\.js$/, '.ts'), `${base}.ts`, base]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

function assertCommonNeverReachesBrowser() {
  const visited = new Set();
  const stack = collectTypeScriptFiles(commonRoot).map((file) => [
    file,
    [relative(engineSource, file)],
  ]);

  while (stack.length > 0) {
    const [file, path] = stack.pop();
    if (visited.has(file)) continue;
    visited.add(file);

    if (file.startsWith(browserRoot)) {
      fail('ENGINE_COMMON_IMPORTS_BROWSER', path.join(' -> '));
    }
    for (const specifier of relativeImports(file)) {
      const target = resolveSpecifier(file, specifier);
      if (target !== undefined) stack.push([target, [...path, relative(engineSource, target)]]);
    }
  }
}

// Gate 3: the published entry must stay free of registration and storage side effects.
async function assertEntryHasNoSideEffects() {
  const registrations = new Map();
  const touchedStorage = [];
  const globals = ['customElements', 'localStorage', 'sessionStorage'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]);

  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: {
      define: (name, constructor) => registrations.set(name, constructor),
      get: (name) => registrations.get(name),
    },
  });
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get: () => {
        touchedStorage.push(name);
        return undefined;
      },
    });
  }

  try {
    await import('../packages/engine/dist/index.js');
  } finally {
    for (const [name, previous] of globals) {
      if (previous === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, previous);
    }
  }

  if (registrations.has('base-screen-designer')) {
    throw new Error('ENGINE_IMPORT_REGISTERED_DESIGNER');
  }
  if (touchedStorage.length > 0) {
    throw new Error(`ENGINE_IMPORT_TOUCHED_STORAGE:${touchedStorage.join(',')}`);
  }
}

assertCommonIsEnvironmentAgnostic();
assertCommonNeverReachesBrowser();
await assertEntryHasNoSideEffects();
