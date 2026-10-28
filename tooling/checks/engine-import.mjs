import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const engineSource = join(root, 'packages', 'engine', 'src');
const commonRoot = join(engineSource, 'common');
const browserRoot = join(engineSource, 'browser');
const designerElementRoot = join(engineSource, 'designer-element');

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

// Gate 2: a lower layer's dependency closure must never reach a higher layer root.
// designer-element/ is the composition root above browser/ and common/, so both lower
// roots are barred from reaching it in either a direct or a transitive relative import.
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

function assertClosureNeverReaches(rootDir, forbiddenRoot, code) {
  const visited = new Set();
  const stack = collectTypeScriptFiles(rootDir).map((file) => [
    file,
    [relative(engineSource, file)],
  ]);

  while (stack.length > 0) {
    const [file, path] = stack.pop();
    if (visited.has(file)) continue;
    visited.add(file);

    if (file.startsWith(forbiddenRoot)) {
      fail(code, path.join(' -> '));
    }
    for (const specifier of relativeImports(file)) {
      const target = resolveSpecifier(file, specifier);
      if (target !== undefined) stack.push([target, [...path, relative(engineSource, target)]]);
    }
  }
}

function assertLayerClosuresNeverReachUpward() {
  assertClosureNeverReaches(commonRoot, browserRoot, 'ENGINE_COMMON_IMPORTS_BROWSER');
  assertClosureNeverReaches(
    commonRoot,
    designerElementRoot,
    'ENGINE_COMMON_IMPORTS_DESIGNER_ELEMENT',
  );
  assertClosureNeverReaches(
    browserRoot,
    designerElementRoot,
    'ENGINE_BROWSER_IMPORTS_DESIGNER_ELEMENT',
  );
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
    await import('../../packages/engine/dist/index.js');
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
  ['validation', []],
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

// Gate 5: the designer-element/ composition root has an explicitly registered structure.
// Root files and sub-layers are enumerated here so that any new file or directory under
// designer-element/ must consciously update this gate instead of appearing silently.
const DESIGNER_ELEMENT_ROOT_FILES = new Set([
  'base-screen-designer-element.ts',
  'designer-element-public-api.ts',
]);

// api/ implements the custom element's public methods over common types and runtime-owned
// state, so it must stay free of browser/ imports — DOM-facing wiring belongs to runtime/.
// runtime/ orchestrates by calling api/ implementations and owns controller wiring, so it
// may reach browser/ and common/. api/ and runtime/ are deliberately mutually visible inside
// the composition root (api reads runtime state; runtime orchestrates api implementations).
const DESIGNER_ELEMENT_SUBLAYERS = new Map([
  ['api', [commonRoot, designerElementRoot]],
  ['runtime', [commonRoot, browserRoot, designerElementRoot]],
]);

function designerElementSourceKind(file) {
  const segment = relative(designerElementRoot, file).split(/[\\/]/)[0] ?? '';
  if (segment.includes('.')) {
    return DESIGNER_ELEMENT_ROOT_FILES.has(segment) ? 'root' : 'unknown-root-file';
  }
  return DESIGNER_ELEMENT_SUBLAYERS.has(segment) ? segment : 'unknown-sublayer';
}

// Pure structure check over designer-element files and pre-resolved (from, to) import pairs.
function designerElementLayerViolations(files, pairs) {
  const violations = [];
  for (const file of files) {
    const kind = designerElementSourceKind(file);
    if (kind === 'unknown-root-file' || kind === 'unknown-sublayer') {
      violations.push(`${kind}: ${relative(engineSource, file)}`);
    }
  }
  for (const { from, to } of pairs) {
    if (designerElementSourceKind(from) === 'api' && to.startsWith(browserRoot)) {
      violations.push(
        `api-imports-browser: ${relative(engineSource, from)} -> ${relative(engineSource, to)}`,
      );
    }
  }
  return violations;
}

function assertDesignerElementLayering() {
  const files = collectTypeScriptFiles(designerElementRoot);
  const pairs = [];
  for (const file of files) {
    for (const specifier of relativeImports(file)) {
      const target = resolveSpecifier(file, specifier);
      if (target !== undefined) pairs.push({ from: file, to: target });
    }
  }
  const violations = designerElementLayerViolations(files, pairs);
  if (violations.length > 0) {
    fail('ENGINE_DESIGNER_ELEMENT_LAYER_FORBIDDEN', violations.join(', '));
  }
}

// Regression: the gate must positively reject an api -> browser import and an
// unregistered sub-layer directory.
function assertDesignerElementLayeringRegression() {
  const violations = designerElementLayerViolations(
    [join(designerElementRoot, 'surprise', 'module.ts')],
    [
      {
        from: join(designerElementRoot, 'api', 'sample.ts'),
        to: join(browserRoot, 'dom', 'sample.ts'),
      },
    ],
  );
  if (violations.length !== 2) {
    fail('ENGINE_DESIGNER_ELEMENT_REGRESSION', `expected 2 violations, got ${violations.length}`);
  }
}

assertCommonIsEnvironmentAgnostic();
assertVendorIsEnvironmentAgnostic();
assertLayerClosuresNeverReachUpward();
await assertEntryHasNoSideEffects();
assertSubLayerDirection();
assertSubLayerDirectionRegression();
assertDesignerElementLayering();
assertDesignerElementLayeringRegression();
