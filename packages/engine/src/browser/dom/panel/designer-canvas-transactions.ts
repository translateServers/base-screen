import type {
  ScreenCanvasBackground,
  ScreenDocument,
  ScreenParseResult,
  ScreenThemeSlot,
} from '@base-screen/contracts';
import {
  isBoundedScreenImageUrl,
  isScreenThemeSlot,
  SCREEN_THEME_STATUS_DEFAULTS,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenCanvasScaleMode } from '../../../common/operations/canvas/canvas-presentation.js';
import { roundScreenGeometry } from '../../../common/operations/element/designer-geometry.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  type ColorPaletteState,
  parseColorPaletteValue,
  serializeColorPaletteValue,
} from '../color/designer-color-palette-model.js';
import { success } from './designer-panel-transaction-utils.js';

export type DesignerCanvasScaleMode = BaseScreenCanvasScaleMode;

/** 作者面初始化色板的中性默认值；预设库与换肤策略仍归宿主（ADR-0098）。 */
const SCREEN_THEME_AUTHORING_BASE_PALETTE = {
  primary: '#38bdf8',
  text: '#e5e7eb',
  textSecondary: '#9ca3af',
  background: '#0f172a',
  accent: '#22d3ee',
  accentSecondary: '#a78bfa',
} as const;

/** 状态色位（ADR-0110 §2.6.4）沿用内置默认色；色板里省略时也按它们解析。 */
export const SCREEN_THEME_AUTHORING_DEFAULT_PALETTE: Readonly<Record<ScreenThemeSlot, string>> = {
  ...SCREEN_THEME_AUTHORING_BASE_PALETTE,
  ...SCREEN_THEME_STATUS_DEFAULTS,
};

/** 色板编辑一次提交整副色板：半套色板会让 theme: 引用解析到空洞，命令层也拒绝。 */
export function createThemePaletteTransaction(
  document: ScreenDocument,
  slot: string,
  value: string,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isScreenThemeSlot(slot) || value.trim() === '') return undefined;
  // 没有色板时只落六个基础色位：状态色位省略即取默认色，不必写进文档。
  const base = document.theme?.palette ?? SCREEN_THEME_AUTHORING_BASE_PALETTE;
  return success({
    commands: [{ type: 'update-theme', patch: { ...base, [slot]: value } }],
  });
}

export interface DesignerCanvasPresentationSettings {
  opacity: number;
  scaleMode: DesignerCanvasScaleMode;
  backgroundAutoFill: boolean;
  disableComponentLoading: boolean;
}

export function createDesignerCanvasPresentationSettings(): DesignerCanvasPresentationSettings {
  return {
    opacity: 1,
    scaleMode: 'fill',
    backgroundAutoFill: true,
    disableComponentLoading: false,
  };
}

/**
 * 画布背景与检查器调色板的状态完全同构：`mode` 对应背景类型，`solid` 对应单色，
 * `stops` / `angle` / `x` / `y` 对应渐变色标与参数。因此画布背景不再自带一套类型、
 * 色标控件，而是直接由 `createDesignerColorPalette` 编辑，读写两侧共用同一个序列化
 * 形态（CSS 颜色 / 渐变字符串），这里只做 canonical 文档与调色板状态之间的单向映射。
 */
export function canvasBackgroundPaletteValue(document: ScreenDocument | undefined): string {
  if (document === undefined) return '';
  const background = document.canvas.background;
  if (background === undefined) return document.canvas.backgroundColor;
  return serializeColorPaletteValue(canvasBackgroundPaletteState(background));
}

function canvasBackgroundPaletteState(background: ScreenCanvasBackground): ColorPaletteState {
  if (background.type === 'solid') {
    return {
      mode: 'solid',
      solid: background.color,
      stops: defaultGradientStops(),
      angle: 90,
      x: 50,
      y: 50,
    };
  }
  if (background.type === 'linear-gradient') {
    return {
      mode: 'linear-gradient',
      solid: background.stops[0]?.color ?? '#000000',
      stops: background.stops,
      angle: background.angle,
      x: 50,
      y: 50,
    };
  }
  return {
    mode: 'radial-gradient',
    solid: background.stops[0]?.color ?? '#000000',
    stops: background.stops,
    angle: 90,
    x: background.position.x,
    y: background.position.y,
  };
}

