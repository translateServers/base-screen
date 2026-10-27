import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { PACKAGE_DEFINITIONS } from '../checks/packages.mjs';
import { getRepoRoot, listPackageTestFiles } from './scope-graph.mjs';
import { loadSelectionHistory } from './scope-report.mjs';

/**
 * 规则权重（§6 文件级综合分 = Σ(规则权重 × 置信度)）。
 */
export const RULE_WEIGHTS = Object.freeze({
  SOURCE_DELETED: 0.9,
  API_UNRESOLVED: 0.6,
  NO_SELECTION_90D: 0.5,
  LONG_SKIP: 0.7,
  TODO_ONLY: 0.6,
  EMPTY_ASSERT: 0.5,
});

const HIGH_CONFIDENCE_ZONE = 0.7;
const OBSERVE_ZONE = 0.4;

const DEFAULT_THRESHOLDS = Object.freeze({
  noSelectionDays: 90,
  duplicateJaccard: 0.85,
  longSkipDays: 60,
});

/**
 * 文件级综合分分区：≥0.7 高置信候选区、0.4–0.7 观察区、<0.4 仅记录。
 */
export function scoreZone(score) {
  if (score >= HIGH_CONFIDENCE_ZONE) return 'high';
  if (score >= OBSERVE_ZONE) return 'observe';
  return 'record';
}

/**
 * 汇总一个文件命中的多条规则为 { score, zone }。
 */
export function scoreFileRuleHits(ruleHits) {
  let score = 0;
  for (const hit of ruleHits) {
    score += (RULE_WEIGHTS[hit.rule] ?? 0.5) * (hit.confidence ?? 0.5);
  }
  score = Math.min(1, Math.round(score * 100) / 100);
  return { score, zone: scoreZone(score) };
}

/**
 * 仓库相对 posix 路径下收集全部包测试文件。
 */
export function collectAllPackageTestFiles(rootDir) {
  const files = [];
  for (const packageDir of Object.keys(PACKAGE_DEFINITIONS)) {
    for (const file of listPackageTestFiles(rootDir, packageDir)) {
      files.push(`packages/${packageDir}/tests/${file}`);
    }
  }
  return files.sort();
}

const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;

function packageNameToDir(name) {
  if (PACKAGE_DEFINITIONS[name]) return name;
  return Object.entries(PACKAGE_DEFINITIONS).find(
    ([, definition]) => definition.name === name,
  )?.[0];
}

function toPosix(value) {
  return value.split(/[\\/]/).join('/');
}

/**
 * 一次 git log 遍历得到每个文件的最近提交时间（Map<repo 相对路径, ISO 日期>）。
 */
export function collectLastCommitDates(rootDir) {
  const dates = new Map();
  try {
    const output = execFileSync('git', ['log', '--pretty=format:%cI', '--name-only'], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let currentDate;
    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
        currentDate = line.trim();
      } else if (currentDate) {
        const file = toPosix(line.trim());
        if (!dates.has(file)) dates.set(file, currentDate);
      }
    }
  } catch {
    // git 不可用时返回空 Map，规则降级为无 since。
  }
  return dates;
}

/**
 * 文件内某模式首次出现的大致日期（git log -S 首现近似），失败时回退文件最近提交时间。
 */
function firstIntroducedDate(rootDir, file, pattern, lastCommitDates) {
  try {
    const output = execFileSync(
      'git',
      ['log', '--reverse', '--format=%cI', `-S${pattern}`, '--', file],
      { cwd: rootDir, encoding: 'utf8' },
    );
    const first = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) return first;
  } catch {
    // 回退到文件最近提交时间。
  }
  return lastCommitDates.get(file);
}

function daysBetween(isoDate, now) {
  if (!isoDate) return null;
  return Math.floor((now.getTime() - new Date(isoDate).getTime()) / 86_400_000);
}

/**
 * 解析测试文件相对导入，返回指向 src 的候选路径与解析结果。
 */
function resolveRelativeImport(file, specifier, rootDir) {
  if (!specifier.startsWith('.')) return null;
  const fileDir = posix.dirname(file);
  const base = posix.normalize(posix.join(fileDir, specifier));
  const stripped = base.replace(/\.(js|mjs)$/, '');
  // 非脚本资源（.json/.css 等）目标以原路径参与存在性判断。
  const candidates = [base, `${stripped}.ts`, `${stripped}.tsx`, posix.join(stripped, 'index.ts')];
  for (const candidate of candidates) {
    if (existsSync(join(rootDir, candidate))) return { resolved: candidate };
  }
  return { resolved: null, base: stripped };
}

