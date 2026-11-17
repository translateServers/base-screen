import type { ScreenJsonValue } from '@base-screen/contracts';
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

const nextPalette = { ...palette, primary: '#999999', accent: '#888888' };

describe('renderer theme input invalidation', () => {
  it('re-resolves themed style when only the palette changes', () => {
    const { root, renderer } = rendererWithRoot();
    // 组件引用跨渲染保持不变：组件与 catalog entry 相同，只有主题变了。
    const themed = { ...component('themed', 0), style: { color: 'theme:primary' } };

    const first = renderer.render({ ...document([themed]), theme: { palette } });
    expect(first.ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#111111');

    const second = renderer.render({ ...document([themed]), theme: { palette: nextPalette } });
    expect(second.ok).toBe(true);
    // 校验缓存与挂载守卫都必须把主题当输入；否则命中旧缓存会继续复用 #111111。
    expect(root.children[0]?.model?.style.color).toBe('#999999');

    // 再换一次：连续换色同样每次生效（缓存不能停留在上一轮）。
    const third = renderer.render({ ...document([themed]), theme: { palette } });
    expect(third.ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#111111');
  });

  it('applies a new palette to conditional style port results on the first replace', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      conditionalStylePort: { resolve: () => ({ color: 'theme:accent' }) },
    });
    const shared = { ...component('ported', 0), style: { color: '#ffffff' } };

    expect(renderer.render({ ...document([shared]), theme: { palette } }).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#555555');

    // 复用挂载路径必须用本次渲染的文档解析主题，而不是上一份的 state.document。
    expect(renderer.render({ ...document([shared]), theme: { palette: nextPalette } }).ok).toBe(
      true,
    );
    expect(root.children[0]?.model?.style.color).toBe('#888888');
  });

  it('applies host-level reserved styles on conditional style refresh', () => {
    const root = new FakeRoot();
    let portStyle: Record<string, ScreenJsonValue> = {};
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      conditionalStylePort: { resolve: () => portStyle },
    });
    expect(renderer.render(document([component('hosted', 0)])).ok).toBe(true);
    const element = root.children[0]!;
    expect(element.style.pointerEvents).toBe('');
    expect(element.style.filter).toBe('');

    portStyle = { filterBlur: 10, passThrough: true };
    renderer.refreshConditionalStyles();
    // model 与宿主元素 CSS 必须同步：保留键由引擎写，物料不消费它们。
    expect(element.model?.style.passThrough).toBe(true);
    expect(element.style.pointerEvents).toBe('none');
    expect(element.style.filter).toContain('blur(10px)');

    portStyle = {};
    renderer.refreshConditionalStyles();
    expect(element.style.pointerEvents).toBe('');
    expect(element.style.filter).toBe('');
  });
});
