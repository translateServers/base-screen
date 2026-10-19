import { describe, expect, it } from 'vitest';
import { DATASET_DEFINITIONS } from '../../examples/shared-backend/src/datasets/dataset-definitions';
import { parametersToDefinitions } from '../../examples/shared-backend/src/datasources/datasource.types';
import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenTabularDataset,
} from '../../packages/contracts/src/index.js';

/**
 * A37：合并后的 `/api/datasets` 响应形状必须能被契约解析器接受。
 *
 * 样例**从后端来源构造**而不是手抄：内置条目来自 `DATASET_DEFINITIONS`（同一份代码常量），
 * 自建条目的字段/参数来自 `parametersToDefinitions`（管理侧真正用的那个函数）。这样后端
 * 改了字段形状，这个测试会跟着红，而不是"样例还停在旧形状上照样绿"。
 *
 * 覆盖三个容易踩空的点：
 * 1. `description` 是 `null`（空说明落 null，契约 `text.min(1)` 不接受空串）；
 * 2. 自建字段一律 `nullable: true`，且可能含 `null` / `boolean` 单元格；
 * 3. 条目/定义是 strictObject——多一个键就整份判非法（所以要用真实响应形状，不能"顺手加字段"）。
 */
describe('A37 · 目录条目（Entries）', () => {
  it('accepts builtin + custom entries, with description null for custom', () => {
    const builtin = DATASET_DEFINITIONS.map((definition) => ({
      datasetId: definition.datasetId,
      name: definition.name,
      description: definition.description,
      groupId: definition.groupId,
    }));
    const custom = {
      datasetId: 'custom.demo',
      name: '自建示例',
      // 后端把空说明落成 null（不是空串）
      description: null,
      groupId: 'custom',
    };

    const parsed = parseScreenDatasetEntries({ items: [...builtin, custom] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(parsed.value.items).toHaveLength(builtin.length + 1);
    expect(parsed.value.items.at(-1)?.description).toBeNull();
  });

  it('rejects a duplicate datasetId (契约要求目录内唯一)', () => {
    const entry = { datasetId: 'custom.demo', name: '重复', description: null, groupId: 'custom' };
    expect(parseScreenDatasetEntries({ items: [entry, entry] }).ok).toBe(false);
  });
});

describe('A37 · 数据集定义（Definition）', () => {
  it('accepts a builtin definition verbatim', () => {
    const definition = DATASET_DEFINITIONS[0];
    expect(definition).toBeDefined();
    if (definition === undefined) return;
    const parsed = parseScreenDatasetDefinition({
      datasetId: definition.datasetId,
      name: definition.name,
      description: definition.description,
      groupId: definition.groupId,
      fields: definition.fields,
      parameters: definition.parameters,
    });
    expect(parsed.ok).toBe(true);
  });

  it('accepts a custom definition built from the management-side parameter mapper', () => {
    const parsed = parseScreenDatasetDefinition({
      datasetId: 'custom.demo',
      name: '自建示例',
      description: null,
      groupId: 'custom',
      fields: [
        { id: 'id', label: 'id', valueType: 'string', nullable: true },
        { id: 'ok', label: 'ok', valueType: 'boolean', nullable: true },
        { id: 'load', label: 'load', valueType: 'number', nullable: true },
      ],
      parameters: parametersToDefinitions([
        { name: 'status', label: '', valueType: 'string', required: false, defaultValue: 'fault' },
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    // label 为空时回落参数名（契约要求 label 非空）
    expect(parsed.value.parameters[0]).toMatchObject({ name: 'status', label: 'status' });
  });

  it('rejects an empty description string', () => {
    const parsed = parseScreenDatasetDefinition({
      datasetId: 'custom.demo',
      name: '自建示例',
      description: '',
      fields: [{ id: 'a', label: 'a', valueType: 'string', nullable: true }],
      parameters: [],
    });
    expect(parsed.ok).toBe(false);
  });
});

describe('A37 · 表格数据（Tabular）', () => {
  it('accepts null and boolean cells and exactly three top-level keys', () => {
    const tabular = {
      fields: [
        { id: 'name', label: '名称', valueType: 'string', nullable: true },
        { id: 'ok', label: '在线', valueType: 'boolean', nullable: true },
        { id: 'load', label: '负载', valueType: 'number', nullable: true },
      ],
      rows: [
        { name: null, ok: true, load: 1.5 },
        { name: '甲班', ok: false, load: null },
      ],
      totalRowCount: 2,
    };
    const parsed = parseScreenTabularDataset(tabular);
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(parsed.value.rows).toHaveLength(2);
  });

  it('rejects an extra top-level key (管理侧的 truncated/durationMs 不能进契约)', () => {
    const parsed = parseScreenTabularDataset({
      fields: [{ id: 'a', label: 'a', valueType: 'string', nullable: true }],
      rows: [{ a: 'x' }],
      totalRowCount: 1,
      truncated: true,
    });
    expect(parsed.ok).toBe(false);
  });
});
