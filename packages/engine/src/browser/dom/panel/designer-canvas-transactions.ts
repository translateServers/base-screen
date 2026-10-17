import type {
  ScreenCanvasBackground,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import { isBoundedScreenImageUrl } from '@base-screen/contracts';
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
