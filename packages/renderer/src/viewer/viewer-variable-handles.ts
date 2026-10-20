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
 * `controlled: false` 表示该变量由文档/数据源拥有，不接受外部写入；两条写入路径都必须
 * 先过这里，避免「句柄拒绝、蓝图照写」这种双口径。
 *
 * @returns 不可写时返回失败结果；可写返回 `undefined`。
 */
export function checkViewerVariableWritable(
  entry: ScreenVariableEntry,
): ScreenParseResult<null> | undefined {
  const record = readScreenVariableRecord(entry);
  if (record.controlled) return undefined;
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'VARIABLE_WRITE_FORBIDDEN',
        path: ['variables', record.id],
        message: 'Variable is not writable: it is owned by its data source.',
      },
    ],
  };
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
