import {
  buildCustomDatasetId,
  slugifyName,
  suggestDatasetId,
} from '../src/datasources/datasource-slug';

/**
 * PRD §8.2 的 `datasetId` 生成规则 + A12。
 *
 * 这张 fixture 表同时被三端模型（`src/lib/datasource-model.ts` 的 `previewDatasetId`）
 * 引用：抽屉里实时预览的 datasetId 必须与保存后后端算出来的**完全一致**，否则用户会看到
 * "预览 custom.press-line-a，保存后变成 custom.press-line-a-2" 这种不可解释的漂移。
 */
const SLUG_CASES: readonly { readonly name: string; readonly slug: string }[] = [
  { name: 'Press Line A', slug: 'press-line-a' },
  { name: 'press line a', slug: 'press-line-a' },
  { name: 'A // B', slug: 'a-b' },
  { name: 'V1.2 API', slug: 'v1-2-api' },
  { name: '-lead-trail-', slug: 'lead-trail' },
  { name: 'a__b', slug: 'a-b' },
  { name: '工业4.0 看板', slug: '4-0' },
  { name: '车间设备台账', slug: '' },
  { name: '！！！', slug: '' },
  { name: '   ', slug: '' },
];

describe('slugifyName', () => {
  it.each(SLUG_CASES)('slugifies $name → "$slug"', ({ name, slug }) => {
    expect(slugifyName(name)).toBe(slug);
  });
});

describe('buildCustomDatasetId', () => {
  it('uses the slug when the name has usable characters', () => {
    expect(buildCustomDatasetId('Press Line A', 4)).toBe('custom.press-line-a');
    expect(buildCustomDatasetId('V1.2 API', 4)).toBe('custom.v1-2-api');
  });

  it('falls back to custom.ds-<n> for non-ASCII names (no pinyin conversion)', () => {
    expect(buildCustomDatasetId('车间设备台账', 1)).toBe('custom.ds-1');
    expect(buildCustomDatasetId('车间设备台账', 7)).toBe('custom.ds-7');
    expect(buildCustomDatasetId('！！！', 2)).toBe('custom.ds-2');
  });

  it('never emits an empty or malformed id', () => {
    for (const { name } of SLUG_CASES) {
      const datasetId = buildCustomDatasetId(name, 3);
      expect(datasetId).toMatch(/^custom\.[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('normalizes a bad sequence instead of producing custom.ds-NaN', () => {
    expect(buildCustomDatasetId('中文', 0)).toBe('custom.ds-1');
    expect(buildCustomDatasetId('中文', Number.NaN)).toBe('custom.ds-1');
    expect(buildCustomDatasetId('中文', 2.9)).toBe('custom.ds-2');
  });
});

describe('suggestDatasetId', () => {
  it('suggests a suffixed name without adopting it automatically (P8)', () => {
    const taken = new Set(['custom.press-line-a', 'custom.press-line-a-2']);
    const suggestion = suggestDatasetId('custom.press-line-a', (id) => taken.has(id));
    expect(suggestion).toBe('custom.press-line-a-3');
  });

  it('returns -2 when only the base id is taken', () => {
    expect(suggestDatasetId('custom.x', (id) => id === 'custom.x')).toBe('custom.x-2');
  });
});
