import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT,
  buildCanvasBackgroundImagePatch,
  buildCanvasBackgroundImageRequest,
  validateCanvasBackgroundImageCommitGuards,
} from '../../../../src/common/operations/canvas/canvas-background-image.js';

describe('canvas background image host channel (ADR-0046)', () => {
  it('exports the composed request event name', () => {
    expect(BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT).toBe(
      'base-screen-canvas-background-image-request',
    );
  });

  it('accepts a current canvas background image session commit', () => {
    expect(
      validateCanvasBackgroundImageCommitGuards({
        pendingKind: 'canvas-background-image',
        disposed: false,
      }),
    ).toEqual({ ok: true, value: null, diagnostics: [] });
  });

  it('rejects an expired or missing session fail-closed', () => {
    const expired = validateCanvasBackgroundImageCommitGuards({
      pendingKind: 'canvas-background-image',
      disposed: true,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.diagnostics[0]?.code).toBe('AUTHORING_EXPIRED');
    }
    const missing = validateCanvasBackgroundImageCommitGuards({
      pendingKind: undefined,
      disposed: false,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.diagnostics[0]?.code).toBe('AUTHORING_REQUEST_INVALID');
    }
    const otherKind = validateCanvasBackgroundImageCommitGuards({
      pendingKind: 'blueprint',
      disposed: false,
    });
    expect(otherKind.ok).toBe(false);
    if (!otherKind.ok) {
      expect(otherKind.diagnostics[0]?.code).toBe('AUTHORING_REQUEST_INVALID');
    }
  });

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

  it('builds the request detail with current values and null semantics', () => {
    const request = buildCanvasBackgroundImageRequest(
      {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/bg.png',
        backgroundImageFit: 'contain',
      },
      'designer-abc',
      'authoring-123',
      'rev-1',
    );
    expect(request).toEqual({
      requestId: 'authoring-123',
      instanceId: 'designer-abc',
      documentRevision: 'rev-1',
      current: {
        backgroundImage: 'https://cdn.x/bg.png',
        backgroundImageFit: 'contain',
      },
    });

    const empty = buildCanvasBackgroundImageRequest(
      { width: 960, height: 540, backgroundColor: '#000000' },
      'designer-abc',
      'authoring-124',
      null,
    );
    expect(empty.current).toEqual({ backgroundImage: null, backgroundImageFit: null });
    expect(empty.documentRevision).toBeNull();
  });
});
