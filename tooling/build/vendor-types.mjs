import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * 单包分发的声明处理：把内部包的 `.d.ts` 内置到 `dist/_internal/<dir>/`，再把所有
 * `@base-screen/*` 说明符改写成指向内置副本的相对路径。
 *
 * 不用「逐入口滚成一个自包含 .d.ts」：那样同一个类会在每个入口各出现一次，
 * 带私有成员的类因此变成互不兼容的两个类型（跨入口赋值报 TS2375）。
 * 内置目录只保留一份声明，入口之间共享同一类型 identity。
 */
const packageFolder = process.cwd();
const manifest = JSON.parse(readFileSync(join(packageFolder, 'package.json'), 'utf8'));
const internalDirectories = Object.keys(manifest.devDependencies ?? {})
  .filter((name) => name.startsWith('@base-screen/'))
  .map((name) => name.slice('@base-screen/'.length));

const distFolder = join(packageFolder, 'dist');
const internalFolder = join(distFolder, '_internal');

if (!existsSync(distFolder)) {
  throw new Error('VENDOR_TYPES_NO_DIST: 请先完成 tsc 与 vite 构建');
}

/** 每个内部包：export 子路径 → 类型文件相对 dist 的路径。 */
const internalEntryPoints = new Map();
for (const directory of internalDirectories) {
  const sourceManifest = JSON.parse(
    readFileSync(join(packageFolder, '..', directory, 'package.json'), 'utf8'),
  );
  const entryPoints = new Map();
  for (const [exportPath, target] of Object.entries(sourceManifest.exports ?? {})) {
    const types =
      typeof target === 'string'
        ? target
        : typeof target === 'object' && target !== null
          ? target.types
          : undefined;
    if (typeof types !== 'string' || !types.endsWith('.d.ts')) continue;
    // 内置的是各包 dist 的内容本体，所以映射时要去掉 './dist/' 这一层。
    entryPoints.set(exportPath, types.replace(/^\.\//, '').replace(/^dist\//, ''));
  }
  internalEntryPoints.set(directory, entryPoints);
}

rmSync(internalFolder, { force: true, recursive: true });
for (const directory of internalDirectories) {
  const source = join(packageFolder, '..', directory, 'dist');
  if (!existsSync(source)) {
    throw new Error(`VENDOR_TYPES_MISSING_DIST: packages/${directory}/dist 未构建`);
  }
  cpSync(source, join(internalFolder, directory), {
    recursive: true,
    filter: (path) => !path.endsWith('.d.ts.map') && !path.endsWith('.js.map'),
  });
}

function collectDeclarations(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectDeclarations(target));
    else if (entry.name.endsWith('.d.ts')) files.push(target);
  }
  return files;
}

function resolveSpecifier(specifier) {
  const match = /^@base-screen\/([^/]+)(\/.*)?$/.exec(specifier);
  if (match === null) return undefined;
  const [, directory, rawSubpath] = match;
  const entryPoints = internalEntryPoints.get(directory);
  if (entryPoints === undefined) {
    throw new Error(`VENDOR_TYPES_UNKNOWN_PACKAGE: ${specifier}`);
  }
  const subpath = rawSubpath === undefined || rawSubpath.length === 0 ? '.' : `.${rawSubpath}`;
  const types = entryPoints.get(subpath);
  if (types === undefined) {
    throw new Error(`VENDOR_TYPES_UNKNOWN_SUBPATH: ${specifier}`);
  }
  return join(internalFolder, directory, types);
}

let rewrittenFiles = 0;
let rewrittenSpecifiers = 0;
for (const file of collectDeclarations(distFolder)) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(
    /(from |import\()(['"])@base-screen\/[^'"]+\2/g,
    (whole, lead, quote) => {
      const specifier = /@base-screen\/[^'"]+/.exec(whole)?.[0];
      const target = specifier === undefined ? undefined : resolveSpecifier(specifier);
      if (target === undefined) return whole;
      rewrittenSpecifiers += 1;
      let relativePath = relative(dirname(file), target).replaceAll('\\', '/');
      // 声明文件之间的引用要写 .js：TS 会解析到同名 .d.ts，写成 .d.ts 反而报 TS2846。
      if (relativePath.endsWith('.d.ts')) {
        relativePath = `${relativePath.slice(0, -'.d.ts'.length)}.js`;
      }
      if (!relativePath.startsWith('.')) relativePath = `./${relativePath}`;
      return `${lead}${quote}${relativePath}${quote}`;
    },
  );
  if (after !== before) {
    writeFileSync(file, after);
    rewrittenFiles += 1;
  }
}

const remaining = collectDeclarations(distFolder).filter((file) =>
  /(from |import\()(['"])@base-screen\//.test(readFileSync(file, 'utf8')),
);
if (remaining.length > 0) {
  throw new Error(
    `VENDOR_TYPES_LEAK: ${remaining.map((file) => relative(packageFolder, file)).join(', ')}`,
  );
}

console.log(
  `vendored ${internalDirectories.length} packages, rewrote ${rewrittenSpecifiers} specifiers in ${rewrittenFiles} files`,
);
