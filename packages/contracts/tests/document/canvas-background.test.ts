import { describe, expect, it } from 'vitest';
import {
  isScreenCanvasBackground,
  isScreenCanvasPaletteColor,
  SCREEN_CANVAS_BACKGROUND_TYPES,
  SCREEN_CANVAS_FIELDS,
} from '../../src/document/canvas-background.js';
import { canvasBackgroundSchema } from '../../src/document/schema.js';
import type { ScreenCanvasBackground } from '../../src/types/document.js';

/**
 * 画布背景能力的唯一权威。
 *
 * 这些断言不只是"函数能跑"：`SCREEN_CANVAS_BACKGROUND_TYPES` 必须与 schema 同步，
 * 而且样本表按 `ScreenCanvasBackground['type']` 收键——契约新增一种背景而这里没补样本时，
 * 类型检查会直接失败，避免又出现"契约支持、消费方以为不支持"的静默降级。
 */
const SAMPLES: Record<ScreenCanvasBackground['type'], ScreenCanvasBackground> = {
  solid: { type: 'solid', color: '#87ceeb' },
  'linear-gradient': {
    type: 'linear-gradient',
    angle: 180,
    stops: [
      { color: '#87ceeb', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
  },
  'radial-gradient': {
    type: 'radial-gradient',
    position: { x: 50, y: 50 },
    stops: [
      { color: '#0b1020', position: 0 },
      { color: '#3b82f6', position: 100 },
    ],
  },
};

describe('canvas background capability', () => {
  it('derives the background type list from the schema, not from a second hand-written list', () => {
    const fromSchema = canvasBackgroundSchema.options.map((option) => option.shape.type.value);
    expect([...SCREEN_CANVAS_BACKGROUND_TYPES]).toEqual(fromSchema);
    expect(Object.keys(SAMPLES).sort()).toEqual([...SCREEN_CANVAS_BACKGROUND_TYPES].sort());
  });

  it('lists exactly the canvas fields the patch layer may write', () => {
    expect([...SCREEN_CANVAS_FIELDS]).toEqual([
      'width',
      'height',
      'backgroundColor',
      'background',
      'backgroundImage',
      'backgroundImageFit',
    ]);
  });

  it('accepts every sample shape', () => {
    for (const type of SCREEN_CANVAS_BACKGROUND_TYPES) {
      expect(isScreenCanvasBackground(SAMPLES[type])).toBe(true);
    }
  });

  it('rejects shapes the renderer could not draw', () => {
    const rejected: readonly unknown[] = [
      // 色标必须至少两个
      { type: 'linear-gradient', angle: 180, stops: [{ color: '#000000', position: 0 }] },
      // 位置必须严格递增
      {
        type: 'linear-gradient',
        angle: 180,
        stops: [
          { color: '#000000', position: 60 },
          { color: '#ffffff', position: 20 },
        ],
      },
      // 角度越界
      {
        type: 'linear-gradient',
        angle: 400,
        stops: [
          { color: '#000000', position: 0 },
          { color: '#ffffff', position: 100 },
        ],
      },
      // 非法色值：写进文档不报错、只渲染成透明
      {
        type: 'linear-gradient',
        angle: 180,
        stops: [
          { color: '#12345', position: 0 },
          { color: '#ffffff', position: 100 },
        ],
      },
      // 未知形态
      { type: 'conic-gradient', stops: [] },
      null,
      'linear-gradient',
    ];

    for (const value of rejected) {
      expect(isScreenCanvasBackground(value)).toBe(false);
    }
  });

  it('accepts only the palette colour forms the designer can round-trip', () => {
    for (const color of ['#fff', '#ffff', '#ffffff', '#ffffffcc', 'transparent', '#ABC']) {
      expect(isScreenCanvasPaletteColor(color)).toBe(true);
    }
    for (const color of ['#12345', 'red', '#gggggg', ' #fff', '', 12]) {
      expect(isScreenCanvasPaletteColor(color)).toBe(false);
    }
  });
});
