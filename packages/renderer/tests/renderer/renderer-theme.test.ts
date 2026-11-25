import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  document,
  FakeRoot,
  rendererWithRoot,
} from './__fixtures__/renderer-test-harness.js';

const palette = {
  primary: '#111111',
  text: '#222222',
  textSecondary: '#333333',
  background: '#444444',
  accent: '#555555',
  accentSecondary: '#666666',
};

describe('renderer theme reference resolution', () => {
  it('resolves theme refs into the projected model style', () => {
    const { root, renderer } = rendererWithRoot();
    const result = renderer.render({
      ...document([{ ...component('themed', 0), style: { color: 'theme:primary' } }]),
      theme: { palette },
    });
    expect(result.ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#111111');
  });

  it('fails closed on a dangling reference instead of rendering the literal string', () => {
    const { root, renderer } = rendererWithRoot();
    const result = renderer.render(
      document([{ ...component('dangling', 0), style: { color: 'theme:primary' } }]),
    );
    expect(result.ok).toBe(false);
    expect(root.children).toHaveLength(0);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.path.includes('color'))).toBe(true);
    }
  });

  it('resolves status slots to built-in defaults without a palette', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const result = renderer.render(
      document([{ ...component('alarm', 0), style: { color: 'theme:danger' } }]),
    );
    expect(result.ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#f5222d');
  });

  it('resolves references inside component states', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog('base.test', ['static']),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const result = renderer.render({
      ...document([
        {
          ...component('stated', 0, null, { type: 'static', value: 5 }),
          style: { color: '#ffffff' },
          states: {
            items: [{ id: 'hot', name: '高', style: { color: 'theme:accent' } }],
            judge: {
              input: { kind: 'component-data', path: [] },
              cases: [{ operator: 'gt', value: 0, stateId: 'hot' }],
            },
          },
        },
      ]),
      theme: { palette },
    });
    expect(result.ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#555555');
  });
});
