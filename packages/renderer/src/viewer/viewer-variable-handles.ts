import {
  readScreenVariableRecord,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenVariableEntry,
  type ScreenVariableHandle,
} from '@base-screen/contracts';

export interface ViewerVariableHandlesHost {
  readonly readDocument: () => ScreenDocument | undefined;
  readonly readVariables: () => ScreenJsonObject | undefined;
  readonly setValue: (id: string, value: ScreenJsonValue) => ScreenParseResult<null>;
  readonly reportListenerFailure: () => void;
}

/**
 * 变量写入的唯一校验入口（宿主 `handle.set` 与蓝图 `set-variable` 共用）。
 *
 * 判据是**值是否派生**，不是 `controlled`：
 * - `inline` 值由文档/宿主拥有 ⇒ 恒可写（迁移后的静态变量、计数器都靠这条）。
 * - `data-source-field` 值每次实例刷新都会被重算覆盖 ⇒ 拒写，否则写进去的值会在下一次
 *   刷新时静默丢失。
 *
 * `controlled` 与写权限无关（历史语义：它只决定「值未就绪时初始值是否让位给外部值」，
 * 见 `blueprint/runtime-compile.ts` 与旧 `set-variable` 分发——两处都不做写权限判断）。
 *
 * @returns 不可写时返回失败结果；可写返回 `undefined`。
 */
export function checkViewerVariableWritable(
  entry: ScreenVariableEntry,
): ScreenParseResult<null> | undefined {
  const record = readScreenVariableRecord(entry);
  if (record.value.kind !== 'data-source-field') return undefined;
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'VARIABLE_WRITE_FORBIDDEN',
        path: ['variables', record.id],
        message: 'Derived variable values are overwritten by the next data source refresh.',
      },
    ],
  };
}

/**
 * 应用一次「变量写入」的守卫：派生变量被蓝图改写时回滚为原值。
 *
 * 蓝图分发是纯函数、会一次性算出所有 `set-variable` 的结果；写入权限只能在**落地**
 * 这一层统一裁决（否则句柄拒绝、蓝图照写的双口径又回来了）。
 *
 * @param document 用于查每条变量的取值引用形态。
 * @param previous 写入前的变量快照。
 * @param next 分发算出的新快照。
 * @returns 已把不可写变量的改动回滚掉的快照。
 */
export function applyVariableWriteGuard(
  document: ScreenDocument | undefined,
  previous: ScreenJsonObject,
  next: ScreenJsonObject,
): ScreenJsonObject {
  if (document === undefined) return next;
  let guarded: Record<string, ScreenJsonValue> | undefined;
  for (const entry of document.variables) {
    const record = readScreenVariableRecord(entry);
    if (viewerVariableValuesEqual(previous[record.id], next[record.id])) continue;
    if (checkViewerVariableWritable(entry) === undefined) continue;
    guarded ??= { ...next };
    guarded[record.id] = previous[record.id] ?? null;
  }
  return guarded ?? next;
}

export class ViewerVariableHandles {
  readonly #listeners = new Map<string, Set<(value: ScreenJsonValue) => void>>();

  constructor(private readonly host: ViewerVariableHandlesHost) {}

  get(id: string): ScreenVariableHandle | undefined {
    const entry = this.host.readDocument()?.variables.find((variable) => variable.id === id);
    if (entry === undefined) return undefined;
    const handles = this;
    const record = readScreenVariableRecord(entry);
    return {
      id,
      get value() {
        const runtime = handles.host.readVariables()?.[id];
        if (runtime !== undefined) return runtime;
        // 回落顺序：运行期值 → 文档值（inline 用 value，派生用 initialValue）→ null。
        return record.value.kind === 'inline' ? record.value.value : record.initialValue;
      },
      set: (value) => {
        const forbidden = checkViewerVariableWritable(entry);
        if (forbidden !== undefined) return forbidden;
        return handles.host.setValue(id, value);
      },
      onChange: (listener) => handles.subscribe(id, listener),
    };
  }

  clear(): void {
    this.#listeners.clear();
  }

  notify(previous: ScreenJsonObject, next: ScreenJsonObject): readonly string[] {
    const changed = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(
      (id) => !viewerVariableValuesEqual(previous[id], next[id]),
    );
    for (const variableId of changed) {
      const value = next[variableId] ?? null;
      for (const listener of this.#listeners.get(variableId) ?? []) {
        try {
          listener(value);
        } catch {
          this.host.reportListenerFailure();
        }
      }
    }
    return changed;
  }

  private subscribe(id: string, listener: (value: ScreenJsonValue) => void): () => void {
    const listeners = this.#listeners.get(id) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(id, listeners);
    return () => {
      // 取消订阅必须移除「监听函数」本身（旧实现误删 id，导致监听永不释放）。
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(id);
    };
  }
}

export function viewerVariableValuesEqual(
  left: ScreenJsonValue | undefined,
  right: ScreenJsonValue | undefined,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
