import type { ScreenJsonObject } from '@base-screen/contracts';
import {
  type BaseScreenConditionalStylePort,
  type BaseScreenMaterialDataState,
  type BaseScreenMaterialModel,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { diagnostic, prefixDiagnostics } from './renderer-diagnostics.js';
import type { RendererState } from './renderer-state.js';
import type { RenderCandidate } from './renderer-types.js';
import { evaluateScreenComponentStyleRules } from './style-rules.js';

/**
 * ADR-0058/0059：candidate.model.style 始终为 canonical 基础样式；effective style 按当前
 * dataState 求值派生，合并顺序固定 base → 命中 styleRules → conditionalStylePort 覆盖
 * （同键后写覆盖先写），不回写文档。端口覆盖 fail-closed：非法覆盖（styleSchema 校验
 * 不过）与 resolve 抛异常都忽略端口覆盖、保留 base+规则结果并上报诊断，不中断渲染。
 */
export function resolveEffectiveModel(
  state: RendererState,
  candidate: RenderCandidate,
  dataState: BaseScreenMaterialDataState,
): BaseScreenMaterialModel {
  const ruleOverrides = evaluateScreenComponentStyleRules(
    candidate.component.styleRules,
    dataState,
  );
  let style =
    ruleOverrides === undefined
      ? candidate.model.style
      : { ...candidate.model.style, ...ruleOverrides };
  const port = state.options.conditionalStylePort;
  if (port !== undefined) {
    const overrides = callConditionalStylePort(state, port, candidate.component.id, dataState);
    if (overrides !== undefined) {
      const validated = validateBaseScreenMaterialStyle(
        { ...style, ...overrides },
        candidate.entry.manifest.styleSchema,
      );
      if (validated.ok) {
        style = validated.value;
      } else {
        for (const item of prefixDiagnostics(validated.diagnostics, [
          'components',
          candidate.component.id,
          'conditionalStyle',
        ])) {
          state.options.onDiagnostic?.(item);
        }
      }
    }
  }
  return { ...candidate.model, dataState, style };
}

/** 端口异常隔离（ADR-0059）：忽略本次覆盖并上报诊断，不影响其他组件与整次渲染。 */
function callConditionalStylePort(
  state: RendererState,
  port: BaseScreenConditionalStylePort,
  componentId: string,
  dataState: BaseScreenMaterialDataState,
): ScreenJsonObject | undefined {
  try {
    return port.resolve({ componentId, dataState });
  } catch {
    state.options.onDiagnostic?.(
      diagnostic(
        'PLUGIN_CORE_RENDER_FAILED',
        ['components', componentId, 'conditionalStyle'],
        'Conditional style port resolve raised an exception.',
      ),
    );
    return undefined;
  }
}
