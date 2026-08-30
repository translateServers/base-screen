import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  document,
  FakeRoot,
  rendererWithRoot,
} from './__fixtures__/renderer-test-harness.js';

describe('BaseScreenRenderer material presentation styles', () => {
  it('clips preview and viewer roots while preserving the design root overflow policy', () => {
    const design = rendererWithRoot();
    design.root.style.overflow = 'visible';
    expect(design.renderer.render(document([component('design', 0)])).ok).toBe(true);
    expect(design.root.style.overflow).toBe('visible');

    for (const mode of ['preview', 'viewer'] as const) {
      const root = new FakeRoot();
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        mode,
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: undefined,
      });
      expect(renderer.render(document([component(mode, 0)])).ok).toBe(true);
      expect(root.style.overflow).toBe('hidden');
    }
  });

  it('applies flip transforms and clamps material opacity during render', () => {
    const { root, renderer } = rendererWithRoot();
    const result = renderer.render(
      document([
        {
          ...component('styled', 0),
          rotation: 12,
          style: { flipX: true, flipY: false, opacity: 1.5 },
        },
      ]),
    );

    expect(result.ok).toBe(true);
    expect(root.children[0]?.style.transform).toBe('rotate(12deg) scale(-1, 1)');
    expect(root.children[0]?.style.opacity).toBe('1');
  });
});

describe('BaseScreenRenderer canvas background image', () => {
  it('applies the canvas background image styles with a cover default', () => {
    const { root, renderer } = rendererWithRoot();
    const result = renderer.render({
      ...document([]),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/screens/bg.png',
      },
    });

    expect(result.ok).toBe(true);
    expect(root.style.backgroundImage).toBe('url("https://cdn.x/screens/bg.png")');
    expect(root.style.backgroundSize).toBe('cover');
    expect(root.style.backgroundPosition).toBe('center');
    expect(root.style.backgroundRepeat).toBe('no-repeat');
    expect(root.style.backgroundColor).toBe('#000000');
  });

  it('renders linear and radial palettes below an optional background image', () => {
    const { root, renderer } = rendererWithRoot();
    expect(
      renderer.render({
        ...document([]),
        canvas: {
          width: 960,
          height: 540,
          backgroundColor: '#000000',
          backgroundImage: 'https://cdn.x/screens/bg.png',
          background: {
            type: 'linear-gradient',
            angle: 45,
            stops: [
              { color: '#112233', position: 0 },
              { color: '#abcdef', position: 100 },
            ],
          },
        },
      }).ok,
    ).toBe(true);
    expect(root.style.backgroundImage).toBe(
      'url("https://cdn.x/screens/bg.png"), linear-gradient(45deg, #112233 0%, #abcdef 100%)',
    );
    expect(root.style.backgroundSize).toBe('cover, 100% 100%');

    expect(
      renderer.render({
        ...document([]),
        canvas: {
          width: 960,
          height: 540,
          backgroundColor: '#000000',
          background: {
            type: 'radial-gradient',
            position: { x: 25, y: 75 },
            stops: [
              { color: '#112233', position: 0 },
              { color: 'transparent', position: 100 },
            ],
          },
        },
      }).ok,
    ).toBe(true);
    expect(root.style.backgroundImage).toBe(
      'radial-gradient(circle at 25% 75%, #112233 0%, transparent 100%)',
    );
    expect(root.style.backgroundSize).toBe('100% 100%');
  });

  it('maps contain fit and escapes quotes in the CSS url value', () => {
    const { root, renderer } = rendererWithRoot();
    const result = renderer.render({
      ...document([]),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/a"b/bg.png',
        backgroundImageFit: 'contain',
      },
    });

    expect(result.ok).toBe(true);
    expect(root.style.backgroundImage).toBe('url("https://cdn.x/a\\"b/bg.png")');
    expect(root.style.backgroundSize).toBe('contain');
  });

  it('clears background styles when the document has no background image', () => {
    const { root, renderer } = rendererWithRoot();
    expect(
      renderer.render({
        ...document([]),
        canvas: {
          width: 960,
          height: 540,
          backgroundColor: '#000000',
          backgroundImage: 'https://cdn.x/bg.png',
        },
      }).ok,
    ).toBe(true);
    expect(root.style.backgroundImage).not.toBe('');

    const cleared = renderer.render(document([]));
    expect(cleared.ok).toBe(true);
    expect(root.style.backgroundImage).toBe('');
    expect(root.style.backgroundSize).toBe('');
    expect(root.style.backgroundPosition).toBe('');
    expect(root.style.backgroundRepeat).toBe('');
    expect(root.style.backgroundColor).toBe('#000000');
  });

  it('rejects a document with an invalid background image fail-closed', () => {
    const { renderer } = rendererWithRoot();
    const result = renderer.render({
      ...document([]),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'javascript:alert(1)',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.path).toEqual(['canvas', 'backgroundImage']);
    }
  });
});
