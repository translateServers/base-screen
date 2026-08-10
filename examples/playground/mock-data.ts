import type {
  ScreenDatasetDescriptor,
  ScreenDatasetPage,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenParseResult,
} from '@base-screen/contracts';

export type PlaygroundDatasetId = 'orders' | 'inventory';

export interface PlaygroundRuntimeState {
  region: string;
  datasetId: PlaygroundDatasetId;
  revision: number;
  delayed: boolean;
  failed: boolean;
  requests: PlaygroundRequestLog[];
}

export interface PlaygroundRequestLog {
  readonly componentId: string;
  readonly resourceId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly at: string;
}

const DATASETS: readonly ScreenDatasetDescriptor[] = [
  {
    resourceType: 'dataset',
    resourceId: 'orders',
    name: '订单趋势',
    description: '按区域聚合的订单金额，可同时供表格和图表使用。',
    fields: [
      { id: 'category', label: '区域', valueType: 'string' },
      { id: 'amount', label: '订单金额', valueType: 'number' },
      { id: 'orders', label: '订单数', valueType: 'number' },
    ],
    parameters: [
      {
        name: 'limit',
        label: '返回条数',
        editor: 'number',
        defaultValue: 5,
      },
      {
        name: 'region',
        label: '区域',
        editor: 'text',
        defaultValue: 'north',
      },
    ],
  },
  {
    resourceType: 'dataset',
    resourceId: 'inventory',
    name: '库存概览',
    description: '按区域展示库存数量和缺货风险。',
    fields: [
      { id: 'category', label: '区域', valueType: 'string' },
      { id: 'amount', label: '库存量', valueType: 'number' },
      { id: 'orders', label: '缺货风险', valueType: 'number' },
    ],
    parameters: [
      {
        name: 'limit',
        label: '返回条数',
        editor: 'number',
        defaultValue: 5,
      },
      {
        name: 'region',
        label: '区域',
        editor: 'text',
        defaultValue: 'north',
      },
    ],
  },
];

const ROWS: Readonly<Record<PlaygroundDatasetId, readonly ScreenJsonObject[]>> = {
  orders: [
    { category: 'north', amount: 42, orders: 18 },
    { category: 'north', amount: 38, orders: 16 },
    { category: 'north', amount: 45, orders: 19 },
    { category: 'north', amount: 51, orders: 22 },
    { category: 'south', amount: 36, orders: 15 },
    { category: 'south', amount: 33, orders: 14 },
    { category: 'south', amount: 40, orders: 17 },
    { category: 'south', amount: 44, orders: 18 },
    { category: 'east', amount: 28, orders: 11 },
    { category: 'east', amount: 31, orders: 13 },
    { category: 'east', amount: 27, orders: 12 },
    { category: 'east', amount: 35, orders: 15 },
    { category: 'west', amount: 24, orders: 9 },
    { category: 'west', amount: 26, orders: 10 },
    { category: 'west', amount: 22, orders: 8 },
    { category: 'west', amount: 30, orders: 12 },
    { category: 'central', amount: 19, orders: 7 },
    { category: 'central', amount: 21, orders: 8 },
    { category: 'central', amount: 25, orders: 10 },
    { category: 'central', amount: 28, orders: 11 },
  ],
  inventory: [
    { category: 'north', amount: 88, orders: 4 },
    { category: 'north', amount: 84, orders: 3 },
    { category: 'north', amount: 90, orders: 5 },
    { category: 'north', amount: 82, orders: 4 },
    { category: 'south', amount: 71, orders: 7 },
    { category: 'south', amount: 75, orders: 6 },
    { category: 'south', amount: 68, orders: 8 },
    { category: 'south', amount: 79, orders: 9 },
    { category: 'east', amount: 64, orders: 8 },
    { category: 'east', amount: 61, orders: 7 },
    { category: 'east', amount: 66, orders: 9 },
    { category: 'east', amount: 70, orders: 10 },
    { category: 'west', amount: 52, orders: 12 },
    { category: 'west', amount: 55, orders: 13 },
    { category: 'west', amount: 49, orders: 11 },
    { category: 'west', amount: 58, orders: 15 },
    { category: 'central', amount: 45, orders: 15 },
    { category: 'central', amount: 48, orders: 16 },
    { category: 'central', amount: 51, orders: 18 },
    { category: 'central', amount: 44, orders: 14 },
  ],
};

export function createPlaygroundRuntimeState(): PlaygroundRuntimeState {
  return {
    region: 'north',
    datasetId: 'orders',
    revision: 0,
    delayed: false,
    failed: false,
    requests: [],
  };
}

export function createPlaygroundDatasetCatalog() {
  return {
    async list(request: {
      readonly query?: string;
    }): Promise<ScreenParseResult<ScreenDatasetPage>> {
      const query = request.query ?? '';
      const items = DATASETS.filter(
        (dataset) => query.length === 0 || dataset.resourceId.includes(query),
      ).map(({ resourceType, resourceId, name, description }) => ({
        resourceType,
        resourceId,
        name,
        description,
      }));
      return { ok: true, value: { items }, diagnostics: [] };
    },
    async describe(request: {
      readonly resourceType: string;
      readonly resourceId: string;
    }): Promise<ScreenParseResult<ScreenDatasetDescriptor>> {
      const descriptor = DATASETS.find(
        (item) =>
          item.resourceType === request.resourceType && item.resourceId === request.resourceId,
      );
      return descriptor === undefined
        ? {
            ok: false,
            diagnostics: [
              {
                severity: 'error',
                code: 'HOST_RESOURCE_FAILED',
                path: [],
                message: 'Playground dataset is unavailable.',
              },
            ],
          }
        : { ok: true, value: descriptor, diagnostics: [] };
    },
  };
}

export function createPlaygroundResourcePort(
  state: PlaygroundRuntimeState,
): ScreenHostResourcePort {
  return {
    async resolve(request, options) {
      state.requests.unshift({
        componentId: request.componentId,
        resourceId: request.resourceId,
        params: request.params,
        at: new Date().toISOString(),
      });
      if (state.delayed) await wait(450, options.signal);
      if (state.failed || request.resourceId === 'playground-error') {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'HOST_RESOURCE_FAILED',
              path: [],
              message: 'Playground dataset failed safely.',
            },
          ],
        };
      }
      const datasetId = request.resourceId === 'inventory' ? 'inventory' : 'orders';
      const limit = readLimit(request.params.limit);
      const selectedRegion = readRegion(request.params.region);
      const revision = state.revision;
      const rows = ROWS[datasetId]
        .filter((row) => selectedRegion === undefined || row.category === selectedRegion)
        .map((row) => ({
          ...row,
          amount: row.amount + revision,
        }))
        .slice(0, limit);
      return {
        ok: true,
        value: {
          fields: DATASETS.find((item) => item.resourceId === datasetId)?.fields ?? [],
          rows,
        },
        diagnostics: [],
      };
    },
  };
}

export function createPlaygroundVariablePort(
  state: PlaygroundRuntimeState,
): ScreenHostVariablePort {
  return {
    async resolve(request) {
      return request.variableId === 'region'
        ? { ok: true, value: state.region, diagnostics: [] }
        : {
            ok: false,
            diagnostics: [
              {
                severity: 'error',
                code: 'HOST_VARIABLE_INVALID',
                path: [request.variableId],
                message: 'Playground variable is unavailable.',
              },
            ],
          };
    },
  };
}

export function listPlaygroundDatasets(): readonly ScreenDatasetDescriptor[] {
  return DATASETS;
}

function readLimit(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 5;
}

function readRegion(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function wait(milliseconds: number, signal: { readonly aborted: boolean }): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
