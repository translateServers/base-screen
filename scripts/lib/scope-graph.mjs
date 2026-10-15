import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { PACKAGE_DEFINITIONS } from '../check-packages.mjs';

const REPO_ROOT = resolveRepoRoot();

function resolveRepoRoot() {
  // 本模块位于 <root>/scripts/lib/，向上两级即仓库根。
  return join(import.meta.dirname, '..', '..');
}

export function getRepoRoot() {
  return REPO_ROOT;
}

/**
 * 与 check-boundaries.mjs 相同的 import 提取正则：含 import type、export from、裸 side-effect import。
 */
const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * 校验 git 引用是否有效（无效 ref 属退出码 2 的参数/环境错误）。
 */
export function isValidGitRef(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 采集变更文件（相对仓库根的 posix 路径）。git diff <ref> 含工作区改动，不含未跟踪文件。
 */
export function collectDiff(sinceRef) {
  const output = execFileSync('git', ['diff', '--name-only', '--relative', sinceRef], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

/**
 * 遍历目录收集匹配扩展名的文件，返回相对 baseDir 的 posix 路径；目录不存在时返回空数组。
 */
export function listFilesByExtension(baseDir, extensions) {
  const suffixes = new Set(extensions);
  const files = [];
  const visit = (current, relative) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(join(current, entry.name), childRelative);
      } else if (suffixes.has(entry.name.split('.').pop())) {
        files.push(childRelative);
      }
    }
  };
  if (existsSync(baseDir)) visit(baseDir, '');
  return files.sort();
}

/**
 * 列出一个包 tests/ 下全部 .test.ts 文件（相对包目录的 posix 路径）。
 */
export function listPackageTestFiles(rootDir, packageDir) {
  return listFilesByExtension(join(rootDir, 'packages', packageDir, 'tests'), ['ts']).filter(
    (file) => file.endsWith('.test.ts'),
  );
}

/**
 * 变更路径 → 包映射：packages/<dir>/** 归入对应包，其余路径原样返回由治理/跳过逻辑分流。
 */
export function mapToPackages(changedFiles) {
  const byPackage = new Map();
  const other = [];
  for (const file of changedFiles) {
    const match = /^packages\/([^/]+)\//.exec(file);
    if (match && PACKAGE_DEFINITIONS[match[1]]) {
      const bucket = byPackage.get(match[1]) ?? [];
      bucket.push(file);
      byPackage.set(match[1], bucket);
    } else {
      other.push(file);
    }
  }
  return { byPackage, other };
}

/**
 * 从各包 manifest（dependencies/devDependencies/peer/optional）读取 workspace 依赖，
 * 构正向图 dir → dirs[]。check-boundaries 保证 manifest 依赖 ⊆ 白名单，读 manifest 即读真实图。
 */
export function workspaceDependencyGraph(rootDir = REPO_ROOT) {
  const nameToDir = new Map(
    Object.entries(PACKAGE_DEFINITIONS).map(([dir, definition]) => [definition.name, dir]),
  );
  const graph = new Map();
  for (const dir of Object.keys(PACKAGE_DEFINITIONS)) {
    const manifest = JSON.parse(
      readFileSync(join(rootDir, 'packages', dir, 'package.json'), 'utf8'),
    );
    const dependencies = new Set();
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const name of Object.keys(manifest[section] ?? {})) {
        const target = nameToDir.get(name);
        if (target) dependencies.add(target);
      }
    }
    graph.set(dir, [...dependencies]);
  }
  return graph;
}

/**
 * 反向依赖图：dir → 依赖 dir 的包列表。
 */
export function reverseDependencyGraph(graph) {
  const reverse = new Map(Object.keys(PACKAGE_DEFINITIONS).map((dir) => [dir, []]));
  for (const [dir, dependencies] of graph) {
    for (const dependency of dependencies) {
      reverse.get(dependency)?.push(dir);
    }
  }
  return reverse;
}

/**
 * 变更闭包：变更包自身 + 所有（传递地）依赖它的包。
 */
export function downstreamClosure(changedPackages, reverseGraph) {
  const seen = new Set();
  const stack = [...changedPackages];
  while (stack.length > 0) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const dependent of reverseGraph.get(current) ?? []) {
      if (!seen.has(dependent)) stack.push(dependent);
    }
  }
  return [...seen].sort();
}

function addEdge(map, key, value) {
  const bucket = map.get(key) ?? [];
  bucket.push(value);
  map.set(key, bucket);
}

