import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
  ScreenSize,
} from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import { clampScreenSize, roundScreenGeometry } from './designer-geometry.js';

export type DesignerImageDensity = 1 | 2 | 3 | 4;

const DESIGNER_IMAGE_DENSITIES: readonly DesignerImageDensity[] = [1, 2, 3, 4];

/**
 * 将图片自然尺寸按倍图倍率一次性换算成 canonical 固定尺寸。
 * 倍率本身不写入文档，后续换源或加载事件也不会继续改变组件尺寸。
 */
export function createDesignerImageDensityTransaction(
  document: ScreenDocument | undefined,
  componentId: string,
  naturalSize: ScreenSize | undefined,
  density: number,
): ScreenParseResult<ScreenDocumentTransaction | undefined> {
  if (document === undefined) {
    return failure('CORE_COMMAND_INVALID', componentId, 'Designer document is unavailable.');
  }
  const component = document.components.find((item) => item.id === componentId);
  if (component === undefined) {
    return failure('CORE_COMMAND_TARGET_MISSING', componentId, 'Image component was not found.');
  }
  if (component.type !== 'base.image') {
    return failure(
      'CORE_COMMAND_INVALID',
      componentId,
      'Image density sizing is only available for base.image components.',
    );
  }
  if (isScreenComponentEffectivelyLocked(document, componentId)) {
    return failure('CORE_COMMAND_TARGET_LOCKED', componentId, 'Image component is locked.');
  }
  if (!DESIGNER_IMAGE_DENSITIES.includes(density as DesignerImageDensity)) {
    return failure(
      'CORE_COMMAND_INVALID',
      componentId,
      'Image density must be one of 1, 2, 3, or 4.',
    );
  }
  if (
    naturalSize === undefined ||
    !Number.isFinite(naturalSize.width) ||
    !Number.isFinite(naturalSize.height) ||
    naturalSize.width <= 0 ||
    naturalSize.height <= 0
  ) {
    return failure(
      'CORE_COMMAND_INVALID',
      componentId,
      'Image natural size is unavailable or invalid.',
    );
  }

  const size = {
    width: roundScreenGeometry(clampScreenSize(naturalSize.width / density)),
    height: roundScreenGeometry(clampScreenSize(naturalSize.height / density)),
  };
  if (component.size.width === size.width && component.size.height === size.height) {
    return { ok: true, value: undefined, diagnostics: [] };
  }
  return {
    ok: true,
    value: {
      commands: [
        {
          type: 'update-components',
          componentIds: [componentId],
          patch: { size },
        },
      ],
    },
    diagnostics: [],
  };
}

function failure(
  code: ScreenDiagnostic['code'],
  componentId: string,
  message: string,
): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code,
        path: ['components', componentId, 'size'],
        message,
      },
    ],
  };
}
