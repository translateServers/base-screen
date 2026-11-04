/**
 * 风格预设：模型只能从这里挑一个名字，颜色全部由后端决定。
 *
 * 为什么不让模型直接写颜色：AGENTS.md 规定视觉由宿主统一决定，任意颜色会绕过设计系统，
 * 也容易出现低对比度、不可读的配色。预设把「风格可变」与「颜色可控」分开：风格是模型的选择，
 * 颜色是后端保证过对比度的成套色板。
 *
 * 每套预设都必须满足 `WCAG AA`（正文 ≥ 4.5:1）。改色板后要重算对比度，见
 * `tests/examples/agent-style-contrast.test.ts`，不达标的预设不能合入。
 */

export const STYLE_PRESET_IDS = ['deep-tech', 'light-biz', 'warm-care', 'ink-finance'] as const;

export type StylePresetId = (typeof STYLE_PRESET_IDS)[number];

export interface StylePalette {
  /** 画布底色。 */
  readonly canvas: string;
  /** 指标卡 / 面板的底色。 */
  readonly card: string;
  /** 标题与数值等主文字。 */
  readonly text: string;
  /** 副标题、说明、轴标签等次要文字。 */
  readonly muted: string;
  /** 差值、强调数字。 */
  readonly accent: string;
  /** 页脚等弱化文字。 */
  readonly footer: string;
}

export interface StylePreset {
  readonly id: StylePresetId;
  /** 给模型看的中文描述，用于在提示词里让模型按主题挑选。 */
  readonly label: string;
  readonly palette: StylePalette;
}

export const STYLE_PRESETS: Readonly<Record<StylePresetId, StylePreset>> = {
  'deep-tech': {
    id: 'deep-tech',
    label: '深色科技（深蓝底、冷色强调，适合监控、实时、指挥类）',
    palette: {
      canvas: '#0b1020',
      card: '#141b24',
      text: '#e9eef5',
      muted: '#c6d3e4',
      accent: '#4fcb6f',
      footer: '#8a97a8',
    },
  },
  'light-biz': {
    id: 'light-biz',
    label: '浅色商务（浅灰底、白卡片、蓝色强调，适合经营分析、财务、报表类）',
    palette: {
      canvas: '#f4f6fa',
      card: '#ffffff',
      text: '#0f172a',
      muted: '#4a5a70',
      accent: '#1a63c4',
      footer: '#5b6b82',
    },
  },
  'warm-care': {
    id: 'warm-care',
    label: '暖色人文（深棕底、暖色强调，适合医疗、民生、服务类）',
    palette: {
      canvas: '#1f1a17',
      card: '#2a221e',
      text: '#f6efe8',
      muted: '#d9c7b5',
      accent: '#f0a04b',
      footer: '#b3a291',
    },
  },
  'ink-finance': {
    id: 'ink-finance',
    label: '墨黑金（黑底、金色强调，适合高管看板、汇总、战略类）',
    palette: {
      canvas: '#0e1116',
      card: '#171c24',
      text: '#eef1f5',
      muted: '#b8c2d1',
      accent: '#e8b84a',
      footer: '#8f9aab',
    },
  },
};

export const DEFAULT_STYLE_PRESET: StylePresetId = 'deep-tech';

/** 把模型给的风格名映射到预设；未知或缺省时回退到默认预设，不报错。 */
export function resolveStylePreset(value: unknown): StylePreset {
  if (typeof value === 'string') {
    const match = (STYLE_PRESET_IDS as readonly string[]).find((id) => id === value.trim());
    if (match !== undefined) return STYLE_PRESETS[match as StylePresetId];
  }
  return STYLE_PRESETS[DEFAULT_STYLE_PRESET];
}