/**
 * 解析 engine 测试文件内指向本包 src/ 的相对导入（含 import type）。
 * 返回：可解析 → posix 相对包根路径；指向 src 之外（fixture 等）→ null；指向 src 但目标缺失 → { unresolvable }。
 */
function resolveEngineImport(testRelativePath, specifier, packageRoot) {
  if (!specifier.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(testRelativePath), specifier));
  const stripped = base.replace(/\.(js|mjs)$/, '');
  if (!stripped.startsWith('src/')) return null;
  // 非 .js/.mjs 目标（.css/.json 等资源）以原路径参与存在性判断。
  const candidates = [base, `${stripped}.ts`, `${stripped}.tsx`, posix.join(stripped, 'index.ts')];
  for (const candidate of candidates) {
    if (existsSync(join(packageRoot, candidate))) return candidate;
  }
  return { unresolvable: stripped };
}

/**
 * 静态解析 engine 全部测试文件的 src 相对导入。
 * 返回 { importEdges, issues, testFiles }；issues 非空即映射失准信号（守护测试断言为空）。
 */
export function collectEngineImports(rootDir = REPO_ROOT) {
  const packageRoot = join(rootDir, 'packages', 'engine');
  const testFiles = listPackageTestFiles(rootDir, 'engine');
  const importEdges = new Map();
  const issues = [];
  for (const testFile of testFiles) {
    // listPackageTestFiles 返回相对 tests/ 的路径；映射内部统一使用相对包根的 'tests/...' 形式。
    const testRelativePath = `tests/${testFile}`;
    const source = readFileSync(join(packageRoot, testRelativePath), 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveEngineImport(testRelativePath, specifier, packageRoot);
      if (resolved === null) continue;
      if (typeof resolved === 'string') {
        addEdge(importEdges, resolved, testRelativePath);
      } else {
        issues.push({
          file: `packages/engine/${testRelativePath}`,
          specifier,
          resolved: resolved.unresolvable,
        });
      }
    }
  }
  return { importEdges, issues, testFiles };
}

/**
 * 构建 engine 文件级映射：import 边 + src/tests 目录镜像表 + 测试目录索引。
 * 零维护：每次运行实时重算（120 文件解析 <1s）。
 */
