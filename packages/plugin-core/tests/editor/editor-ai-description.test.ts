import { describe, expect, it } from 'vitest';
import { describeBaseScreenMaterialStyleForAi } from '../../src/editor/editor-ai-description.js';
import type { BaseScreenMaterialManifest } from '../../src/index.js';

const styleSchema = {
  kind: 'object' as const,
  properties: {
    color: { kind: 'string' as const, maxLength: 32 },
    opacity: { kind: 'number' as const, minimum: 0, maximum: 1 },
    align: { kind: 'enum' as const, values: ['left', 'center', 'right'] },
    legend: {
      kind: 'object' as const,
      properties: {
        show: { kind: 'boolean' as const },
        position: { kind: 'enum' as const, values: ['top', 'bottom'] },
      },
      required: ['show'],
    },
    series: {
      kind: 'array' as const,
      items: { kind: 'string' as const },
      maxItems: 4,
    },
  },
  required: ['color'],
};

const descriptor = {
  appearance: [
    {
      id: 'style',
      label: '样式',
      fields: [
        {
          id: 'color',
          target: 'style' as const,
          path: ['color'],
          label: '文字颜色',
          control: 'color' as const,
          help: '仅支持纯色',
        },
        {
          id: 'legendShow',
          target: 'style' as const,
          path: ['legend', 'show'],
          label: '显示图例',
          control: 'boolean' as const,
        },
      ],
    },
  ],
};

function manifest(input: Record<string, unknown>): BaseScreenMaterialManifest {
  return input as unknown as BaseScreenMaterialManifest;
}

describe('describeBaseScreenMaterialStyleForAi', () => {
  it('projects schema paths, enums and bounds with author comments', () => {
    const text = describeBaseScreenMaterialStyleForAi(
      manifest({ styleSchema, editorDescriptor: descriptor }),
    );
    expect(text).toContain('// 引擎级通用样式键（所有物料可用）: opacity, flipX, flipY');
    expect(text).toContain('"theme:<slot>"');
    expect(text).toContain('"accentSecondary"');
    expect(text).toContain('interface MaterialStyle {');
    expect(text).toContain('  /** 文字颜色：仅支持纯色。最长 32 字符。必填 */\n  color: string;');
    expect(text).toContain('  /** 范围 ≥ 0 且 ≤ 1 */\n  opacity?: number;');
    expect(text).toContain(
      '  /** 取值: "left" | "center" | "right" */\n  align?: "left" | "center" | "right";',
    );
    expect(text).toContain('  legend?: {\n    /** 显示图例。必填 */\n    show: boolean;');
    expect(text).toContain('  series?: Array<string>;');
    expect(text).toContain('  filterBlur?: number;');
    expect(text).toContain('  passThrough?: boolean;');
  });

  it('still derives constraints without an editor descriptor', () => {
    const text = describeBaseScreenMaterialStyleForAi(manifest({ styleSchema }));
    expect(text).toContain('取值: "left" | "center" | "right"');
    expect(text).not.toContain('文字颜色');
  });

  it('caps nesting depth instead of emitting unbounded prompt text', () => {
    const deep = {
      kind: 'object' as const,
      properties: {
        a: {
          kind: 'object' as const,
          properties: {
            b: {
              kind: 'object' as const,
              properties: {
                c: {
                  kind: 'object' as const,
                  properties: { d: { kind: 'string' as const } },
                  required: [],
                },
              },
              required: [],
            },
          },
          required: [],
        },
      },
      required: [],
    };
    const text = describeBaseScreenMaterialStyleForAi(manifest({ styleSchema: deep }));
    expect(text).toContain('Record<string, unknown>');
    expect(text).not.toContain('d?: string');
  });
});
