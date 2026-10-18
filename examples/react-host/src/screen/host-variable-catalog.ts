import type {
  ScreenHostVariableCatalogPort,
  ScreenHostVariableDescriptor,
  ScreenHostVariablePage,
  ScreenHostVariableSummary,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  HOST_VARIABLE_CLOCK,
  HOST_VARIABLE_NOTICE,
  HOST_VARIABLE_STATUS,
} from './host-variable-port';

interface CatalogEntry extends ScreenHostVariableSummary {
  readonly previewable: boolean;
}

/**
 * data-source 变量目录：把宿主提供的 3 个动态变量暴露给设计器的变量面板。
 *
 * 只有目录能列出来，作者才可能绑定它们；`previewable: true` 表示设计态可以调用
 * `variables.resolve(...purpose:'authoring-preview')` 拿到示例值（本端口两种 purpose
 * 返回同一份值，因为值本身就是宿主状态，不存在"预览与运行不同"的问题）。
 */
const ENTRIES: readonly CatalogEntry[] = [
  {
    sourceId: HOST_VARIABLE_CLOCK,
    sourceType: 'data-source',
    name: '当前时间',
    description: '宿主本地时间（HH:mm:ss），每秒刷新。',
    previewable: true,
  },
  {
    sourceId: HOST_VARIABLE_NOTICE,
    sourceType: 'data-source',
    name: '告警播报',
    description: '最近一批告警里等级最高的一条（critical > warning），无异常时给出兜底文案。',
    previewable: true,
  },
  {
    sourceId: HOST_VARIABLE_STATUS,
    sourceType: 'data-source',
    name: '数据源状态',
    description: '数据源在线/离线与累计失败次数，由宿主请求观察者驱动。',
    previewable: true,
  },
];

export function createHostVariableCatalog(): ScreenHostVariableCatalogPort {
  return {
    async list(request): Promise<ScreenParseResult<ScreenHostVariablePage>> {
      if (request.signal.aborted) return { ok: true, value: { items: [] }, diagnostics: [] };
      // 目录只服务 data-source；url-query 由基座自带的地址栏通道提供。
      if (request.sourceType !== 'data-source') {
        return { ok: true, value: { items: [] }, diagnostics: [] };
      }
      const needle = request.query.trim().toLowerCase();
      const matched = ENTRIES.filter((entry) => matches(entry, needle));
      const limited = matched.slice(0, Math.max(1, Math.trunc(request.limit)));
      return {
        ok: true,
        value: { items: limited.map(toSummary) },
        diagnostics: [],
      };
    },

    async describe(request): Promise<ScreenParseResult<ScreenHostVariableDescriptor>> {
      const entry = ENTRIES.find((item) => item.sourceId === request.sourceId);
      if (entry === undefined) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'HOST_VARIABLE_DESCRIPTOR_INVALID',
              path: [],
              message: `未知的变量：${request.sourceId}`,
            },
          ],
        };
      }
      return {
        ok: true,
        value: { ...toSummary(entry), previewable: entry.previewable },
        diagnostics: [],
      };
    },
  };
}

/** 前缀过滤（`query` 是作者正在输入的片段）：sourceId 与中文名都参与匹配。 */
function matches(entry: CatalogEntry, needle: string): boolean {
  if (needle === '') return true;
  return (
    entry.sourceId.toLowerCase().startsWith(needle) ||
    entry.sourceId.toLowerCase().includes(needle) ||
    entry.name.toLowerCase().includes(needle)
  );
}

function toSummary(entry: CatalogEntry): ScreenHostVariableSummary {
  return {
    sourceId: entry.sourceId,
    sourceType: entry.sourceType,
    name: entry.name,
    description: entry.description,
  };
}
