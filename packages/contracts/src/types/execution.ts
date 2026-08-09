/**
 * 按次解析提供的非持久化执行上下文与生命周期观察事件（Data Runtime
 * Hardening / DRH-R8）。上下文绝不写入 ScreenDocument；观察事件绝不携带
 * 参数值、数据集载荷或敏感消息；观察者异常被隔离。
 */

export type ScreenResourceExecutionMode = 'design' | 'preview' | 'viewer';
export type ScreenResourceExecutionTrigger =
  | 'initial'
  | 'manual'
  | 'polling'
  | 'variable'
  | 'document-change';

export interface ScreenResourceExecutionContext {
  readonly instanceId: string;
  readonly mode: ScreenResourceExecutionMode;
  readonly trigger: ScreenResourceExecutionTrigger;
  readonly traceId: string;
  readonly projectId?: string;
  readonly documentRevision?: string;
}

export type ScreenResourceObserverEventType =
  | 'started'
  | 'shared'
  | 'succeeded'
  | 'failed'
  | 'aborted'
  | 'timed-out'
  | 'adapted';

export interface ScreenResourceObserverEvent {
  readonly type: ScreenResourceObserverEventType;
  /** 请求 ID：单次解析的稳定标识，用于跨事件关联。 */
  readonly requestId: string;
  readonly componentId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly context: ScreenResourceExecutionContext;
  readonly durationMs: number;
  readonly fieldCount?: number;
  readonly rowCount?: number;
  readonly code?: string;
}

/** 观察者：接收生命周期事件；抛出的异常必须被调用方隔离，不得中断解析。 */
export interface ScreenResourceObserver {
  (event: ScreenResourceObserverEvent): void;
}
