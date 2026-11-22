/**
 * 推送式数据源（ADR-0104）：宿主订阅端口的事件、连接状态与能力声明。
 *
 * 这些类型只描述「宿主 → 基座」的运行期事件与宿主侧能力，全部 JSON-safe，
 * 不携带任何传输细节（地址、主题、子协议、凭证）。文档里只出现 `updatePolicy.mode: 'push'`。
 */
import type { ScreenDiagnostic } from './diagnostics.js';
import type { ScreenJsonObject, ScreenJsonValue } from './json.js';

/** 序号游标：`epoch` 标识「哪一条流」，`revision` 是流内严格递增的序号。 */
export interface ScreenPushCursor {
  readonly epoch: string;
  readonly revision: number;
}

/**
 * 连接状态（宿主按自己的传输判断）：
 * - `connecting`：首次连接中；
 * - `open`：已连接；
 * - `reconnecting`：短暂断开，宿主正在重连，预期可续上；
 * - `suspended`：长期无连接（网络不可达、主机不可用），宿主仍会周期性重试；
 * - `failed`：不可恢复（鉴权失效、资源被删、服务端要求停止重连），宿主不再重试。
 */
export type ScreenSourceConnectionStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'suspended'
  | 'failed';

/** 推送事件：宿主 → 基座。 */
export type ScreenSourcePushEvent =
  /** 全量快照，替换实例结果。每次（重新）订阅后的首个数据事件必须是它。 */
  | {
      readonly type: 'snapshot';
      readonly value: ScreenJsonValue;
      readonly cursor?: ScreenPushCursor;
    }
  /** 增量追加：仅当当前结果是表格数据集（fields + rows）时合法，rows 必须符合现有 fields。 */
  | {
      readonly type: 'append';
      readonly rows: readonly ScreenJsonObject[];
      readonly cursor?: ScreenPushCursor;
    }
  /** 请重新获取快照：基座按同一请求键 resolve 一次，期间保留当前值。 */
  | { readonly type: 'invalidate' }
  /** 连接状态；`failed` 时可附诊断（只进诊断通道，不直接展示给观众）。 */
  | {
      readonly type: 'status';
      readonly status: ScreenSourceConnectionStatus;
      readonly diagnostic?: ScreenDiagnostic;
    }
  /** 心跳：不带数据，只刷新静默计时。 */
  | { readonly type: 'heartbeat' };

export type ScreenSourcePushEventType = ScreenSourcePushEvent['type'];

export interface ScreenSourcePushSink {
  push(event: ScreenSourcePushEvent): void;
}

/**
 * 宿主侧能力声明：资源类型贡献（`dataResourceType.delivery`）与来源目录项
 * （`ScreenHostCatalogDescriptor.delivery`）同形。缺省视为只支持拉取。
 */
export interface ScreenSourceDelivery {
  readonly push?: {
    /** 是否会发 `append` 增量；缺省为 false（只发 snapshot）。 */
    readonly append?: boolean;
    /** 静默超时：超过该时长无任何事件（含心跳）即判定过期。缺省不判定。 */
    readonly inactivityTimeoutSeconds?: number;
  };
}