/**
 * SOURCE_DELETED：测试相对导入指向 src 的目标已不存在。
 */
export function detectSourceDeleted(testFiles, rootDir) {
  const candidates = [];
  for (const file of testFiles) {
    const source = readFileSync(join(rootDir, file), 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveRelativeImport(file, specifier, rootDir);
      if (resolved === null) continue;
      if (resolved.resolved === null && resolved.base.includes('/src/')) {
        candidates.push({
          file,
          rule: 'SOURCE_DELETED',
          detail: `相对导入目标不存在：${resolved.base}（来自 ${specifier}）`,
          confidence: 0.9,
        });
      }
    }
  }
  return candidates;
}

/**
 * API_UNRESOLVED：测试 import 的 @base-screen/* 符号在该包 golden API 报告（etc/*.api.md）中不可解析。
 */
export function detectApiUnresolved(testFiles, rootDir) {
  const apiFaceCache = new Map();
  // golden API 报告（packages/<dir>/etc/*.api.md）作为符号存在性参照面，不重新实现 api-extractor。
  const goldenFace = (packageDir) => {
    if (apiFaceCache.has(packageDir)) return apiFaceCache.get(packageDir);
    const etcDir = join(rootDir, 'packages', packageDir, 'etc');
    if (!existsSync(etcDir)) {
      apiFaceCache.set(packageDir, null);
      return null;
    }
    let combined = '';
    for (const entry of readdirSync(etcDir)) {
      if (entry.endsWith('.api.md')) {
        combined += readFileSync(join(etcDir, entry), 'utf8');
        combined += '\n';
      }
    }
    apiFaceCache.set(packageDir, combined);
    return combined;
  };

  const candidates = [];
  const namedImportPattern =
    /import\s+(?:type\s+)?\{([^}]+)\}\s*from\s*['"](@base-screen\/[a-z-]+)['"]/g;
  for (const file of testFiles) {
    const source = readFileSync(join(rootDir, file), 'utf8');
    for (const match of source.matchAll(namedImportPattern)) {
      // 符号的存在性要对导入目标包的 golden 报告核对，而不是测试所在包。
      const targetPackage = packageNameToDir(match[2]);
      if (!targetPackage) continue;
      const packageName = PACKAGE_DEFINITIONS[targetPackage].name;
      const symbols = match[1]
        .split(',')
        .map((symbol) =>
          symbol
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0]
            .trim(),
        )
        .filter(Boolean);
      for (const symbol of symbols) {
        if (symbol.includes(' ')) continue;
        const face = goldenFace(targetPackage);
        if (face === null) continue; // 该包无 golden 报告参照面，跳过规则
        const boundary = new RegExp(`\\b${symbol.replace(/\$/g, '\\$')}\\b`);
        if (!boundary.test(face)) {
          candidates.push({
            file,
            rule: 'API_UNRESOLVED',
            detail: `从 ${packageName} 导入的符号在 golden API 报告中不可解析：${symbol}`,
            confidence: 0.7,
          });
        }
      }
    }
  }
  return candidates;
}

/**
 * NO_SELECTION_90D：连续 N 天未被 test-scope 选中且非治理类。
 * 无历史数据时以文件最近一次 git 提交时间近似（上线初期，置信度下调并标注）。
 */
