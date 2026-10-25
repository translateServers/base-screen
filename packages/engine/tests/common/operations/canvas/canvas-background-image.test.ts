import { describe, expect, it } from 'vitest';
import { buildCanvasBackgroundImagePatch } from '../../../../src/common/operations/canvas/canvas-background-image.js';

describe('canvas background image patch', () => {
  it('builds patches with fit, without fit, and clearing semantics', () => {
    expect(buildCanvasBackgroundImagePatch('https://cdn.x/bg.png', 'contain')).toEqual({
      backgroundImage: 'https://cdn.x/bg.png',
      backgroundImageFit: 'contain',
    });
    expect(buildCanvasBackgroundImagePatch('https://cdn.x/bg.png', undefined)).toEqual({
      backgroundImage: 'https://cdn.x/bg.png',
    });
    expect(buildCanvasBackgroundImagePatch(null, 'contain')).toEqual({
      backgroundImage: null,
      backgroundImageFit: null,
    });
  });
});
