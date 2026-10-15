import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, posix, resolve } from 'node:path';

const ADR_INDEX_PATH = 'docs/decisions/README.md';
const SPEC_INDEX_PATH = 'docs/specs/README.md';
const SPEC_ARCHIVE_INDEX_PATH = 'docs/specs/archive/README.md';
const PLAN_INDEX_PATH = 'docs/plans/README.md';
const PLAN_ARCHIVE_INDEX_PATH = 'docs/plans/archive/README.md';

/**
 * 机器可读索引里的文档引用同样必须可解析。`pnpm integration` 只在 peer 仓库存在时校验
 * 这些路径，所以本门禁是 `verify:m0` 里唯一能拦住它的一侧。
 */
const MACHINE_REFERENCE_INDEX_PATHS = ['.base-screen/integration-capabilities.json'];

/**
 * 活动文档单篇行数预算，按文档角色分档。阈值来自实测分布，不是拍定的整数：
 * - ADR：p50=54、p90=132，除登记豁免外最大 170；
 * - Spec/Plan：归档 spec.md 最大 799、implementation-plan 最大 530。这类文档是单一连贯的
 *   需求与验收叙事，拆到多个文件会损害可追溯性，因此只设防失控的上限；
 * - 其余叙述类：实测最大是根 README 219 行与集成工作流规范 148 行。
 */
export const SIZE_BUDGETS = Object.freeze({ adr: 200, delivery: 800, narrative: 300 });

/**
 * 已登记豁免。数值**只能下调**，不得上调或新增条目：超预算的正确处理是拆分或删减，
 * 不是放宽登记值。修改本表必须同步修改 tests/document-governance-check.test.ts 里的固定断言。
 */
export const SIZE_BUDGET_EXCEPTIONS = Object.freeze({
  // 2026-09-17 去掉与 check-packages.mjs / check-boundaries.mjs 重复的派生事实表后为 544 行；
  // 该 ADR 已接受，其决策结论不得为体量预算改写，因此冻结在当前值。
  'docs/decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md': 544,
});

/** 不参与体量预算：归档正文是历史证据，changeset 是 ADR-0001 §14 规定的私有阶段记录，API report 是生成物。 */
const SIZE_BUDGET_EXCLUDED = [/(?:^|\/)archive\//, /^\.changeset\//, /\.api\.md$/];

export function sizeBudgetFor(path) {
  if (SIZE_BUDGET_EXCLUDED.some((pattern) => pattern.test(path))) return undefined;
  if (/^docs\/decisions\/ADR-\d{4}-.+\.md$/.test(path)) return SIZE_BUDGETS.adr;
  if (/^docs\/(?:specs|plans)\//.test(path)) return SIZE_BUDGETS.delivery;
  return SIZE_BUDGETS.narrative;
}

export function countDocumentLines(source) {
  const lines = source.split(/\r\n|\n|\r/);
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

/**
 * 现行依据类文档：读者会把其中的 ADR 编号当作当下权威，因此只能引用仍然存在的 ADR。
 */
const CURRENT_AUTHORITY_DOC_PATTERNS = [
  /^docs\/usage\.md$/,
  /^docs\/usage\//,
  /^docs\/baseline\//,
  /^docs\/guides\//,
  /^docs\/troubleshooting\//,
  /^docs\/provenance\//,
  /^docs\/roadmap\//,
  /^docs\/host-skill-manuals\//,
  /^docs\/README\.md$/,
  /^docs\/material-loading\.md$/,
  /^docs\/custom-dataset-material-best-practice\.md$/,
  /^AGENTS\.md$/,
  /^CONTEXT\.md$/,
  /^README\.md$/,
];

/**
 * `docs/decisions/` 的归并映射记录本来就要点名被吸收编号；`docs/plans/` 与 `docs/specs/`
 * 是按撰写时编号行文的历史分析与需求记录，为保留记录原貌不改写其编号。归档同样豁免。
 */
const ADR_CITATION_EXEMPT_PATTERNS = [/^docs\/decisions\//, /^docs\/plans\//, /^docs\/specs\//];

/** 明确标注为已吸收/已取代/已移除的行是合法的历史注记，不算悬空引用。 */
const ADR_ABSORBED_NOTE = /吸收|取代|移除|归并|已被|原 ADR/;

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r\n|\n|\r/).length;
}

function issue(code, path, detail, line) {
  return { code, detail, line, path };
}

function linkDestination(rawDestination) {
  const trimmed = rawDestination.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed;
}

export function extractMarkdownLinks(source) {
  const links = [];
  const searchable = source.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (block) =>
    block.replace(/[^\r\n]/g, ' '),
  );
  const inlinePattern = /!?\[[^\]\r\n]*\]\(\s*(<[^>\r\n]+>|[^)\s\r\n]+)(?:\s+[^)\r\n]+)?\)/g;
  const referencePattern = /^\s*\[[^\]\r\n]+\]:\s*(<[^>\r\n]+>|\S+)/gm;
  for (const pattern of [inlinePattern, referencePattern]) {
    for (const match of searchable.matchAll(pattern)) {
      links.push({ destination: linkDestination(match[1]), index: match.index ?? 0 });
    }
  }
  return links.sort((first, second) => first.index - second.index);
}

