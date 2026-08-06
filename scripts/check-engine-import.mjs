import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
// vendor/ is excluded here and instead validated by tsconfig.vendor.json (ES2022 lib, no DOM)
// plus the static scan in assertVendorIsEnvironmentAgnostic.
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
          exclude: [`${join(commonRoot, 'vendor').split('\\').join('/')}/**/*.ts`],
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

// Gate 1b: vendored code must stay environment-agnostic. tsconfig.vendor.json compiles it with
// an ES2022-only lib; the static scan below rejects direct DOM global usage that a lax
// upstream tsconfig could otherwise hide.
const DOM_GLOBAL_PATTERNS = [
  /\bwindow\./,
  /\bdocument\./,
  /\baddEventListener\b/,
  /\brequestAnimationFrame\b/,
  /\bgetBoundingClientRect\b/,
  /\blocalStorage\b/,
  /\bHTMLElement\b/,
];
function assertVendorIsEnvironmentAgnostic() {
  const vendorRoot = join(commonRoot, 'vendor');
  if (!existsSync(vendorRoot)) return;
  for (const file of collectTypeScriptFiles(vendorRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of DOM_GLOBAL_PATTERNS) {
      if (pattern.test(source)) {
        fail('ENGINE_VENDOR_DOM_GLOBAL_FORBIDDEN', `${relative(engineSource, file)} -> ${pattern}`);
      }
    }
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

// Gate 4: engine sub-layer direction within browser/ and common/.
// Each sub-layer may only depend on itself and the explicitly allowed sibling sub-layers.
const BROWSER_SUBLAYERS = [
  ['ui', []],
  ['styles', []],
  ['viewport', []],
  ['dom', ['ui']],
  ['controllers', ['dom', 'viewport']],
];

const COMMON_SUBLAYERS = [
  ['ui-text', []],
  ['tools', []],
  ['project', []],
  ['events', []],
  ['operations', ['project', 'tools']],
  ['session', ['project', 'operations']],
];

function subLayerOf(file, rootDir, subLayers) {
  const segment = relative(rootDir, file).split(/[\\/]/)[0] ?? '';
  return subLayers.find(([name]) => name === segment);
}

// Pure sub-layer direction check over pre-resolved (from, to) file pairs.
function subLayerDirectionViolations(pairs, rootDir, subLayers) {
  const layerMap = new Map(subLayers);
  const violations = [];
  for (const { from, to } of pairs) {
    const fromLayer = subLayerOf(from, rootDir, subLayers);
    const toLayer = subLayerOf(to, rootDir, subLayers);
    if (fromLayer === undefined || toLayer === undefined) continue;
    const allowed = new Set(layerMap.get(fromLayer[0]));
    allowed.add(fromLayer[0]);
    if (!allowed.has(toLayer[0])) {
      violations.push(`${relative(engineSource, from)} -> ${relative(engineSource, to)}`);
    }
  }
  return violations;
}

function assertSubLayerDirection() {
  const pairs = [];
  for (const rootDir of [browserRoot, commonRoot]) {
    for (const file of collectTypeScriptFiles(rootDir)) {
      for (const specifier of relativeImports(file)) {
        const target = resolveSpecifier(file, specifier);
        if (target !== undefined) pairs.push({ from: file, to: target });
      }
    }
  }
  const violations = subLayerDirectionViolations(pairs, browserRoot, BROWSER_SUBLAYERS).concat(
    subLayerDirectionViolations(pairs, commonRoot, COMMON_SUBLAYERS),
  );
  if (violations.length > 0) {
    fail('ENGINE_SUBLAYER_DIRECTION_FORBIDDEN', violations.join(', '));
  }
}

// Regression: the gate must positively reject a dom -> controllers import.
function assertSubLayerDirectionRegression() {
  const violations = subLayerDirectionViolations(
    [
      {
        from: join(browserRoot, 'dom', 'sample.ts'),
        to: join(browserRoot, 'controllers', 'sample.ts'),
      },
    ],
    browserRoot,
    BROWSER_SUBLAYERS,
  );
  if (violations.length === 0) {
    fail('ENGINE_SUBLAYER_REGRESSION', 'dom -> controllers was not rejected');
  }
}

assertCommonIsEnvironmentAgnostic();
assertVendorIsEnvironmentAgnostic();
assertCommonNeverReachesBrowser();
await assertEntryHasNoSideEffects();
assertSubLayerDirection();
assertSubLayerDirectionRegression();
