import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, posix, resolve } from 'node:path';

const ADR_INDEX_PATH = 'docs/decisions/README.md';
const SPEC_INDEX_PATH = 'docs/specs/README.md';
const SPEC_ARCHIVE_INDEX_PATH = 'docs/specs/archive/README.md';
const PLAN_INDEX_PATH = 'docs/plans/README.md';
const PLAN_ARCHIVE_INDEX_PATH = 'docs/plans/archive/README.md';

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
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .map(normalizePath)
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => ({ path, source: readFileSync(resolve(root, path), 'utf8') }));
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

export function evaluateDocumentGovernance(markdownFiles, targetExists) {
  const markdownByPath = new Map(markdownFiles.map((file) => [file.path, file.source]));
  return sortIssues([
    ...evaluateMarkdownLinks(markdownFiles, targetExists),
    ...evaluateAdrIndex(markdownByPath),
    ...evaluateSpecIndexes(markdownFiles, markdownByPath),
    ...evaluatePlanIndexes(markdownByPath),
    ...findForbiddenVersionMarkers(markdownFiles),
  ]);
}

function formatIssue({ code, detail, line, path }) {
  return `${code}: ${path}${line === undefined ? '' : `:${line}`} ${detail}`;
}

export function verifyDocuments({ root = resolve('.') } = {}) {
  const markdownFiles = discoverMarkdownFiles(root);
  const issues = evaluateDocumentGovernance(markdownFiles, (target) =>
    existsSync(resolve(root, target)),
  );
  if (issues.length > 0) {
    throw new Error(`DOCUMENT_GOVERNANCE_CHECK_FAILED:\n${issues.map(formatIssue).join('\n')}`);
  }
}

if (import.meta.main) {
  verifyDocuments();
}