export function detectNoSelection(testFiles, rootDir, thresholds, now = new Date()) {
  const history = loadSelectionHistory(rootDir);
  const lastCommitDates = collectLastCommitDates(rootDir);
  const candidates = [];
  for (const file of testFiles) {
    const lastSelected = history.get(file);
    if (lastSelected) {
      const idleDays = daysBetween(lastSelected, now);
      if (idleDays !== null && idleDays >= thresholds.noSelectionDays) {
        candidates.push({
          file,
          rule: 'NO_SELECTION_90D',
          detail: `最近一次被按需执行选中已是 ${idleDays} 天前（${lastSelected}）`,
          confidence: 0.6,
        });
      }
      continue;
    }
    const lastCommit = lastCommitDates.get(file);
    const idleDays = daysBetween(lastCommit, now);
    if (idleDays !== null && idleDays >= thresholds.noSelectionDays) {
      candidates.push({
        file,
        rule: 'NO_SELECTION_90D',
        detail: `无选择历史，以最近一次 git 提交近似：约 ${idleDays} 天未变更`,
        confidence: 0.4,
      });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// 重复检测：词法归一化 → it/test 块切分 → 断言骨架 MD5 精确分组 → 5-shingle Jaccard 近重复。
// ---------------------------------------------------------------------------

/**
 * 词法归一化：去注释、压缩空白，按需保留或抹平字符串与模板字面量内容。
 * 引号扫描用单次字符扫描（按出现顺序配对同类引号，跨引号转义安全），
 * 避免"双引号串内撇号被误当单引号串起点、吞掉后续 expect"的错序问题。
 *
 * 默认 `preserveStrings: false` 用于空断言检测：只关心是否出现 expect，字面量内容无关。
 * 重复检测必须传 `preserveStrings: true`，否则 `toBe('A')` 与 `toBe('B')` 会塌成同一骨架。
 */
export function normalizeChunk(text, { preserveStrings = false } = {}) {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  let out = '';
  let index = 0;
  while (index < withoutComments.length) {
    const ch = withoutComments[index];
    if (ch === '"' || ch === "'" || ch === '`') {
      let close = index + 1;
      while (close < withoutComments.length) {
        if (withoutComments[close] === '\\') {
          close += 2;
          continue;
        }
        if (withoutComments[close] === ch) break;
        close += 1;
      }
      if (preserveStrings) {
        out += withoutComments.slice(index, Math.min(close + 1, withoutComments.length));
      } else {
        out += ch === '`' ? '``' : ch === '"' ? '""' : "''";
      }
      index = Math.min(close + 1, withoutComments.length);
      continue;
    }
    out += ch;
    index += 1;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 按顶层 it/test 调用起点切块（块边界近似即可，骨架提取不受重叠影响）。
 * 双重防误切：① 负向后行排除成员调用（`/regex/.test(x)` 的 `test` 前有 `.`）；
 * ② 要求 `(` 后紧跟引号，排除标题字符串内的 "…it (…)"（会把真实块腰斩）。
 */
export function splitTestBlocks(source) {
  const starts = [];
  const pattern =
    /(?<!\.)\b(?:it|test)(?:\.(?:skip|todo|only|concurrent|fails|each\b[^(\n]*))*\s*\(\s*['"`]/g;
  for (const match of source.matchAll(pattern)) {
    starts.push(match.index);
  }
  const blocks = [];
  for (const [index, start] of starts.entries()) {
    const end = index + 1 < starts.length ? starts[index + 1] : source.length;
    blocks.push(source.slice(start, end));
  }
  return blocks;
}

/**
 * 断言骨架：expect(...)/expectTypeOf(...) 调用序列 + matcher 链名及其归一化期望参数。
 * 期望值参与哈希（expect(x).toBe(true) 与 toBe(false) 不同骨架），否则相反断言会被误判重复。
 * 单条断言（或总长 <40）区分度不足，返回空串以跳过分组。
 */
export function assertionSkeleton(normalizedBlock) {
  const parts = [];
  const assertionPattern =
    /\b(expect|expectTypeOf)\(([^()]*)\)((?:\.[\w$]+(?:\.[\w$]+)*\([^()]*\))+)/g;
  for (const match of normalizedBlock.matchAll(assertionPattern)) {
    const head = match[1] === 'expectTypeOf' ? 'typeOf' : 'expect';
    const target = match[2];
    for (const chained of match[3].matchAll(/\.([\w$]+(?:\.[\w$]+)*)\(([^()]*)\)/g)) {
      parts.push(`${head}(${target}).${chained[1]}(${chained[2]})`);
    }
  }
  if (parts.length < 2) return '';
  parts.sort();
  const skeleton = parts.join('; ');
  return skeleton.length >= 40 ? skeleton : '';
}

function shingles(normalizedBlock, size = 5) {
  const tokens = normalizedBlock
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const set = new Set();
  for (let index = 0; index + size <= tokens.length; index += 1) {
    set.add(tokens.slice(index, index + size).join(' '));
  }
  return set;
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let intersection = 0;
  for (const value of small) {
    if (large.has(value)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function sortDuplicateGroups(pairGroups) {
  return [...pairGroups.values()].sort(
    (a, b) => b.similarity - a.similarity || a.files.join('|').localeCompare(b.files.join('|')),
  );
}

/**
 * 纯重复分组（§6.2）：输入已切好的测试块，输出按文件对去重的重复组。
 *
 * 精确骨架组必须同时满足正文 5-shingle Jaccard ≥ 阈值：断言形状相同但夹具/解析入口
 * 不同的用例不是重复。近重复阶段同样按文件对去重，避免同一对文件报出多组。
 */
export function groupDuplicateBlocks(blocks, thresholds) {
  const pairGroups = new Map();
  const record = (files, similarity, basis) => {
    const unique = [...new Set(files)].sort();
    if (unique.length < 2) return;
    const key = unique.join('|');
    const rounded = Math.round(similarity * 100) / 100;
    const previous = pairGroups.get(key);
    if (previous === undefined) {
      pairGroups.set(key, { files: unique, similarity: rounded, basis });
      return;
    }
    pairGroups.set(key, {
      files: unique,
      similarity: Math.max(previous.similarity, rounded),
      // 同一文件对既有精确骨架组又有近重复块时，以精确组的名义输出。
      basis: previous.basis === 'assertion-hash' ? 'assertion-hash' : basis,
    });
  };

  const byHash = new Map();
  for (const block of blocks) {
    const hash = createHash('md5').update(block.skeleton).digest('hex');
    byHash.set(hash, (byHash.get(hash) ?? []).concat(block));
  }
  const shingleCache = new Map();
  const blockShingles = (block) => {
    if (!shingleCache.has(block)) shingleCache.set(block, shingles(block.normalized));
    return shingleCache.get(block);
  };
  for (const group of byHash.values()) {
    const blocksByFile = new Map();
    for (const block of group) {
      blocksByFile.set(block.file, (blocksByFile.get(block.file) ?? []).concat(block));
    }
    const files = [...blocksByFile.keys()].sort();
    if (files.length < 2) continue;
    const similarities = [];
    for (let i = 0; i < files.length; i += 1) {
      for (let j = i + 1; j < files.length; j += 1) {
        let best = 0;
        for (const a of blocksByFile.get(files[i])) {
          for (const b of blocksByFile.get(files[j])) {
            best = Math.max(best, jaccard(blockShingles(a), blockShingles(b)));
          }
        }
        similarities.push(best);
      }
    }
    const minimum = Math.min(...similarities);
    if (minimum >= thresholds.duplicateJaccard) record(files, minimum, 'assertion-hash');
  }

  if (blocks.length > 2000) return sortDuplicateGroups(pairGroups); // 组合爆炸保护：超大包跳过近重复阶段

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.file === b.file) continue; // 同文件近重复不构成跨文件清理候选
      if (a.skeleton === b.skeleton) continue; // 已被精确分组覆盖
      if (
        Math.abs(a.normalized.length - b.normalized.length) >
        Math.max(a.normalized.length, b.normalized.length) * 0.5
      ) {
        continue;
      }
      const similarity = jaccard(blockShingles(a), blockShingles(b));
      if (similarity >= thresholds.duplicateJaccard) {
        record([a.file, b.file], similarity, 'shingle-jaccard');
      }
    }
  }

  return sortDuplicateGroups(pairGroups);
}

/**
 * 重复检测（§6.2）。仅在同一包内比较；块规模超上限时跳过 shingle 阶段防组合爆炸。
 */
export function detectDuplicates(rootDir, thresholds) {
  const duplicateGroups = [];
  for (const packageDir of Object.keys(PACKAGE_DEFINITIONS)) {
    const packageFiles = listPackageTestFiles(rootDir, packageDir);
    const blocks = [];
    for (const file of packageFiles) {
      const source = readFileSync(join(rootDir, 'packages', packageDir, 'tests', file), 'utf8');
      for (const block of splitTestBlocks(source)) {
        const normalized = normalizeChunk(block, { preserveStrings: true });
        const skeleton = assertionSkeleton(normalized);
        if (!skeleton) continue;
        blocks.push({ file: `packages/${packageDir}/tests/${file}`, skeleton, normalized });
      }
    }
    duplicateGroups.push(...groupDuplicateBlocks(blocks, thresholds));
  }
  return duplicateGroups;
}

/**
 * 过期检测：LONG_SKIP / TODO_ONLY / EMPTY_ASSERT（§6.1 阈值）。
 */
export function detectStale(rootDir, thresholds, lastCommitDates) {
  const dates = lastCommitDates ?? collectLastCommitDates(rootDir);
  const now = new Date();
  const candidates = [];
  const packageTestFiles = [];
  for (const packageDir of Object.keys(PACKAGE_DEFINITIONS)) {
    for (const file of listPackageTestFiles(rootDir, packageDir)) {
      packageTestFiles.push({ packageDir, file: `packages/${packageDir}/tests/${file}` });
    }
  }

  for (const { packageDir, file } of packageTestFiles) {
    const source = readFileSync(join(rootDir, file), 'utf8');
    const skipMatches = source.match(/\b(?:it|test|describe)\.skip\s*\(/g) ?? [];
    const todoMatches = source.match(/\b(?:it|test)\.todo\s*\(/g) ?? [];
    const blocks = splitTestBlocks(source);

    if (skipMatches.length > 0) {
      const since = firstIntroducedDate(rootDir, file, '.skip(', dates);
      const idleDays = daysBetween(since, now);
      if (idleDays !== null && idleDays >= thresholds.longSkipDays) {
        candidates.push({
          file,
          rule: 'LONG_SKIP',
          detail: `${skipMatches.length} 处 skip，最早约 ${idleDays} 天前引入`,
          since,
          confidence: 0.7,
        });
      }
    }

    if (todoMatches.length > 0) {
      const since = dates.get(file);
      candidates.push({
        file,
        rule: 'TODO_ONLY',
        detail: `${todoMatches.length} 处 it.todo/test.todo 待补断言`,
        since,
        confidence: 0.6,
      });
    }

    let emptyBlocks = 0;
    for (const block of blocks) {
      if (/\.(skip|todo)\s*\(/.test(block.slice(0, 30))) continue;
      const normalized = normalizeChunk(block);
      // expectTypeOf( 与其泛型形式 expectTypeOf<T>( 均为 vitest 合法类型断言，与 expect( 同等计入，
      // 避免类型测试块（含泛型）被误判空断言。
      if (normalized && !/expect(TypeOf)?\s*[<(]/.test(normalized)) emptyBlocks += 1;
    }
    if (emptyBlocks > 0) {
      const since = dates.get(file);
      candidates.push({
        file,
        rule: 'EMPTY_ASSERT',
        detail: `${emptyBlocks} 个用例块内无 expect/expectTypeOf 调用（空断言）`,
        since,
        confidence: 0.5,
      });
    }
    void packageDir;
  }
  return candidates;
}

/**
 * 三类检测统一入口：unused / duplicates / stale + 文件级评分与分区。
 */
export function detectAll(rootDir, config, now = new Date()) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(config.auditThresholds ?? {}) };
  const testFiles = collectAllPackageTestFiles(rootDir);
  const nowArg = now;

  const unusedHits = [
    ...detectSourceDeleted(testFiles, rootDir),
    ...detectApiUnresolved(testFiles, rootDir),
    ...detectNoSelection(testFiles, rootDir, thresholds, nowArg),
  ];
  const staleHits = detectStale(rootDir, thresholds, null);

  const ruleHitsByFile = new Map();
  for (const hit of unusedHits) {
    ruleHitsByFile.set(hit.file, (ruleHitsByFile.get(hit.file) ?? []).concat(hit));
  }
  const unused = [...ruleHitsByFile.entries()].map(([file, hits]) => {
    const { score, zone } = scoreFileRuleHits(hits);
    return {
      file,
      rule: [...new Set(hits.map((hit) => hit.rule))].join('+'),
      detail: hits.map((hit) => hit.detail).join('；'),
      confidence: Math.max(...hits.map((hit) => hit.confidence)),
      score,
      zone,
    };
  });
  unused.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const staleByFile = new Map();
  for (const hit of staleHits) {
    staleByFile.set(hit.file, (staleByFile.get(hit.file) ?? []).concat(hit));
  }
  const stale = [...staleByFile.entries()].map(([file, hits]) => {
    const { score, zone } = scoreFileRuleHits(hits);
    return {
      file,
      rule: hits.map((hit) => hit.rule).join('+'),
      detail: hits.map((hit) => hit.detail).join('；'),
      since: hits.find((hit) => hit.since)?.since,
      score,
      zone,
    };
  });
  stale.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const duplicates = detectDuplicates(rootDir, thresholds);

  return {
    summary: {
      totalTestFiles: testFiles.length,
      unusedCount: unused.length,
      duplicateGroupCount: duplicates.length,
      staleCount: stale.length,
      staleRate:
        testFiles.length === 0 ? 0 : Math.round((stale.length / testFiles.length) * 100) / 100,
    },
    unused,
    duplicates,
    stale,
  };
}

export function getRepoRootForAudit() {
  return getRepoRoot();
}
