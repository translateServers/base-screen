import { describe, expect, it } from 'vitest';
import { parseScreenDocument } from '../../packages/contracts/src/index.js';
import { validateScreenHostResourceBinding } from '../../packages/core/src/index.js';
import { PLUGIN_BOARD_STATUS_GRID_MANIFEST } from '../../plugins/plugin-materials/src/board/status-grid.js';

/**
 * A39：`custom.*` 数据源能被文档与绑定校验接受。
 *
 * 两件事分开验：
 * 1. **文档层**：`dataSource: { type:'dataset', datasetId:'custom.x' }` 通过 canonical 解析
 *    ——基座 schema 对 `datasetId` 只要求 1..256 字，不限定前缀，因此自建 id 不需要改基座；
 * 2. **绑定层**：`binding.fields` 里的字段都在数据源 `fields` 内时不报
 *    `HOST_DATASET_BINDING_INVALID`；缺字段/类型不符时报——角色取**物料清单里的真实声明**
 *    （`PLUGIN_BOARD_STATUS_GRID_MANIFEST`），不手抄 minFields/valueTypes。
 */

const ROLES = PLUGIN_BOARD_STATUS_GRID_MANIFEST.dataBinding.roles;

const DATASOURCE_FIELDS = [
  { id: 'id', label: 'id', valueType: 'string' as const, nullable: true },
  { id: 'name', label: '队名', valueType: 'string' as const, nullable: true },
  { id: 'status', label: '状态', valueType: 'string' as const, nullable: true },
];

function documentWith(datasetId: string, bindingFields: readonly string[]): unknown {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#0b1020' },
    components: [
      {
        id: 'ds-grid',
        type: 'board.status-grid',
        name: '状态灯阵',
        parentId: null,
        position: { x: 24, y: 24 },
        size: { width: 604, height: 412 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: {
          type: 'dataset',
          datasetId,
          params: { status: { kind: 'literal', value: 'fault' } },
          binding: { fields: { items: bindingFields } },
        },
      },
    ],
    variables: [],
    blueprint: { relations: [] },
  };
}

describe('A39 · 文档层', () => {
  it('accepts a custom.* dataset reference', () => {
    const parsed = parseScreenDocument(documentWith('custom.demo', ['name', 'status']));
    expect(parsed.ok).toBe(true);
  });

  it('still rejects a malformed datasetId', () => {
    expect(parseScreenDocument(documentWith('', ['name', 'status'])).ok).toBe(false);
  });
});

describe('A39 · 绑定层', () => {
  it('accepts a binding whose fields all exist in the datasource', () => {
    const result = validateScreenHostResourceBinding(
      { fields: { items: ['name', 'status'] } },
      DATASOURCE_FIELDS,
      ROLES,
    );
    expect(result.ok).toBe(true);
  });

  it('reports HOST_DATASET_BINDING_INVALID when a bound field is gone (A36 的降级来源)', () => {
    const result = validateScreenHostResourceBinding(
      { fields: { items: ['name', 'temp'] } },
      DATASOURCE_FIELDS,
      ROLES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((item) => item.code)).toContain('HOST_DATASET_BINDING_INVALID');
  });

  it('reports HOST_DATASET_BINDING_INVALID when a role is under-filled', () => {
    const result = validateScreenHostResourceBinding(
      { fields: { items: ['name'] } },
      DATASOURCE_FIELDS,
      ROLES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((item) => item.code)).toContain('HOST_DATASET_BINDING_INVALID');
  });
});
