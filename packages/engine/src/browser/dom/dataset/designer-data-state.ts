/**
 * 数据面板的派生状态（架构 §5.3）。
 *
 * 七态**互斥**，按优先级取先命中者：
 * `unconfigured → unavailable → readonly → loading → failed → empty → ready`。
 * 这样面板任何时刻只有一个主状态，徽标、提示与禁用规则都不必再各自拼条件。
 */

export type DesignerDataState =
  | 'unconfigured'
  | 'unavailable'
  | 'readonly'
  | 'loading'
  | 'failed'
  | 'empty'
  | 'ready';

/** `unavailable` 的三种成因：端口没接 / 实例不存在 / 宿主拒绝。 */
export type DesignerDataUnavailableReason = 'port-missing' | 'instance-missing' | 'denied';

/** `readonly` 的三种成因：文档只读 / 宿主只读 / 组件被锁定。 */
export type DesignerDataReadonlyReason = 'document' | 'host' | 'locked';

export type DesignerDataStateReason = DesignerDataUnavailableReason | DesignerDataReadonlyReason;

export interface DesignerDataStateInput {
  /** 是否已经配置了数据来源（没配就是 `unconfigured`，其余信号一律不看）。 */
  readonly configured: boolean;
  readonly unavailable?: DesignerDataUnavailableReason | undefined;
  readonly readonly?: DesignerDataReadonlyReason | undefined;
  readonly loading?: boolean | undefined;
  /** 失败原因（诊断码或说明）；有值即 `failed`。 */
  readonly failure?: string | undefined;
  /** 结果为空（有结果但零行）；只在前六态都不命中时才有意义。 */
  readonly empty?: boolean | undefined;
}

export interface DesignerDataStateView {
  readonly state: DesignerDataState;
  readonly reason?: DesignerDataStateReason;
  /** `failed` 时带出的诊断码/说明（面板文案只展示受控内容）。 */
  readonly diagnosticCode?: string;
}

export function deriveDesignerDataState(input: DesignerDataStateInput): DesignerDataStateView {
  if (!input.configured) return { state: 'unconfigured' };
  if (input.unavailable !== undefined) {
    return { state: 'unavailable', reason: input.unavailable };
  }
  if (input.readonly !== undefined) {
    return { state: 'readonly', reason: input.readonly };
  }
  if (input.loading === true) return { state: 'loading' };
  if (input.failure !== undefined) {
    return { state: 'failed', diagnosticCode: input.failure };
  }
  if (input.empty === true) return { state: 'empty' };
  return { state: 'ready' };
}

/**
 * 把派生状态写到面板根节点。
 *
 * 只写 `data-state` / `data-state-reason` 两个属性：本轮不改变任何既有视觉，
 * 徽标样式在下一轮接入（T03b）。
 */
export function applyDesignerDataState(node: HTMLElement, view: DesignerDataStateView): void {
  node.dataset.state = view.state;
  if (view.reason === undefined) delete node.dataset.stateReason;
  else node.dataset.stateReason = view.reason;
}
