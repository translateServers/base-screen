import type {
  ScreenHostCatalogDescriptor,
  ScreenHostCatalogPage,
  ScreenHostCatalogPort,
  ScreenHostCatalogResolveRequest,
  ScreenHostCatalogSummary,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { Logger } from '../lib/logger';
import type { DatasetAlertRow } from './host-dataset-port';

/** `production.clock`：宿主真实时钟（T05 的 A9 靠它证明"读音会变"）。 */
export const HOST_VARIABLE_CLOCK = 'production.clock';
/** `production.notice`：最近一批告警里最高等级那条的播报文案。 */
export const HOST_VARIABLE_NOTICE = 'production.notice';
/** `production.status`：数据源在线/离线短状态（由 observer 的失败计数驱动）。 */
export const HOST_VARIABLE_STATUS = 'production.status';

/** 状态源：viewer 的 observer 计数器投影，不额外发请求。 */
export interface HostVariableStatus {
  readonly online: boolean;
  readonly failures: number;
  readonly lastFailureAt: number | undefined;
}

export interface HostCatalogPortDeps {
  readonly clock?: () => Date;
  readonly noticeSource?: () => readonly DatasetAlertRow[];
  readonly statusSource?: () => HostVariableStatus;
  readonly logger?: Logger;
}

interface CatalogEntry extends ScreenHostCatalogSummary {
  readonly previewable: boolean;
}

const ENTRIES: readonly CatalogEntry[] = [
  {
    sourceId: HOST_VARIABLE_CLOCK,
    name: '当前时间',
    description: '本地时间（HH:mm:ss），每秒刷新。',
    previewable: true,
  },
  {
    sourceId: HOST_VARIABLE_NOTICE,
    name: '告警播报',
    description: '最近一批告警里等级最高的一条（critical > warning），无异常时给出兜底文案。',
    previewable: true,
  },
  {
    sourceId: HOST_VARIABLE_STATUS,
    name: '数据源状态',
    description: '数据源在线/离线与累计失败次数，随数据请求实时更新。',
    previewable: true,
  },
];

const CLOCK_PATTERN = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/**
 * 来源目录端口：`host-catalog` 与 `url-query` 两种来源共用这一个端口。
 *
 * - `list` / `describe` 供设计器的变量面板列出宿主可绑定的来源；
 * - `resolve` 供渲染器求值 `data-source` 变量（`production.clock` / `notice` / `status`）。
 *
 * **不向运行时抛异常**：来源取数抛错时返回失败的诊断结果（不是 reject），渲染器会把
 * 该实例记为 error 并让变量沿用 `initialValue`——"少一个状态文案"远好于"整块屏不渲染"。
 */
export function createHostCatalogPort(deps: HostCatalogPortDeps = {}): ScreenHostCatalogPort {
  const clock = deps.clock ?? (() => new Date());
  const noticeSource = deps.noticeSource ?? (() => []);
  const statusSource =
    deps.statusSource ?? (() => ({ online: true, failures: 0, lastFailureAt: undefined }));

  return {
    async list(request): Promise<ScreenParseResult<ScreenHostCatalogPage>> {
      if (request.signal.aborted) return cancelled();
      const needle = request.query.trim().toLowerCase();
      const matched = ENTRIES.filter((entry) => matches(entry, needle));
      const limit = Math.max(1, Math.trunc(request.limit));
      const offset = readCursor(request.cursor);
      const page = matched.slice(offset, offset + limit);
      const next = offset + page.length;
      return ok({
        items: page.map(toSummary),
        ...(next < matched.length ? { nextCursor: String(next) } : {}),
      });
    },

    async describe(request): Promise<ScreenParseResult<ScreenHostCatalogDescriptor>> {
      const entry = ENTRIES.find((item) => item.sourceId === request.sourceId);
      if (entry === undefined) {
        return failure('HOST_VARIABLE_DESCRIPTOR_INVALID', `未知的业务来源：${request.sourceId}`);
      }
      return ok({
        ...toSummary(entry),
        parameters: [],
        readOnly: true,
        previewable: entry.previewable,
      });
    },

    async resolve(
      request: ScreenHostCatalogResolveRequest,
    ): Promise<ScreenParseResult<ScreenJsonValue>> {
      if (request.signal.aborted) return cancelled();
      try {
        return ok(resolveValue(request, { clock, noticeSource, statusSource }));
      } catch (error: unknown) {
        deps.logger?.warn('host catalog resolve failed', {
          sourceId: request.sourceId,
          purpose: request.purpose,
          error,
        });
        return failure('HOST_RESOURCE_FAILED', `业务来源读取失败：${request.sourceId}`);
      }
    },
  };
}

function resolveValue(
  request: ScreenHostCatalogResolveRequest,
  sources: {
    readonly clock: () => Date;
    readonly noticeSource: () => readonly DatasetAlertRow[];
    readonly statusSource: () => HostVariableStatus;
  },
): ScreenJsonValue {
  switch (request.sourceId) {
    case HOST_VARIABLE_CLOCK:
      return CLOCK_PATTERN(sources.clock());
    case HOST_VARIABLE_NOTICE:
      return noticeText(sources.noticeSource());
    case HOST_VARIABLE_STATUS:
      return statusText(sources.statusSource());
    default:
      throw new Error(`Unknown host catalog source: ${request.sourceId}`);
  }
}

/** 前缀过滤（`query` 是作者正在输入的片段）：sourceId 与中文名都参与匹配。 */
function matches(entry: CatalogEntry, needle: string): boolean {
  if (needle === '') return true;
  return entry.sourceId.toLowerCase().includes(needle) || entry.name.toLowerCase().includes(needle);
}

function readCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function toSummary(entry: CatalogEntry): ScreenHostCatalogSummary {
  return {
    sourceId: entry.sourceId,
    name: entry.name,
    description: entry.description,
  };
}

/** 告警播报：critical 优先，其次 warning；都没有时说"本班无重大异常"。 */
export function noticeText(alerts: readonly DatasetAlertRow[]): string {
  const critical = alerts.find((alert) => alert.level === 'critical');
  if (critical !== undefined) return truncate(`严重告警：${alertBody(critical)}`);
  const warning = alerts.find((alert) => alert.level === 'warning');
  if (warning !== undefined) return truncate(`一般告警：${alertBody(warning)}`);
  return '本班无重大异常';
}

/** 状态文案：在线只给四字；离线要给出失败次数与最近失败时刻（值班员据此判断严重程度）。 */
export function statusText(status: HostVariableStatus): string {
  if (status.online) return '数据源在线';
  const since =
    status.lastFailureAt === undefined
      ? ''
      : ` · 最近 ${CLOCK_PATTERN(new Date(status.lastFailureAt))}`;
  return `数据源离线 · ${status.failures} 次失败${since}`;
}

function alertBody(alert: DatasetAlertRow): string {
  const name = alert.deviceName.trim();
  const message = alert.message.trim();
  if (name === '') return message;
  if (message === '') return name;
  return `${name} ${message}`;
}

/** 按字符（而非 UTF-16 码元）截断，避免把 emoji 或生僻字切成半个。 */
function truncate(text: string, limit = 120): string {
  const characters = [...text];
  return characters.length <= limit ? text : `${characters.slice(0, limit).join('')}…`;
}

function ok<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function cancelled<T>(): ScreenParseResult<T> {
  return { ok: false, diagnostics: [] };
}

function failure<T>(
  code: 'HOST_VARIABLE_DESCRIPTOR_INVALID' | 'HOST_RESOURCE_FAILED',
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
