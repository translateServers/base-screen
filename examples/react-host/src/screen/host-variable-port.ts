import type {
  ScreenHostVariablePort,
  ScreenHostVariableRequest,
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

export interface HostVariablePortDeps {
  readonly clock?: () => Date;
  readonly noticeSource?: () => readonly DatasetAlertRow[];
  readonly statusSource?: () => HostVariableStatus;
  readonly logger?: Logger;
}

const CLOCK_PATTERN = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/**
 * data-source 变量端口：只处理屏内需要的 3 个宿主状态变量。
 *
 * **容错是硬要求**：`resolveHostVariableBatch` 用 `Promise.all` 聚合，任一变量 reject 会让
 * 整批变成 undefined → 整屏空白。因此这里任何异常都被吞掉并回落 `initialValue`，
 * 只留一条 warn 日志——"少一个状态文案"远好于"整块屏不渲染"。
 */
export function createHostVariablePort(deps: HostVariablePortDeps = {}): ScreenHostVariablePort {
  const clock = deps.clock ?? (() => new Date());
  const noticeSource = deps.noticeSource ?? (() => []);
  const statusSource =
    deps.statusSource ?? (() => ({ online: true, failures: 0, lastFailureAt: undefined }));

  return {
    async resolve(request: ScreenHostVariableRequest): Promise<ScreenParseResult<ScreenJsonValue>> {
      if (request.signal.aborted) return ok(request.initialValue);
      try {
        return ok(resolveValue(request, { clock, noticeSource, statusSource }));
      } catch (error: unknown) {
        deps.logger?.warn('variable resolve failed, falling back to the initial value', {
          variableId: request.variableId,
          sourceId: request.sourceId,
          error,
        });
        return ok(request.initialValue);
      }
    },
  };
}

function resolveValue(
  request: ScreenHostVariableRequest,
  sources: {
    readonly clock: () => Date;
    readonly noticeSource: () => readonly DatasetAlertRow[];
    readonly statusSource: () => HostVariableStatus;
  },
): ScreenJsonValue {
  if (request.sourceType !== 'data-source') return request.initialValue;
  switch (request.sourceId) {
    case HOST_VARIABLE_CLOCK:
      return CLOCK_PATTERN(sources.clock());
    case HOST_VARIABLE_NOTICE:
      return noticeText(sources.noticeSource());
    case HOST_VARIABLE_STATUS:
      return statusText(sources.statusSource());
    default:
      return request.initialValue;
  }
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

function ok(value: ScreenJsonValue): ScreenParseResult<ScreenJsonValue> {
  return { ok: true, value, diagnostics: [] };
}
