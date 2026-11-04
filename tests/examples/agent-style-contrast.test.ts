import { describe, expect, it } from 'vitest';
import {
  STYLE_PRESET_IDS,
  STYLE_PRESETS,
} from '../../examples/shared-backend/src/agent/agent-style';

/**
 * 风格预设的对比度守护：每套色板里的文字、次要文字、强调色与页脚色，
 * 在画布底与卡片底上都必须达到 WCAG AA 正文标准（≥ 4.5:1）。
 *
 * 改色板后这里会自动重算；不达标的预设不能合入。
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

const TEXT_ROLES = ['text', 'muted', 'accent', 'footer'] as const;
const SURFACES = ['canvas', 'card'] as const;

describe('agent style presets: contrast', () => {
  it('包含全部预设且 id 与键一致', () => {
    expect(STYLE_PRESET_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of STYLE_PRESET_IDS) {
      expect(STYLE_PRESETS[id].id).toBe(id);
    }
  });

  for (const id of STYLE_PRESET_IDS) {
    it(`${id}：文字色在画布与卡片上均 ≥ 4.5:1`, () => {
      const { palette } = STYLE_PRESETS[id];
      for (const role of TEXT_ROLES) {
        for (const surface of SURFACES) {
          const ratio = contrast(palette[role], palette[surface]);
          expect(ratio, `${id} ${role} on ${surface} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      }
    });
  }

  it('所有色值都是合法的 6 位十六进制', () => {
    for (const id of STYLE_PRESET_IDS) {
      for (const value of Object.values(STYLE_PRESETS[id].palette)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('预设之间的画布底色互不相同（风格确实可分）', () => {
    const canvases = STYLE_PRESET_IDS.map((id) => STYLE_PRESETS[id].palette.canvas);
    expect(new Set(canvases).size).toBe(canvases.length);
  });
});
