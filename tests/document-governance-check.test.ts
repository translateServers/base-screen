import { describe, expect, it } from 'vitest';
import {
  compareIndexedEntries,
  evaluateActiveSpecCompletion,
  evaluateAdrIndex,
  evaluateMarkdownLinks,
  extractMarkdownLinks,
  findForbiddenVersionMarkers,
  normalizeAdrStatus,
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
});
