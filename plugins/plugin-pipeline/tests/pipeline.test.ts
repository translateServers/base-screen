import { describe, expect, it } from 'vitest';
import {
  PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
  PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
} from '../src/identity.js';
import { createPluginPipelineRuntime } from '../src/plugin.js';
import { applyTopBy } from '../src/processors.js';

const rows = [
  { name: '上海', value: 982 },
  { name: '深圳', value: 871 },
  { name: '北京', value: 763 },
];

describe('applyTopBy', () => {
  it('ranks descending and truncates to the requested count', () => {
    const result = applyTopBy(rows, { field: 'value', count: 2 });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toEqual([rows[0], rows[1]]);
  });

  it('does not mutate the upstream array', () => {
    const input = [...rows];
    applyTopBy(input, { field: 'value', count: 1 });
    expect(input).toEqual(rows);
  });

  it('fails closed on a bad config or a non-array upstream', () => {
    expect(applyTopBy(rows, { field: '', count: 2 }).ok).toBe(false);
    expect(applyTopBy(rows, { field: 'value', count: 0 }).ok).toBe(false);
    expect(applyTopBy(rows, { count: 2 }).ok).toBe(false);
    expect(applyTopBy(rows, null).ok).toBe(false);
    expect(applyTopBy('not-an-array', { field: 'value', count: 2 }).ok).toBe(false);
  });

  it('skips rows whose ranked field is not a number', () => {
    const mixed = [...rows, { name: '广州', value: 'oops' }, { name: '成都' }];
    const result = applyTopBy(mixed, { field: 'value', count: 5 });
    expect(result.ok ? result.value : null).toEqual(rows);
  });

  it('clamps an over-large count instead of slicing unbounded', () => {
    const result = applyTopBy(rows, { field: 'value', count: 100_000 });
    expect(result.ok).toBe(true);
    expect(result.ok ? (result.value as unknown[]).length : -1).toBe(rows.length);
  });
});

describe('plugin-pipeline runtime', () => {
  it('declares the runtime-only surfaces: one processor and one blueprint action', () => {
    const runtime = createPluginPipelineRuntime();
    expect(runtime.manifest.contributions.map((item) => item.kind)).toEqual([
      'dataProcessor',
      'blueprintAction',
    ]);
    expect(Object.keys(runtime.dataProcessors ?? {})).toEqual([
      PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
    ]);
    expect(Object.keys(runtime.blueprintActions ?? {})).toEqual([
      PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
    ]);
  });

  it('declares the capability its action requires, and no interface-bearing contributions', () => {
    const runtime = createPluginPipelineRuntime();
    expect(runtime.manifest.capabilities).toEqual(['blueprint.action.execute']);
    // 运行期插件不贡献任何需要宿主注册的元素：没有 tagName 类贡献。
    expect(runtime.manifest.contributions.some((item) => 'tagName' in item)).toBe(false);
  });

  it('uses identifiers that satisfy the document patterns they are stored under', () => {
    const runtime = createPluginPipelineRuntime();
    const processor = runtime.manifest.contributions.find((item) => item.kind === 'dataProcessor');
    const action = runtime.manifest.contributions.find((item) => item.kind === 'blueprintAction');
    // processorId → 变量名模式；actionId → 组件 id 模式。
    expect(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(String(processor?.id))).toBe(true);
    expect(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(String(action?.id))).toBe(true);
  });
});
