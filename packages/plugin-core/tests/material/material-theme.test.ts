import { describe, expect, it } from 'vitest';
import {
  parseBaseScreenMaterialManifest,
  resolveBaseScreenMaterialDefaultStyle,
} from '../../src/index.js';

/**
 * `themeStyle`（ADR-0101）：新建组件时哪些样式键跟随文档主题色板。
 */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'acme.frame',
    tagName: 'acme-frame',
    name: 'Frame',
    category: 'Decor',
    keywords: [],
    defaultSize: { width: 320, height: 160 },
    defaultProps: {},
    defaultStyle: { borderColor: '#1e3a5f', accentColor: '#38bdf8', strokeWidth: 2 },
    styleSchema: {
      kind: 'object',
      properties: {
        borderColor: { kind: 'string' },
        accentColor: { kind: 'string' },
        strokeWidth: { kind: 'number', minimum: 1, maximum: 8 },
      },
      required: ['borderColor'],
    },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: [],
    designCapabilities: { resize: true, rotate: true, children: true },
    ...overrides,
  };
}

const palette = {
  primary: '#ff6600',
  text: '#ffffff',
  textSecondary: '#cccccc',
  background: '#000000',
  accent: '#00ccff',
  accentSecondary: '#0066aa',
};

describe('material theme style', () => {
  it('accepts string style keys mapped to theme slots', () => {
    const parsed = parseBaseScreenMaterialManifest(
      manifest({ themeStyle: { accentColor: 'primary', borderColor: 'accentSecondary' } }),
    );
    expect(parsed.ok).toBe(true);
  });

  it('stays optional', () => {
    const parsed = parseBaseScreenMaterialManifest(manifest());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.themeStyle).toBeUndefined();
  });

  it('rejects undeclared keys, non-string keys and unknown slots', () => {
    const cases = [
      { missing: 'primary' },
      { strokeWidth: 'primary' },
      { accentColor: 'brand' },
      { accentColor: 7 },
    ];
    for (const themeStyle of cases) {
      const parsed = parseBaseScreenMaterialManifest(manifest({ themeStyle }));
      expect(parsed.ok, JSON.stringify(themeStyle)).toBe(false);
      expect(parsed.diagnostics[0]?.path[0]).toBe('themeStyle');
    }
    expect(parseBaseScreenMaterialManifest(manifest({ themeStyle: ['primary'] })).ok).toBe(false);
  });

  it('writes the palette colour into the declared keys when the document has a theme', () => {
    const resolved = resolveBaseScreenMaterialDefaultStyle(
      {
        defaultStyle: { borderColor: '#1e3a5f', accentColor: '#38bdf8', strokeWidth: 2 },
        themeStyle: { accentColor: 'primary' },
      },
      { palette },
    );
    // 写入的是解析后的颜色，不是 `theme:` 引用：取色器读得出，去掉色板也不会让组件失败关闭。
    expect(resolved).toEqual({ borderColor: '#1e3a5f', accentColor: '#ff6600', strokeWidth: 2 });
  });

  it('keeps the default style without a theme or without declared keys', () => {
    const defaultStyle = { accentColor: '#38bdf8' };
    expect(
      resolveBaseScreenMaterialDefaultStyle(
        { defaultStyle, themeStyle: { accentColor: 'primary' } },
        undefined,
      ),
    ).toBe(defaultStyle);
    expect(resolveBaseScreenMaterialDefaultStyle({ defaultStyle }, { palette })).toBe(
      defaultStyle,
    );
  });
});
