import { describe, expect, it } from 'vitest';
import {
  compareIndexedEntries,
  countDocumentLines,
  evaluateActiveSpecCompletion,
  evaluateAdrCitations,
  evaluateAdrIndex,
  evaluateMachineReadableReferences,
  evaluateMarkdownLinks,
  evaluateSizeBudgets,
  extractMarkdownLinks,
  findForbiddenVersionMarkers,
  normalizeAdrStatus,
  SIZE_BUDGET_EXCEPTIONS,
  SIZE_BUDGETS,
  sizeBudgetFor,
} from '../scripts/check-docs.mjs';

describe('document governance checks', () => {
  it('checks local inline, image, and reference links while allowing external links and anchors', () => {
    const source = [
      '[local](./target.md#section)',
      '![image](./asset.png)',
      '[external](https://example.com/v2/docs)',
      '[anchor](#section)',
      '`references/generated.json`',
      '[reference][guide]',
      '[guide]: ../guide.md',
    ].join('\n');
    const files = [{ path: 'docs/topic/readme.md', source }];
    const existing = new Set(['docs/topic/target.md', 'docs/topic/asset.png', 'docs/guide.md']);

    expect(extractMarkdownLinks(source).map(({ destination }) => destination)).toEqual([
      './target.md#section',
      './asset.png',
      'https://example.com/v2/docs',
      '#section',
      '../guide.md',
    ]);
    expect(evaluateMarkdownLinks(files, (target) => existing.has(target))).toEqual([]);
  });

  it('reports missing local link targets with a stable code and line', () => {
    const issues = evaluateMarkdownLinks(
      [{ path: 'docs/readme.md', source: 'first\n[missing](./missing.md)' }],
      () => false,
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'DOC_LINK_TARGET_MISSING',
        line: 2,
        path: 'docs/readme.md',
      }),
    ]);
  });

  it('reports duplicate, missing, and orphan index entries', () => {
    const issues = compareIndexedEntries(
      ['ADR-0001', 'ADR-0002'],
      ['ADR-0001', 'ADR-0001', 'ADR-9999'],
      'DOC_ADR_INDEX',
      'docs/decisions/README.md',
    );

    expect(issues.map(({ code, detail }) => [code, detail])).toEqual([
      ['DOC_ADR_INDEX_DUPLICATE', 'ADR-0001'],
      ['DOC_ADR_INDEX_MISSING', 'ADR-0002'],
      ['DOC_ADR_INDEX_ORPHAN', 'ADR-9999'],
    ]);
  });

  it('requires a fully completed active spec to be archived', () => {
    const complete = [
      { path: 'docs/specs/example/spec.md', source: '> 状态：生效中' },
      { path: 'docs/specs/example/tasks.md', source: '- [x] implementation' },
      { path: 'docs/specs/example/checklist.md', source: '- [x] acceptance' },
    ];
    const incomplete = complete.map((file) =>
      file.path.endsWith('checklist.md') ? { ...file, source: '- [ ] acceptance' } : file,
    );

    expect(evaluateActiveSpecCompletion(complete)).toEqual([
      expect.objectContaining({ code: 'DOC_COMPLETED_SPEC_NOT_ARCHIVED' }),
    ]);
    expect(evaluateActiveSpecCompletion(incomplete)).toEqual([]);
  });

  it('rejects public version labels and version fields without rejecting toolchain versions', () => {
    const issues = findForbiddenVersionMarkers([
      {
        path: 'docs/example.md',
        source: [
          '验证项 V8。',
          '当前不应命名为 v1。',
          '路径 /v9/items 与字段 apiVersion 均禁止。',
          'Node v22.20.0 与 https://example.com/v2/docs 是外部版本说明。',
        ].join('\n'),
      },
      {
        path: 'docs/roadmap/README.md',
        source: '探索阶段禁止引入版本化命名（`V1/V2`、`apiVersion` 等）。',
      },
    ]);

    expect(issues.map(({ detail }) => detail)).toEqual(['V8', 'v1', '/v9', 'apiVersion']);
  });

  it('normalizes bilingual ADR lifecycle states', () => {
    expect(normalizeAdrStatus('Accepted')).toBe('已接受');
    expect(normalizeAdrStatus('已接受（实施完成）')).toBe('已接受');
    expect(normalizeAdrStatus('Superseded by ADR-0002')).toBe('已取代');
    expect(normalizeAdrStatus('部分已取代（由 ADR-0063 取代）')).toBe('部分已取代');
    expect(normalizeAdrStatus('Partially Superseded by ADR-0063')).toBe('部分已取代');
  });

  it('keeps ADR filenames, headings, and file numbers one-to-one', () => {
    const files = new Map([
      [
        'docs/decisions/README.md',
        '| [ADR-0001](./ADR-0001-first.md) | Accepted | 2026-08-30 | First |',
      ],
      [
        'docs/decisions/ADR-0001-first.md',
        '# ADR-0002: Wrong heading\n\n> Status: Accepted\n> Date: 2026-08-30',
      ],
      [
        'docs/decisions/ADR-0001-duplicate.md',
        '# ADR-0001: Duplicate\n\n> Status: Accepted\n> Date: 2026-08-30',
      ],
    ]);

    expect(evaluateAdrIndex(files).map(({ code }) => code)).toEqual(
      expect.arrayContaining(['DOC_ADR_FILE_DUPLICATE', 'DOC_ADR_NUMBER_MISMATCH']),
    );
  });

  it('resolves references declared by machine-readable capability indexes', () => {
    const indexPath = '.base-screen/integration-capabilities.json';
    const existing = new Set(['docs/decisions/ADR-0080-conditional-style.md', 'packages/renderer']);
    const targetExists = (target) => existing.has(target);

    expect(evaluateMachineReadableReferences(indexPath, undefined, targetExists)).toEqual([]);
    expect(evaluateMachineReadableReferences(indexPath, {}, targetExists)).toEqual([
      expect.objectContaining({ code: 'DOC_MACHINE_INDEX_INVALID', path: indexPath }),
    ]);

    const issues = evaluateMachineReadableReferences(
      indexPath,
      {
        capabilities: [
          {
            id: 'conditional-style',
            references: [
              'docs/decisions/ADR-0080-conditional-style.md',
              'docs/decisions/ADR-0059-conditional-style-port.md',
              'packages/renderer',
            ],
          },
          { id: 'host-entrypoints' },
        ],
      },
      targetExists,
    );

    expect(issues).toEqual([
      {
        code: 'DOC_MACHINE_REFERENCE_MISSING',
        detail: 'conditional-style: docs/decisions/ADR-0059-conditional-style-port.md',
        line: undefined,
        path: indexPath,
      },
    ]);
  });

  it('budgets active documents by role and excludes archive, changeset, and generated reports', () => {
    expect(sizeBudgetFor('docs/decisions/ADR-0099-example.md')).toBe(SIZE_BUDGETS.adr);
    expect(sizeBudgetFor('docs/specs/example/spec.md')).toBe(SIZE_BUDGETS.delivery);
    expect(sizeBudgetFor('docs/plans/example/implementation-plan.md')).toBe(SIZE_BUDGETS.delivery);
    expect(sizeBudgetFor('docs/usage/viewer.md')).toBe(SIZE_BUDGETS.narrative);
    expect(sizeBudgetFor('README.md')).toBe(SIZE_BUDGETS.narrative);
    expect(sizeBudgetFor('.agents/skills/example/references/workflow.md')).toBe(
      SIZE_BUDGETS.narrative,
    );
    expect(sizeBudgetFor('docs/specs/archive/example/spec.md')).toBeUndefined();
    expect(sizeBudgetFor('docs/plans/archive/example/plan.md')).toBeUndefined();
    expect(sizeBudgetFor('.changeset/example.md')).toBeUndefined();
    expect(sizeBudgetFor('packages/sdk/etc/sdk.api.md')).toBeUndefined();
  });

  it('fails a document one line over budget and treats a registered exception as its own ceiling', () => {
    const doc = (lines: number) => 'x\n'.repeat(lines);
    expect(countDocumentLines(doc(300))).toBe(300);

    expect(evaluateSizeBudgets([{ path: 'docs/guides/example.md', source: doc(300) }])).toEqual([]);
    expect(evaluateSizeBudgets([{ path: 'docs/guides/example.md', source: doc(301) }])).toEqual([
      expect.objectContaining({ code: 'DOC_SIZE_BUDGET_EXCEEDED', detail: '301 > 300' }),
    ]);

    // 归档正文即使超长也不参与预算：它是历史证据，不为体量改写
    expect(
      evaluateSizeBudgets([{ path: 'docs/specs/archive/example/spec.md', source: doc(5000) }]),
    ).toEqual([]);

    const registered = 'docs/decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md';
    expect(evaluateSizeBudgets([{ path: registered, source: doc(544) }])).toEqual([]);
    expect(evaluateSizeBudgets([{ path: registered, source: doc(545) }])).toEqual([
      expect.objectContaining({ code: 'DOC_SIZE_BUDGET_EXCEEDED', detail: '545 > 544' }),
    ]);
  });

  it('pins the exception table so a registered budget cannot be widened silently', () => {
    // 棘轮规则：豁免值只能下调、条目不得新增。放宽必须同时改这条断言，形成可见摩擦。
    expect(SIZE_BUDGET_EXCEPTIONS).toEqual({
      'docs/decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md': 544,
    });
  });

  it('rejects current-authority docs citing an ADR that no longer exists', () => {
    const files = new Map([
      // 同时承担两个作用：确立 ADR-0077 存在，以及验证 decisions 路径整体豁免
      ['docs/decisions/ADR-0077-canvas.md', '# ADR-0077 吸收 ADR-0048、ADR-0057'],
      [
        'docs/decisions/README.md',
        '| [ADR-0077](./ADR-0077-canvas.md) | 已接受 | 2026-09-16 | 主线（吸收 ADR-0048、ADR-0057 共 2 份，已移除） |',
      ],
      // 现行依据类：裸编号指向已吸收 ADR，应报出后继主线
      ['docs/usage/authoring.md', '画布背景支持渐变（ADR-0048）。'],
      // 无归并记录的编号也要拦住，否则拼错编号会静默通过
      ['docs/baseline/designer.md', '另见 ADR-9999。'],
      // 带吸收注记的行是合法历史记录
      ['docs/usage/migrated.md', '原 ADR-0048 已由主线合并记录吸收。'],
      // 历史调研按撰写时编号行文，按设计豁免
      ['docs/plans/research.md', '按撰写时的 ADR-0057 行文。'],
    ]);

    // evaluateAdrCitations 不排序（排序在 evaluateDocumentGovernance 内），因此按插入顺序断言
    const issues = evaluateAdrCitations(files);

    expect(issues.map(({ code, detail, line, path }) => [code, path, line, detail])).toEqual([
      ['DOC_ADR_CITATION_DANGLING', 'docs/usage/authoring.md', 1, 'ADR-0048 -> ADR-0077'],
      [
        'DOC_ADR_CITATION_DANGLING',
        'docs/baseline/designer.md',
        1,
        'ADR-9999 has no successor record',
      ],
    ]);
  });
});