function isExternalDestination(destination) {
  return (
    destination.startsWith('#') ||
    destination.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(destination)
  );
}

function resolveMarkdownTarget(filePath, destination) {
  const pathPart = destination.split(/[?#]/, 1)[0];
  if (pathPart.length === 0) return undefined;
  let decoded;
  try {
    decoded = decodeURI(pathPart).replaceAll('\\', '/');
  } catch {
    return null;
  }
  const target = decoded.startsWith('/')
    ? posix.normalize(decoded.slice(1))
    : posix.normalize(posix.join(posix.dirname(filePath), decoded));
  return target === '..' || target.startsWith('../') ? null : target;
}

export function evaluateMarkdownLinks(markdownFiles, targetExists) {
  const issues = [];
  for (const { path, source } of markdownFiles) {
    for (const link of extractMarkdownLinks(source)) {
      if (isExternalDestination(link.destination)) continue;
      const target = resolveMarkdownTarget(path, link.destination);
      const line = lineNumberAt(source, link.index);
      if (target === null) {
        issues.push(issue('DOC_LINK_TARGET_INVALID', path, link.destination, line));
      } else if (target !== undefined && !targetExists(target)) {
        issues.push(
          issue('DOC_LINK_TARGET_MISSING', path, `${link.destination} -> ${target}`, line),
        );
      }
    }
  }
  return issues;
}

function firstColumnLinks(source) {
  return [...source.matchAll(/^\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|/gm)].map(
    (match) => match[1].split('#', 1)[0],
  );
}

export function compareIndexedEntries(
  actualValues,
  indexedValues,
  codePrefix,
  indexPath,
  options = {},
) {
  const issues = [];
  const actual = new Set(actualValues);
  const indexed = new Set(indexedValues);
  if (!options.allowDuplicates) {
    const counts = new Map();
    for (const value of indexedValues) counts.set(value, (counts.get(value) ?? 0) + 1);
    for (const [value, count] of counts) {
      if (count > 1) issues.push(issue(`${codePrefix}_DUPLICATE`, indexPath, value));
    }
  }
  for (const value of actual) {
    if (!indexed.has(value)) issues.push(issue(`${codePrefix}_MISSING`, indexPath, value));
  }
  for (const value of indexed) {
    if (!actual.has(value)) issues.push(issue(`${codePrefix}_ORPHAN`, indexPath, value));
  }
  return issues;
}

function parseMetadata(source, chineseKey, englishKey) {
  const pattern = new RegExp(`^> (?:${chineseKey}：|${englishKey}: )(.+)$`, 'm');
  return source.match(pattern)?.[1]?.trim();
}

export function normalizeAdrStatus(status) {
  if (status === undefined) return undefined;
  if (/^(Accepted|已接受|已采纳)/.test(status)) return '已接受';
  if (/^(Partially Superseded|部分已取代)/.test(status)) return '部分已取代';
  if (/^(Superseded|已取代)/.test(status)) return '已取代';
  if (/^(Deprecated|已废弃)/.test(status)) return '已废弃';
  if (/^(In Review|评审中)/.test(status)) return '评审中';
  if (/^(Draft|设计中)/.test(status)) return '设计中';
  return status;
}

export function evaluateAdrIndex(markdownByPath) {
  const issues = [];
  const adrFiles = [...markdownByPath.keys()]
    .filter((path) => /^docs\/decisions\/ADR-\d{4}-.+\.md$/.test(path))
    .sort();
  const actualIds = adrFiles.map((path) => basename(path).match(/^ADR-\d{4}/)?.[0]);
  const indexSource = markdownByPath.get(ADR_INDEX_PATH) ?? '';
  const entries = [
    ...indexSource.matchAll(
      /^\| \[(ADR-\d{4})\]\(([^)]+)\) \| ([^|]+) \| (\d{4}-\d{2}-\d{2}) \|/gm,
    ),
  ].map((match) => ({
    date: match[4],
    id: match[1],
    status: normalizeAdrStatus(match[3].trim()),
    target: match[2],
  }));
  issues.push(
    ...compareIndexedEntries(
      actualIds,
      entries.map(({ id }) => id),
      'DOC_ADR_INDEX',
      ADR_INDEX_PATH,
    ),
  );
  const fileCounts = new Map();
  for (const id of actualIds) fileCounts.set(id, (fileCounts.get(id) ?? 0) + 1);
  for (const [id, count] of fileCounts) {
    if (count > 1) issues.push(issue('DOC_ADR_FILE_DUPLICATE', ADR_INDEX_PATH, id));
  }
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  for (const path of adrFiles) {
    const source = markdownByPath.get(path) ?? '';
    const id = basename(path).match(/^ADR-\d{4}/)?.[0];
    const headingId = source.match(/^#\s+(ADR-\d{4})(?=\s|[:：])/m)?.[1];
    if (headingId === undefined) {
      issues.push(issue('DOC_ADR_HEADING_MISSING', path, id));
    } else if (headingId !== id) {
      issues.push(issue('DOC_ADR_NUMBER_MISMATCH', path, `${id} != ${headingId}`, 1));
    }
    const entry = entryById.get(id);
    if (entry === undefined) continue;
    const status = normalizeAdrStatus(parseMetadata(source, '状态', 'Status'));
    const date = parseMetadata(source, '日期', 'Date');
    if (status === undefined || date === undefined) {
      issues.push(issue('DOC_ADR_METADATA_MISSING', path, `${id} status/date`));
      continue;
    }
    if (status !== entry.status) {
      issues.push(
        issue('DOC_ADR_STATUS_MISMATCH', ADR_INDEX_PATH, `${id}: ${entry.status} != ${status}`),
      );
    }
    if (date !== entry.date) {
      issues.push(
        issue('DOC_ADR_DATE_MISMATCH', ADR_INDEX_PATH, `${id}: ${entry.date} != ${date}`),
      );
    }
    if (entry.target !== `./${basename(path)}`) {
      issues.push(issue('DOC_ADR_TARGET_MISMATCH', ADR_INDEX_PATH, `${id}: ${entry.target}`));
    }
  }
  return issues;
}

function collectSpecDirectories(paths) {
  const active = new Set();
  const archived = new Set();
  for (const path of paths) {
    if (path.startsWith('docs/specs/archive/')) {
      const archiveMatch = path.match(/^docs\/specs\/archive\/([^/]+)\//);
      if (archiveMatch) archived.add(archiveMatch[1]);
      continue;
    }
    const activeMatch = path.match(/^docs\/specs\/([^/]+)\//);
    if (activeMatch) active.add(activeMatch[1]);
  }
  return { active: [...active].sort(), archived: [...archived].sort() };
}

function specIndexEntries(source, prefix = './') {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}([^/]+)/spec\\.md$`);
  return firstColumnLinks(source)
    .map((target) => target.match(pattern)?.[1])
    .filter(Boolean);
}

export function evaluateActiveSpecCompletion(markdownFiles) {
  const issues = [];
  const byPath = new Map(markdownFiles.map((file) => [file.path, file.source]));
  const { active } = collectSpecDirectories(byPath.keys());
  for (const directory of active) {
    const specPath = `docs/specs/${directory}/spec.md`;
    if (!byPath.has(specPath)) {
      issues.push(issue('DOC_ACTIVE_SPEC_ENTRY_MISSING', specPath, directory));
      continue;
    }
    const evidence = ['tasks.md', 'checklist.md']
      .map((name) => byPath.get(`docs/specs/${directory}/${name}`) ?? '')
      .join('\n');
    const total = [...evidence.matchAll(/^\s*- \[[ xX]\]/gm)].length;
    const unchecked = [...evidence.matchAll(/^\s*- \[ \]/gm)].length;
    if (total > 0 && unchecked === 0) {
      issues.push(issue('DOC_COMPLETED_SPEC_NOT_ARCHIVED', specPath, directory));
    }
  }
  return issues;
}

function evaluateSpecIndexes(markdownFiles, markdownByPath) {
  const { active, archived } = collectSpecDirectories(markdownByPath.keys());
  const activeEntries = specIndexEntries(markdownByPath.get(SPEC_INDEX_PATH) ?? '');
  const archiveEntries = specIndexEntries(markdownByPath.get(SPEC_ARCHIVE_INDEX_PATH) ?? '');
  return [
    ...compareIndexedEntries(active, activeEntries, 'DOC_SPEC_INDEX', SPEC_INDEX_PATH),
    ...compareIndexedEntries(
      archived,
      archiveEntries,
      'DOC_SPEC_ARCHIVE_INDEX',
      SPEC_ARCHIVE_INDEX_PATH,
    ),
    ...evaluateActiveSpecCompletion(markdownFiles),
  ];
}

function collectPlanItems(paths, archived) {
  const prefix = archived ? 'docs/plans/archive/' : 'docs/plans/';
  const items = new Set();
  for (const path of paths) {
    if (!path.startsWith(prefix) || path === `${prefix}README.md`) continue;
    const rest = path.slice(prefix.length);
    if (!archived && rest.startsWith('archive/')) continue;
    items.add(rest.includes('/') ? rest.split('/', 1)[0] : rest);
  }
  return [...items].sort();
}

function planIndexItems(source) {
  return firstColumnLinks(source)
    .filter((target) => target.startsWith('./'))
    .map((target) => target.slice(2).split('/', 1)[0]);
}

function evaluatePlanIndexes(markdownByPath) {
  const paths = [...markdownByPath.keys()];
  return [
    ...compareIndexedEntries(
      collectPlanItems(paths, false),
      planIndexItems(markdownByPath.get(PLAN_INDEX_PATH) ?? ''),
      'DOC_PLAN_INDEX',
      PLAN_INDEX_PATH,
      { allowDuplicates: true },
    ),
    ...compareIndexedEntries(
      collectPlanItems(paths, true),
      planIndexItems(markdownByPath.get(PLAN_ARCHIVE_INDEX_PATH) ?? ''),
      'DOC_PLAN_ARCHIVE_INDEX',
      PLAN_ARCHIVE_INDEX_PATH,
      { allowDuplicates: true },
    ),
  ];
}

export function collectCapabilityReferences(index) {
  const entries = [];
  for (const capability of index.capabilities) {
    if (!Array.isArray(capability?.references)) continue;
    for (const reference of capability.references) {
      if (typeof reference !== 'string' || reference.length === 0) continue;
      entries.push({ id: capability.id ?? '(missing id)', reference });
    }
  }
  return entries;
}

export function evaluateMachineReadableReferences(indexPath, index, targetExists) {
  if (index === undefined) return [];
  if (!Array.isArray(index?.capabilities)) {
    return [issue('DOC_MACHINE_INDEX_INVALID', indexPath, 'capabilities is not an array')];
  }
  const issues = [];
  for (const { id, reference } of collectCapabilityReferences(index)) {
    const target = normalizePath(reference);
    if (!targetExists(target)) {
      issues.push(issue('DOC_MACHINE_REFERENCE_MISSING', indexPath, `${id}: ${reference}`));
    }
  }
  return issues;
}

export function evaluateSizeBudgets(markdownFiles) {
  const issues = [];
  for (const { path, source } of markdownFiles) {
    const budget = SIZE_BUDGET_EXCEPTIONS[path] ?? sizeBudgetFor(path);
    if (budget === undefined) continue;
    const lines = countDocumentLines(source);
    if (lines > budget) {
      issues.push(issue('DOC_SIZE_BUDGET_EXCEEDED', path, `${lines} > ${budget}`));
    }
  }
  return issues;
}

export function evaluateAdrCitations(markdownByPath) {
  const existing = new Set();
  for (const path of markdownByPath.keys()) {
    const id = path.match(/^docs\/decisions\/(ADR-\d{4})-.+\.md$/)?.[1];
    if (id !== undefined) existing.add(id);
  }
  // 映射从索引的归并记录推导，将来再做主线合并时门禁自动跟上，无需改代码
  const absorbed = new Map();
  const indexSource = markdownByPath.get(ADR_INDEX_PATH) ?? '';
  for (const match of indexSource.matchAll(
    /\[(ADR-\d{4})\][^\n]*?吸收 (ADR-[\d、ADR-]+) 共 \d+ 份/g,
  )) {
    for (const id of match[2].split('、')) absorbed.set(id, match[1]);
  }

  const issues = [];
  for (const [path, source] of markdownByPath) {
    if (!CURRENT_AUTHORITY_DOC_PATTERNS.some((pattern) => pattern.test(path))) continue;
    if (ADR_CITATION_EXEMPT_PATTERNS.some((pattern) => pattern.test(path))) continue;
    const lines = source.split(/\r\n|\n|\r/);
    for (const [index, line] of lines.entries()) {
      if (ADR_ABSORBED_NOTE.test(line)) continue;
      for (const match of line.matchAll(/\bADR-(\d{4})\b/g)) {
        const id = `ADR-${match[1]}`;
        if (existing.has(id)) continue;
        const successor = absorbed.get(id);
        issues.push(
          issue(
            'DOC_ADR_CITATION_DANGLING',
            path,
            successor === undefined ? `${id} has no successor record` : `${id} -> ${successor}`,
            index + 1,
          ),
        );
      }
    }
  }
  return issues;
}

function isVersionPolicyExample(path, line) {
  return (
    (path === 'AGENTS.md' && line.includes('探索阶段命名规则')) ||
    (path === 'docs/roadmap/README.md' && line.includes('探索阶段禁止引入版本化命名'))
  );
}

export function findForbiddenVersionMarkers(markdownFiles) {
  const issues = [];
  const patterns = [
    /\bV\d+\b/g,
    /\bv[123]\b/g,
    /(?:\/|-)[vV]\d+\b/g,
    /\b(?:apiVersion|schemaVersion|implementationVersion)\b/g,
  ];
  for (const { path, source } of markdownFiles) {
    const lines = source.split(/\r\n|\n|\r/);
    for (const [index, originalLine] of lines.entries()) {
      if (isVersionPolicyExample(path, originalLine)) continue;
      const line = originalLine.replaceAll(/https?:\/\/\S+/g, '');
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          issues.push(issue('DOC_VERSION_MARKER_FORBIDDEN', path, match[0], index + 1));
        }
      }
    }
  }
  return issues;
}

function discoverMarkdownFiles(root) {
  return (
    execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'],
      { cwd: root, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean)
      .map(normalizePath)
      .filter((path) => existsSync(resolve(root, path)))
      // deliverables/ 是方案与需求的过程文档，不属仓库现行文档治理范围（测试治理方案 §2.2 注记）。
      .filter((path) => !path.startsWith('deliverables/'))
      .map((path) => ({ path, source: readFileSync(resolve(root, path), 'utf8') }))
  );
}

function sortIssues(issues) {
  return issues.sort(
    (first, second) =>
      first.path.localeCompare(second.path) ||
      (first.line ?? 0) - (second.line ?? 0) ||
      first.code.localeCompare(second.code) ||
      first.detail.localeCompare(second.detail),
  );
}

export function evaluateDocumentGovernance(markdownFiles, targetExists, machineIndexes = []) {
  const markdownByPath = new Map(markdownFiles.map((file) => [file.path, file.source]));
  return sortIssues([
    ...evaluateMarkdownLinks(markdownFiles, targetExists),
    ...evaluateAdrIndex(markdownByPath),
    ...evaluateSpecIndexes(markdownFiles, markdownByPath),
    ...evaluatePlanIndexes(markdownByPath),
    ...findForbiddenVersionMarkers(markdownFiles),
    ...evaluateSizeBudgets(markdownFiles),
    ...evaluateAdrCitations(markdownByPath),
    ...machineIndexes.flatMap(({ path, index }) =>
      evaluateMachineReadableReferences(path, index, targetExists),
    ),
  ]);
}

function discoverMachineIndexes(root) {
  return MACHINE_REFERENCE_INDEX_PATHS.map((path) => {
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) return { index: undefined, path };
    try {
      return { index: JSON.parse(readFileSync(absolute, 'utf8')), path };
    } catch {
      return { index: null, path };
    }
  });
}

function formatIssue({ code, detail, line, path }) {
  return `${code}: ${path}${line === undefined ? '' : `:${line}`} ${detail}`;
}

export function verifyDocuments({ root = resolve('.') } = {}) {
  const markdownFiles = discoverMarkdownFiles(root);
  const issues = evaluateDocumentGovernance(
    markdownFiles,
    (target) => existsSync(resolve(root, target)),
    discoverMachineIndexes(root),
  );
  if (issues.length > 0) {
    throw new Error(`DOCUMENT_GOVERNANCE_CHECK_FAILED:\n${issues.map(formatIssue).join('\n')}`);
  }
}

if (import.meta.main) {
  verifyDocuments();
}
