import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenPluginDesignSnapshot,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';
import { cloneAndFreeze } from '../../tools/designer-json-snapshot.js';

export interface CreateBaseScreenCorePluginDesignReadPortOptions {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getSelection: () => ScreenInteractionState;
}

/**
 * 只读侧的 Core adapter：与 createBaseScreenCorePluginCommandPort 成对，让插件先读当前设计
 * 状态、再决定发哪条 `ScreenDocumentCommand`。文档与选区在同一次调用内读取，避免撕裂快照。
 */
export function createBaseScreenCorePluginDesignReadPort(
  options: CreateBaseScreenCorePluginDesignReadPortOptions,
): PluginDesignReadPort {
  return Object.freeze({
    async read(): Promise<ScreenParseResult<BaseScreenPluginDesignSnapshot>> {
      const document = options.getDocument();
      if (document === undefined) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'PLUGIN_CORE_SESSION_INVALID',
              path: [],
              message: 'Designer has no document to read.',
            },
          ],
        };
      }
      const selection = options.getSelection();
      return {
        ok: true,
        value: Object.freeze({
          document: cloneAndFreeze(document),
          selectedComponentIds: Object.freeze([...selection.selectedComponentIds]),
          focusedComponentId: selection.focusedComponentId,
        }),
        diagnostics: [],
      };
    },
  });
}