function defaultGradientStops(): ColorPaletteState['stops'] {
  return [
    { color: '#000000', position: 0 },
    { color: '#ffffff', position: 100 },
  ];
}

/**
 * 调色板提交的整段颜色值 → `update-canvas`：单色同时写 `background` 与兼容字段
 * `backgroundColor`，渐变只写 `background`（契约要求 `backgroundColor` 始终存在，
 * 切换类型时保留旧值，与既有语义一致）。
 */
export function createCanvasBackgroundPaletteTransaction(
  document: ScreenDocument | undefined,
  value: string,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const state = parseColorPaletteValue(trimmed);
  if (state.mode === 'solid') {
    const background: ScreenCanvasBackground = { type: 'solid', color: state.solid };
    return success({
      commands: [
        {
          type: 'update-canvas',
          patch: { background, backgroundColor: state.solid },
        },
      ],
    });
  }
  if (state.stops.length < 2 || !areAscendingStops(state.stops)) return undefined;
  const background: ScreenCanvasBackground =
    state.mode === 'linear-gradient'
      ? { type: 'linear-gradient', angle: state.angle, stops: state.stops }
      : {
          type: 'radial-gradient',
          position: { x: state.x, y: state.y },
          stops: state.stops,
        };
  return success({
    commands: [{ type: 'update-canvas', patch: { background } }],
  });
}

export function createCanvasTransaction(
  document: ScreenDocument | undefined,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined || target.dataset.canvasProperty === undefined) return undefined;
  const property = target.dataset.canvasProperty;
  if (property === 'backgroundImage') {
    // 非空输入提交 URL（失败关闭校验在 canonical 解析处拒绝）；清空输入提交删除语义，
    // 与 setCanvasBackgroundImage(null) 一致（同时清除 fit）。
    const value = target.value.trim();
    if (value !== '' && !isBoundedScreenImageUrl(value)) {
      return canvasBackgroundImageFailure();
    }
    return success({
      commands: [
        {
          type: 'update-canvas',
          patch:
            value === ''
              ? { backgroundImage: null, backgroundImageFit: null }
              : { backgroundImage: value },
        },
      ],
    });
  }
  if (property === 'backgroundImageFit') {
    if (target.value !== 'cover' && target.value !== 'contain') {
      return undefined;
    }
    return success({
      commands: [{ type: 'update-canvas', patch: { backgroundImageFit: target.value } }],
    });
  }
  if (property === 'size') {
    // 尺寸预设：值形如 `1920x1080`；「自定义」等其他值不提交，由宽高输入框单独改。
    const match = /^(\d+)x(\d+)$/.exec(target.value);
    if (match === null) return undefined;
    return success({
      commands: [
        {
          type: 'update-canvas',
          patch: { width: Number(match[1]), height: Number(match[2]) },
        },
      ],
    });
  }
  const value = Number(target.value);
  if (!Number.isFinite(value) || value <= 0 || (property !== 'width' && property !== 'height')) {
    return undefined;
  }
  return success({
    commands: [{ type: 'update-canvas', patch: { [property]: roundScreenGeometry(value) } }],
  });
}

function areAscendingStops(stops: readonly { readonly position: number }[]): boolean {
  return stops.every((stop, index) => index === 0 || stops[index - 1]!.position < stop.position);
}

function canvasBackgroundImageFailure(): ScreenParseResult<ScreenDocumentTransaction> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'DOCUMENT_FIELD_INVALID',
        path: ['canvas', 'backgroundImage'],
        message: DESIGNER_UI_TEXT.propertiesPanel.backgroundImageInvalid,
      },
    ],
  };
}
