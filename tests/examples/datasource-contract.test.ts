import { describe, expect, it, vi } from 'vitest';
import { api as reactApi } from '../../examples/react-host/src/lib/api';
import { createHostDatasetPort as createReactDatasetPort } from '../../examples/react-host/src/screen/host-dataset-port';
import { createRestProjectAdapter as createReactProjectAdapter } from '../../examples/react-host/src/screen/project-adapter';
import { DATASET_DEFINITIONS } from '../../examples/shared-backend/src/datasets/dataset-definitions';
import { parametersToDefinitions } from '../../examples/shared-backend/src/datasources/datasource.types';
import { api as vanillaApi } from '../../examples/vanilla-host/src/lib/api';
import { createHostDatasetPort as createVanillaDatasetPort } from '../../examples/vanilla-host/src/screen/host-dataset-port';
import { createRestProjectAdapter as createVanillaProjectAdapter } from '../../examples/vanilla-host/src/screen/project-adapter';
import { api as vueApi } from '../../examples/vue-host/src/lib/api';
import { createHostDatasetPort as createVueDatasetPort } from '../../examples/vue-host/src/screen/host-dataset-port';
import { createRestProjectAdapter as createVueProjectAdapter } from '../../examples/vue-host/src/screen/project-adapter';
import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenDocument,
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

describe('三端数据集参数映射', () => {
  it.each([
    ['vanilla', createVanillaDatasetPort],
    ['react', createReactDatasetPort],
    ['vue', createVueDatasetPort],
  ] as const)('%s 保留 true/false 参数并过滤非标量值', async (_host, createPort) => {
    const sent: unknown[] = [];
    const port = createPort({
      api: {
        listDatasets: async () => ({ ok: true, data: { groups: [], items: [] } }),
        describeDataset: async () => ({ ok: true, data: null }),
        queryDataset: async (_datasetId, params) => {
          sent.push(params);
          return {
            ok: true,
            data: {
              fields: [{ id: 'ok', label: '在线', valueType: 'boolean' }],
              rows: [{ ok: true }],
            },
          };
        },
      },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    const result = await port.query(
      {
        datasetId: 'custom.flags',
        dataSourceId: 'flags',
        params: { enabled: true, archived: false, count: 0, region: '华东', nested: {}, rows: [] },
      },
      { signal: new AbortController().signal },
    );
    expect(result.ok).toBe(true);
    expect(sent).toEqual([{ enabled: 'true', archived: 'false', count: 0, region: '华东' }]);
  });
});

describe('三端项目身份守卫', () => {
  it.each([
    ['vanilla', createVanillaProjectAdapter, vanillaApi],
    ['react', createReactProjectAdapter, reactApi],
    ['vue', createVueProjectAdapter, vueApi],
  ] as const)('%s 拒绝其他项目的 load/save 且不调用业务 API', async (_host, createAdapter, api) => {
    const load = vi.spyOn(api, 'getScreen');
    const save = vi.spyOn(api, 'updateScreen');
    try {
      const document = parseScreenDocument({
        canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
        components: [],
        variables: [],
        blueprint: { relations: [] },
      });
      if (!document.ok) throw new Error('测试文档无效');
      const adapter = createAdapter('allowed');
      const request = {
        projectId: 'other',
        revision: '3',
        document: document.value,
        signal: new AbortController().signal,
      };
      for (const result of [await adapter.load(request), await adapter.save(request)]) {
        expect(result).toMatchObject({
          ok: false,
          diagnostics: [{ code: 'PROJECT_UNAVAILABLE', path: ['projectId'] }],
        });
      }
      expect(load).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      const controller = new AbortController();
      controller.abort();
      expect(await adapter.save({ ...request, signal: controller.signal })).toEqual({
        ok: false,
        diagnostics: [],
      });
    } finally {
      load.mockRestore();
      save.mockRestore();
    }
  });
});

describe('三端宿主数据集业务快照', () => {
  it.each([
    ['vanilla', createVanillaDatasetPort],
    ['react', createReactDatasetPort],
    ['vue', createVueDatasetPort],
  ] as const)('%s 保留告警、故障参数与取消前快照', async (_host, createPort) => {
    let mode = 'success';
    const sent: unknown[] = [];
    const port = createPort({
      api: {
        listDatasets: async () => ({ ok: true, data: { groups: [], items: [] } }),
        describeDataset: async () => ({ ok: true, data: null }),
        queryDataset: async (_datasetId, params) => {
          sent.push(params);
          if (mode === 'cancel')
            return { ok: false, error: { code: 'ABORTED', message: 'cancelled', status: 0 } };
          return {
            ok: true,
            data:
              mode === 'invalid'
                ? { fields: [], rows: 'invalid' }
                : {
                    fields: [
                      { id: 'level', label: '等级', valueType: 'string' },
                      { id: 'deviceName', label: '设备', valueType: 'string' },
                      { id: 'message', label: '消息', valueType: 'string' },
                    ],
                    rows: [{ level: 'high', deviceName: '设备一', message: '温度告警' }],
                  },
          };
        },
      },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      failCode: () => '500',
    });
    const query = () =>
      port.query(
        { datasetId: 'monitor.alarms', dataSourceId: 'alarms', params: { enabled: false } },
        { signal: new AbortController().signal },
      );
    expect((await query()).ok).toBe(true);
    expect(sent).toEqual([{ enabled: 'false', fail: '500' }]);
    expect(port.snapshot()).toMatchObject({
      alarms: [{ level: 'high', deviceName: '设备一', message: '温度告警' }],
      lastOutcome: { ok: true },
    });
    mode = 'invalid';
    expect(await query()).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_INVALID' }],
    });
    expect(port.snapshot().lastOutcome).toMatchObject({ ok: false, code: 'HOST_DATASET_INVALID' });
    const beforeCancel = port.snapshot();
    mode = 'cancel';
    expect(await query()).toEqual({ ok: false, diagnostics: [] });
    expect(port.snapshot()).toEqual(beforeCancel);
  });

  it.each([
    ['vanilla', createVanillaDatasetPort],
    ['react', createReactDatasetPort],
    ['vue', createVueDatasetPort],
  ] as const)('%s 目录剥除 groups 并保留业务 API 返回的 nextCursor', async (_host, createPort) => {
    const port = createPort({
      api: {
        listDatasets: async () => ({
          ok: true,
          data: {
            groups: [],
            items: [{ datasetId: 'orders', name: '订单', description: null }],
            nextCursor: 'opaque:2/+',
          },
        }),
        describeDataset: async () => ({ ok: true, data: null }),
        queryDataset: async () => ({ ok: true, data: null }),
      },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(
      await port.list({ query: '', limit: 10, signal: new AbortController().signal }),
    ).toMatchObject({
      ok: true,
      value: { items: [{ datasetId: 'orders' }], nextCursor: 'opaque:2/+' },
    });
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
