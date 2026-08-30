import type {
  ScreenCanvasBackground,
  ScreenCanvasColorStop,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import { isBoundedScreenImageUrl } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenCanvasScaleMode } from '../../../canvas-presentation.js';
import { roundScreenGeometry } from '../../../common/operations/designer-geometry.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { success } from './designer-panel-transaction-utils.js';

export type DesignerCanvasScaleMode = BaseScreenCanvasScaleMode;

export interface DesignerCanvasPresentationSettings {
  opacity: number;
  scaleMode: DesignerCanvasScaleMode;
  backgroundAutoFill: boolean;
  disableComponentLoading: boolean;
  thumbnailUrl: string | undefined;
}

export function createDesignerCanvasPresentationSettings(): DesignerCanvasPresentationSettings {
  return {
    opacity: 1,
    scaleMode: 'fill',
    backgroundAutoFill: true,
    disableComponentLoading: false,
    thumbnailUrl: undefined,
  };
}

export interface DesignerCanvasBackgroundDrafts {
  activeType: ScreenCanvasBackground['type'];
  solid: Extract<ScreenCanvasBackground, { readonly type: 'solid' }>;
  linear: Extract<ScreenCanvasBackground, { readonly type: 'linear-gradient' }>;
  radial: Extract<ScreenCanvasBackground, { readonly type: 'radial-gradient' }>;
  committedSignature: string;
}

export function createDesignerCanvasBackgroundDrafts(
  document?: ScreenDocument,
): DesignerCanvasBackgroundDrafts {
  const background = document?.canvas.background;
  const solid =
    background?.type === 'solid'
      ? background
      : { type: 'solid' as const, color: document?.canvas.backgroundColor ?? '#000000' };
  const linear = background?.type === 'linear-gradient' ? background : defaultLinearBackground();
  const radial = background?.type === 'radial-gradient' ? background : defaultRadialBackground();
  return {
    activeType: background?.type ?? 'solid',
    solid,
    linear,
    radial,
    committedSignature: backgroundSignature(document?.canvas.background),
  };
}

export function createCanvasTransaction(
  document: ScreenDocument | undefined,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  drafts = createDesignerCanvasBackgroundDrafts(document),
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined || target.dataset.canvasProperty === undefined) return undefined;
  const property = target.dataset.canvasProperty;
  if (property === 'backgroundType') {
    if (!isCanvasBackgroundType(target.value)) return undefined;
    drafts.activeType = target.value;
    return canvasBackgroundTransaction(drafts, activeCanvasBackground(drafts));
  }
  if (property === 'backgroundSolidColor') {
    drafts.solid = { type: 'solid', color: target.value };
    return canvasBackgroundTransaction(drafts, drafts.solid);
  }
  if (property === 'backgroundLinearAngle') {
    const angle = Number(target.value);
    if (!Number.isFinite(angle) || angle < 0 || angle > 360) return undefined;
    drafts.linear = { ...drafts.linear, angle };
    return canvasBackgroundTransaction(drafts, drafts.linear);
  }
  if (property === 'backgroundRadialX' || property === 'backgroundRadialY') {
    const coordinate = Number(target.value);
    if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 100) return undefined;
    drafts.radial = {
      ...drafts.radial,
      position: {
        ...drafts.radial.position,
        [property === 'backgroundRadialX' ? 'x' : 'y']: coordinate,
      },
    };
    return canvasBackgroundTransaction(drafts, drafts.radial);
  }
  if (property === 'backgroundStopColor' || property === 'backgroundStopPosition') {
    const index = Number(target.dataset.canvasBackgroundStopIndex);
    if (!Number.isInteger(index)) return undefined;
    const background = activeCanvasBackground(drafts);
    if (background.type === 'solid' || background.stops[index] === undefined) return undefined;
    const value = property === 'backgroundStopColor' ? target.value : Number(target.value);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > 100)) {
      return undefined;
    }
    const stops = background.stops.map((stop, stopIndex) =>
      stopIndex === index
        ? { ...stop, [property === 'backgroundStopColor' ? 'color' : 'position']: value }
        : stop,
    );
    if (!areAscendingStops(stops)) return undefined;
    setActiveCanvasBackground(drafts, { ...background, stops });
    return canvasBackgroundTransaction(drafts, activeCanvasBackground(drafts));
  }
  if (property === 'backgroundColor') {
    return success({
      commands: [{ type: 'update-canvas', patch: { backgroundColor: target.value } }],
    });
  }
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

