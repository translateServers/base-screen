import type {
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenVariableHandle,
} from '@base-screen/contracts';

export interface ViewerVariableHandlesHost {
  readonly readDocument: () => ScreenDocument | undefined;
  readonly readVariables: () => ScreenJsonObject | undefined;
  readonly setValue: (id: string, value: ScreenJsonValue) => ScreenParseResult<null>;
  readonly reportListenerFailure: () => void;
}

export class ViewerVariableHandles {
  readonly #listeners = new Map<string, Set<(value: ScreenJsonValue) => void>>();

  constructor(private readonly host: ViewerVariableHandlesHost) {}

  get(id: string): ScreenVariableHandle | undefined {
    if (!this.host.readDocument()?.variables.some((variable) => variable.id === id))
      return undefined;
    const handles = this;
    return {
      id,
      get value() {
        return (
          handles.host.readVariables()?.[id] ??
          handles.host.readDocument()?.variables.find((variable) => variable.id === id)
            ?.initialValue ??
          null
        );
      },
      set: (value) => handles.host.setValue(id, value),
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