export function buildEngineFileMap(rootDir = REPO_ROOT) {
  const { importEdges, issues, testFiles } = collectEngineImports(rootDir);
  const packageRoot = join(rootDir, 'packages', 'engine');
  const dirMirrors = new Map();
  const dirIndex = new Map();
  for (const testRelativePath of testFiles) {
    const sourceRelative = `src/${testRelativePath.slice('tests/'.length).replace(/\.test\.ts$/, '.ts')}`;
    const testDir = posix.dirname(testRelativePath);
    const sourceDir = posix.dirname(sourceRelative);
    if (existsSync(join(packageRoot, sourceDir))) {
      addEdge(dirMirrors, sourceDir, testDir);
    }
    addEdge(dirIndex, testDir, testRelativePath);
  }
  return {
    importEdges,
    dirMirrors,
    dirIndex,
    testFiles,
    issues,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 变更 engine 路径 → 测试文件选择。fail-safe：无命中一律回退全包并记录原因，宁可多跑不可漏跑。
 */
export function filterEngineTests(changedEnginePaths, map, rootDir = REPO_ROOT) {
  const sourceFiles = changedEnginePaths.filter((file) => /^packages\/engine\/src\//.test(file));
  const nonSourceFiles = changedEnginePaths.filter(
    (file) => !/^packages\/engine\/src\//.test(file),
  );

  if (sourceFiles.length === 0) {
    return {
      testFiles: [],
      sourceFiles: [],
      precision: 'package',
      fallbackReason:
        changedEnginePaths.length > 0 ? 'ENGINE_NON_SOURCE_CHANGES' : 'ENGINE_SOURCE_UNCHANGED',
    };
  }
  if (nonSourceFiles.length > 0) {
    return {
      testFiles: [],
      sourceFiles,
      precision: 'package',
      fallbackReason: `ENGINE_NON_SOURCE_CHANGES: ${nonSourceFiles.join(', ')}`,
    };
  }

  const packageRoot = join(rootDir, 'packages', 'engine');
  const selected = new Set();
  for (const changed of sourceFiles) {
    const sourceRelative = changed.slice('packages/engine/'.length);
    for (const testRelativePath of map.importEdges.get(sourceRelative) ?? []) {
      selected.add(testRelativePath);
    }
    const mirroredTestFile = `tests/${sourceRelative
      .slice('src/'.length)
      .replace(/\.tsx?$/, '.test.ts')}`;
    if (existsSync(join(packageRoot, mirroredTestFile))) {
      selected.add(mirroredTestFile);
    }
    for (const testDir of map.dirMirrors.get(posix.dirname(sourceRelative)) ?? []) {
      for (const testRelativePath of map.dirIndex.get(testDir) ?? []) {
        selected.add(testRelativePath);
      }
    }
  }

  if (selected.size === 0) {
    return {
      testFiles: [],
      sourceFiles,
      precision: 'package',
      fallbackReason: 'ENGINE_FILE_MAPPING_MISS',
    };
  }
  return {
    testFiles: [...selected].sort().map((file) => `packages/engine/${file}`),
    sourceFiles,
    precision: 'file',
    fallbackReason: undefined,
  };
}

/**
 * 把 glob 风格 pattern（支持 ** 与 *）编译为全匹配 RegExp。
 */
export function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * 静态解析根级 tests/*.test.ts 引用的仓库文件（../scripts/**、../skills/** 等）。
 * 返回 Map<repo 相对路径, 引用它的根测试文件列表>。
 */
export function resolveRootTestImports(rootDir = REPO_ROOT) {
  const testsDir = join(rootDir, 'tests');
  const references = new Map();
  const testFiles = listFilesByExtension(testsDir, ['ts']).filter((file) =>
    file.endsWith('.test.ts'),
  );
  for (const testRelativePath of testFiles) {
    const source = readFileSync(join(testsDir, testRelativePath), 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const base = posix.normalize(posix.join('tests', posix.dirname(testRelativePath), specifier));
      const candidates = [
        base,
        `${base}.mjs`,
        `${base}.ts`,
        `${base}.js`,
        posix.join(base, 'index.ts'),
        posix.join(base, 'index.mjs'),
      ];
      for (const candidate of candidates) {
        if (existsSync(join(rootDir, candidate))) {
          addEdge(references, candidate, `tests/${testRelativePath}`);
          break;
        }
      }
    }
  }
  return references;
}

/**
 * 治理触发判定：config.governanceTriggers 的 glob 模式 + 根测试静态 import 引用双通道。
 * 返回 { runRootTests, reasons, matches: [{file, reason}] }。
 */
export function resolveGovernance(changedOtherPaths, config, rootDir = REPO_ROOT) {
  const triggers = (config.governanceTriggers ?? []).map((trigger) => ({
    ...trigger,
    regex: globToRegExp(trigger.pattern),
  }));
  const references = resolveRootTestImports(rootDir);
  const matches = [];
  const matchedFiles = new Set();
  for (const file of changedOtherPaths) {
    for (const trigger of triggers) {
      if (trigger.regex.test(file)) {
        matches.push({ file, reason: trigger.reason });
        matchedFiles.add(file);
        break;
      }
    }
    if (references.has(file)) {
      const consumers = references.get(file).join(', ');
      matches.push({ file, reason: `根级治理测试直接引用的文件变更（${consumers}）` });
      matchedFiles.add(file);
    }
  }
  const reasons = [...new Set(matches.map((match) => `${match.file}: ${match.reason}`))];
  return { runRootTests: matches.length > 0, reasons, matches };
}

/**
 * 未命中治理且不属于任何包的路径 → 跳过原因归类（消解"是不是漏跑了"疑虑）。
 */
export function categorizeSkipped(file, config) {
  for (const prefix of config.nonGatePrefixes ?? []) {
    if (file.startsWith(prefix))
      return '非门禁分区（examples/harness/tooling/plugins）变更，不进入按需执行链路';
  }
  if (file.startsWith('docs/')) return '文档变更不触发包测试（docs/plans 治理触发除外）';
  if (file.startsWith('scripts/')) return 'scripts 变更未被根级治理测试直接引用';
  if (file.startsWith('.base-screen/')) return '本地运行时产物，不进入按需执行链路';
  return '变更未命中包映射与治理触发（含包外顶层文件），合并前建议运行全量门禁复核';
}

/**
 * 统计一个包 tests/ 下测试文件数（供 estimatedFiles 估算）。
 */
export function countPackageTestFiles(rootDir, packageDir) {
  return listPackageTestFiles(rootDir, packageDir).length;
}

/**
 * 统计根级 tests/ 下测试文件数。
 */
export function countRootTestFiles(rootDir = REPO_ROOT) {
  return listFilesByExtension(join(rootDir, 'tests'), ['ts']).filter((file) =>
    file.endsWith('.test.ts'),
  ).length;
}