export function createCanvasBackgroundStopTransaction(
  document: ScreenDocument | undefined,
  drafts: DesignerCanvasBackgroundDrafts,
  action: 'add' | 'remove',
  index?: number,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined) return undefined;
  const background = activeCanvasBackground(drafts);
  if (background.type === 'solid') return undefined;
  if (action === 'add') {
    if (background.stops.length >= 8) return undefined;
    const last = background.stops[background.stops.length - 1]!;
    const previous = background.stops[background.stops.length - 2]!;
    const position = previous.position + (last.position - previous.position) / 2;
    setActiveCanvasBackground(drafts, {
      ...background,
      stops: [...background.stops.slice(0, -1), { color: previous.color, position }, last],
    });
  } else {
    if (
      index === undefined ||
      background.stops.length <= 2 ||
      background.stops[index] === undefined
    ) {
      return undefined;
    }
    setActiveCanvasBackground(drafts, {
      ...background,
      stops: background.stops.filter((_, stopIndex) => stopIndex !== index),
    });
  }
  return canvasBackgroundTransaction(drafts, activeCanvasBackground(drafts));
}

function defaultLinearBackground(): Extract<
  ScreenCanvasBackground,
  { readonly type: 'linear-gradient' }
> {
  return {
    type: 'linear-gradient',
    angle: 90,
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
  };
}

function defaultRadialBackground(): Extract<
  ScreenCanvasBackground,
  { readonly type: 'radial-gradient' }
> {
  return {
    type: 'radial-gradient',
    position: { x: 50, y: 50 },
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
  };
}

export function syncCanvasBackgroundDrafts(
  drafts: DesignerCanvasBackgroundDrafts,
  document: ScreenDocument,
): void {
  const signature = backgroundSignature(document.canvas.background);
  if (signature === drafts.committedSignature) return;
  const background = document.canvas.background;
  drafts.activeType = background?.type ?? 'solid';
  if (background?.type === 'solid') drafts.solid = background;
  if (background?.type === 'linear-gradient') drafts.linear = background;
  if (background?.type === 'radial-gradient') drafts.radial = background;
  if (background === undefined) {
    drafts.solid = { type: 'solid', color: document.canvas.backgroundColor };
  }
  drafts.committedSignature = signature;
}

function activeCanvasBackground(drafts: DesignerCanvasBackgroundDrafts): ScreenCanvasBackground {
  if (drafts.activeType === 'solid') return drafts.solid;
  return drafts.activeType === 'linear-gradient' ? drafts.linear : drafts.radial;
}

function setActiveCanvasBackground(
  drafts: DesignerCanvasBackgroundDrafts,
  background: Exclude<ScreenCanvasBackground, { readonly type: 'solid' }>,
): void {
  if (background.type === 'linear-gradient') drafts.linear = background;
  else drafts.radial = background;
}

function canvasBackgroundTransaction(
  drafts: DesignerCanvasBackgroundDrafts,
  background: ScreenCanvasBackground,
): ScreenParseResult<ScreenDocumentTransaction> {
  drafts.committedSignature = backgroundSignature(background);
  return success({
    commands: [
      {
        type: 'update-canvas',
        patch:
          background.type === 'solid'
            ? { background, backgroundColor: background.color }
            : { background },
      },
    ],
  });
}

function backgroundSignature(background: ScreenCanvasBackground | undefined): string {
  return background === undefined ? '' : JSON.stringify(background);
}

function areAscendingStops(stops: readonly ScreenCanvasColorStop[]): boolean {
  return stops.every((stop, index) => index === 0 || stops[index - 1]!.position < stop.position);
}

function isCanvasBackgroundType(value: string): value is ScreenCanvasBackground['type'] {
  return value === 'solid' || value === 'linear-gradient' || value === 'radial-gradient';
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
