import {
  contrastRatio,
  formatCssColor,
  minimumContrastRatio,
  type RgbColor,
  suggestReadableColor,
} from '@base-screen/core';

/**
 * 守卫的输入是**已测量**的样本，不是文档字段：对比度只有在真实渲染后才有意义
 * （继承、令牌、条件样式都会改变最终颜色）。测量由浏览器层完成，这里只做判定。
 */
export interface DesignerContrastSample {
  readonly componentId: string;
  readonly componentName: string;
  readonly textColor: RgbColor;
  readonly backgroundColor: RgbColor;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  /** 文档中驱动该文本色的样式值；`null` 表示颜色不来自文档样式，无法自动修复。 */
  readonly declaredColor: string | null;
}

export interface DesignerContrastIssue {
  readonly componentId: string;
  readonly componentName: string;
  readonly ratio: number;
  readonly requiredRatio: number;
  readonly textColor: string;
  readonly backgroundColor: string;
  /** 可应用的建议色；`null` = 该背景上无解或颜色不来自文档样式。 */
  readonly suggestedColor: string | null;
  /** 建议色的对比度；`null` 同 `suggestedColor`。 */
  readonly suggestedRatio: number | null;
}

export interface DesignerContrastGuardResult {
  readonly checked: number;
  readonly issues: readonly DesignerContrastIssue[];
}

/**
 * 判定对比度守卫。同一组件有多段文本时只保留最差的一段——守卫回答的是
 * 「这个组件现在能不能读」，而不是逐节点列清单。
 */
export function evaluateContrastGuard(
  samples: readonly DesignerContrastSample[],
): DesignerContrastGuardResult {
  const worst = new Map<string, DesignerContrastIssue>();
  let checked = 0;
  for (const sample of samples) {
    if (!(sample.fontSizePx > 0)) continue;
    checked++;
    const requiredRatio = minimumContrastRatio(sample.fontSizePx, sample.fontWeight);
    const ratio = contrastRatio(sample.textColor, sample.backgroundColor);
    if (ratio >= requiredRatio) continue;
    const existing = worst.get(sample.componentId);
    if (existing !== undefined && existing.ratio <= ratio) continue;
    const suggested = suggestReadableColor(sample.textColor, sample.backgroundColor, requiredRatio);
    const repairable = suggested !== undefined && sample.declaredColor !== null;
    worst.set(sample.componentId, {
      componentId: sample.componentId,
      componentName: sample.componentName,
      ratio,
      requiredRatio,
      textColor: formatCssColor(sample.textColor),
      backgroundColor: formatCssColor(sample.backgroundColor),
      suggestedColor: repairable ? formatCssColor(suggested) : null,
      suggestedRatio: repairable ? contrastRatio(suggested, sample.backgroundColor) : null,
    });
  }
  return {
    checked,
    issues: [...worst.values()].sort((a, b) => a.ratio - b.ratio),
  };
}

/**
 * 守卫的对外快照：宿主、评审页与工具面读同一份，不解析 DOM。
 * `checked: 0` 表示还没测过，不等于通过。
 */
export interface DesignerGuardSnapshot {
  readonly enabled: boolean;
  readonly checked: number;
  readonly truncated: boolean;
  readonly issues: readonly DesignerContrastIssue[];
}

/** 守卫结果变化（测量完成、预览、应用、开关）。 */
export const BASE_SCREEN_GUARD_CHANGE_EVENT = 'base-screen-guard-change';
