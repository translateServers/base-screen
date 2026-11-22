import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- 工具脚本为 .mjs，无类型声明；测试只消费它的导出。
import { checkMaterialAtomicity } from '../../tooling/checks/material-atomicity.mjs';

const RESERVED_SOURCE = `
export const BASE_SCREEN_RESERVED_STYLE_SCHEMAS: Readonly<
  Record<string, BaseScreenMaterialPropSchema>
> = {
  opacity: { kind: 'number', minimum: 0, maximum: 1 },
  // 注释里的 note: 不是保留键
  flipX: { kind: 'boolean' },
};
`;

interface MaterialSource {
  readonly props?: string;
  readonly style?: string;
  readonly propertyPanel?: string;
  readonly stylePanel?: string;
  readonly render?: string;
}

function material(source: MaterialSource = {}): string {
  return `
export const MANIFEST = {
  propsSchema: { kind: 'object', properties: { ${source.props ?? "decimals: { kind: 'number' }"} }, required: [] },
  styleSchema: { kind: 'object', properties: { ${source.style ?? "color: { kind: 'string' }"} }, required: [] },
  propertyPanel: [${source.propertyPanel ?? "{ prop: 'decimals', label: '小数位', control: 'number' }"}],
  stylePanel: [${source.stylePanel ?? "{ style: 'color', label: '文字色', control: 'color' }"}],
};
export class Element {
  renderMaterial(): void {
    ${source.render ?? 'void model.props.decimals;'}
  }
}
`;
}

let root: string;

function write(relativePath: string, content: string): void {
  const file = join(root, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function check(debt: readonly unknown[] = []): { failures: string[]; warnings: string[] } {
  return checkMaterialAtomicity({ root, debt });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'material-atomicity-test-'));
  write('packages/plugin-core/src/material/material-schema.ts', RESERVED_SOURCE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('material atomicity paradigm rules (ADR-0099)', () => {
  it('accepts a material that follows the dictionary and panel rules', () => {
    write('packages/material/src/clean.ts', material());
    expect(check()).toEqual({ failures: [], warnings: [] });
  });

  it('R4 rejects an unregistered style key and accepts dictionary or registered keys', () => {
    write(
      'plugins/demo/src/glow.ts',
      material({
        style: "haloTint: { kind: 'string' }, trackColor: { kind: 'string' }",
        stylePanel:
          "{ style: 'haloTint', label: '光晕', control: 'color' }, { style: 'trackColor', label: '轨道色', control: 'color' }",
      }),
    );
    const { failures } = check();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/plugins\/demo\/src\/glow\.ts:\d+ \[R4\] style 键 haloTint/);
  });

  it('R5 rejects unit marks in labels', () => {
    write(
      'plugins/demo/src/marquee.ts',
      material({
        props: "intervalMs: { kind: 'number' }",
        propertyPanel: "{ prop: 'intervalMs', label: '轮播间隔(ms)', control: 'number' }",
        render: 'void model.props.intervalMs;',
      }),
    );
    expect(check().failures).toEqual([expect.stringMatching(/\[R5\] label「轮播间隔\(ms\)」/)]);
  });

  it('R6 rejects reserved style keys in panels and host opacity/transform writes', () => {
    write(
      'packages/material/src/shape.ts',
      material({
        style: "fill: { kind: 'string' }",
        stylePanel:
          "{ style: 'fill', label: '填充', control: 'color' }, { style: 'opacity', label: '不透明度', control: 'number' }",
        render: "this.style.opacity = '1'; this.style.transform = 'x'; void model.props.decimals;",
      }),
    );
    const { failures } = check();
    expect(failures).toHaveLength(3);
    expect(failures.join('\n')).toMatch(/\[R6\] 面板声明了保留样式 opacity/);
    expect(failures.join('\n')).toMatch(/\[R6\] 渲染路径写宿主元素 style\.opacity/);
    expect(failures.join('\n')).toMatch(/\[R6\] 渲染路径写宿主元素 style\.transform/);
  });

  it('R6 reads reserved keys from editor descriptor style targets too', () => {
    write(
      'plugins/demo/src/descriptor.ts',
      `${material()}
const DESCRIPTOR = {
  appearance: [{ id: 'a', label: '外观', fields: [
    { id: 'flip', target: 'style', path: ['flipX'], label: '水平翻转', control: 'boolean' },
  ] }],
};`,
    );
    expect(check().failures).toEqual([expect.stringMatching(/\[R6\] 面板声明了保留样式 flipX/)]);
  });

  // ADR-0102 D2：描述符字段可以省略 control（解析期按语义推导），静态规则照样要识别它们。
  it('recognizes descriptor fields that leave the control to inference', () => {
    write(
      'plugins/demo/src/inferred.ts',
      `${material()}
const DESCRIPTOR = {
  appearance: [{ id: 'a', label: '外观', fields: [
    { id: 'flip', target: 'style', path: ['flipX'], label: '水平翻转' },
    { id: 'width', target: 'style', path: ['lineWeight'], label: '线宽', unit: 'px' },
  ] }],
};`,
    );
    const failures = check().failures.join('\n');
    expect(failures).toMatch(/\[R6\] 面板声明了保留样式 flipX/);
    expect(failures).toMatch(/\[R4\] style 键 lineWeight/);
  });

  it('R7 rejects hand-typed field mapping props', () => {
    write(
      'plugins/demo/src/board.ts',
      material({
        props: "statusColumn: { kind: 'string' }",
        propertyPanel: "{ prop: 'statusColumn', label: '状态列', control: 'text' }",
        render: 'void model.props.statusColumn;',
      }),
    );
    expect(check().failures).toEqual([expect.stringMatching(/\[R7\] prop statusColumn/)]);
  });

  it('R7 accepts a field mapping prop that is picked with a field-selector', () => {
    write(
      'plugins/demo/src/board.ts',
      `${material({
        props: "statusColumn: { kind: 'string' }",
        propertyPanel: "{ prop: 'statusColumn', label: '等级列', control: 'text' }",
        render: 'void model.props.statusColumn;',
      })}
const DESCRIPTOR = {
  data: [{ id: 'd', label: '数据', fields: [
    { id: 'c', target: 'props', path: ['statusColumn'], label: '等级列', control: 'field-selector' },
  ] }],
};`,
    );
    expect(check().failures).toEqual([]);
  });

  it('R8 rejects state text props even when they are not in a panel', () => {
    write(
      'examples/demo-host/src/grid.ts',
      material({ props: "decimals: { kind: 'number' }, emptyText: { kind: 'string' }" }),
    );
    expect(check().failures).toEqual([expect.stringMatching(/\[R8\] 声明了状态文案 emptyText/)]);
  });

  it('R9 warns about the visible field budget without failing', () => {
    const keys = Array.from({ length: 12 }, (_, index) => `field${index}`);
    write(
      'plugins/demo/src/dense.ts',
      material({
        props: keys.map((key) => `${key}: { kind: 'number' }`).join(', '),
        propertyPanel: keys
          .map((key) => `{ prop: '${key}', label: '${key}', control: 'number' }`)
          .join(', '),
        render: 'void model.props.field0;',
      }),
    );
    const { failures, warnings } = check();
    expect(failures).toEqual([]);
    expect(warnings).toEqual([expect.stringMatching(/\[R9\] 默认可见字段 13 个/)]);
  });

  it('R9 counts only visible descriptor fields when a descriptor is present', () => {
    const keys = Array.from({ length: 14 }, (_, index) => `field${index}`);
    const descriptorField = (key: string) =>
      `{ id: '${key}', target: 'props', path: ['${key}'], label: '${key}', control: 'number' }`;
    write(
      'plugins/demo/src/folded.ts',
      `${material({
        props: keys.map((key) => `${key}: { kind: 'number' }`).join(', '),
        propertyPanel: keys
          .map((key) => `{ prop: '${key}', label: '${key}', control: 'number' }`)
          .join(', '),
        render: 'void model.props.field0;',
      })}
const DESCRIPTOR = {
  appearance: [
    { id: 'main', label: '结构', fields: [${keys.slice(0, 4).map(descriptorField).join(', ')}] },
    {
      id: 'colors',
      label: '语义色',
      collapsed: true,
      fields: [${keys.slice(4, 9).map(descriptorField).join(', ')}],
    },
    {
      id: 'motion',
      label: '动效',
      fields: [${keys.slice(9).map(descriptorField).join(', ')}],
      advanced: true,
    },
  ],
};`,
    );
    expect(check()).toEqual({ failures: [], warnings: [] });
  });

  it('does not apply paradigm rules to browser-harness demo materials', () => {
    write(
      'tooling/verification/browser-harness/demo.ts',
      material({
        props: "xField: { kind: 'string' }",
        propertyPanel: "{ prop: 'xField', label: '横轴字段(px)', control: 'text' }",
        render: 'void model.props.xField;',
      }),
    );
    expect(check().failures).toEqual([]);
  });
});

describe('component fragment rules (ADR-0100 R10)', () => {
  function official(): void {
    write(
      'packages/material/src/official.ts',
      "export const TEXT = { type: 'base.text' };\nexport const BOX = { type: 'base.container' };\n",
    );
    write(
      'plugins/alpha/src/identity.ts',
      "export const ALPHA_GAUGE_TYPE = 'alpha.gauge';\nexport const M = { type: ALPHA_GAUGE_TYPE };\n",
    );
    write('plugins/beta/src/identity.ts', "export const M = { type: 'beta.flop' };\n");
  }

  function fragment(nodes: string): string {
    return `import type { BaseScreenFragmentDefinition } from 'base-screen/plugin-core';
export const CARD: BaseScreenFragmentDefinition = {
  id: 'alpha.card',
  name: 'Card',
  category: 'Cards',
  keywords: [],
  shell: { key: 'card', materialType: 'base.container', style: { fill: 'transparent' } },
  nodes: [${nodes}],
};
`;
  }

  it('accepts a plugin fragment built from its own and official materials', () => {
    official();
    write(
      'plugins/alpha/src/fragments.ts',
      fragment(
        "{ key: 'title', materialType: 'base.text', offset: { x: 0, y: 0 } }, { key: 'value', materialType: ALPHA_GAUGE_TYPE }",
      ),
    );
    expect(check().failures).toEqual([]);
  });

  it('rejects a reference to a material that no delivery surface declares', () => {
    official();
    write(
      'plugins/alpha/src/fragments.ts',
      fragment("{ key: 'value', materialType: 'alpha.ghost' }"),
    );
    expect(check().failures).toEqual([
      expect.stringMatching(/plugins\/alpha\/src\/fragments\.ts:\d+ \[R10\] .*alpha\.ghost/),
    ]);
  });

  it('rejects a plugin fragment that depends on another plugin (F8)', () => {
    official();
    write(
      'plugins/alpha/src/fragments.ts',
      fragment("{ key: 'value', materialType: 'beta.flop' }"),
    );
    expect(check().failures).toEqual([expect.stringMatching(/\[R10\] .*beta\.flop.*F8/)]);
  });

  it('requires caption-like nodes to be base.text (F3)', () => {
    official();
    write(
      'plugins/alpha/src/fragments.ts',
      fragment("{ key: 'title', materialType: ALPHA_GAUGE_TYPE }"),
    );
    expect(check().failures).toEqual([expect.stringMatching(/\[R10\] .*title.*F3/)]);
  });

  it('rejects a material type it cannot resolve statically', () => {
    official();
    write(
      'examples/host/src/fragments.ts',
      fragment("{ key: 'value', materialType: resolveType() }"),
    );
    expect(check().failures).toEqual([expect.stringMatching(/\[R10\] .*无法静态解析/)]);
  });
});

describe('ADR-0099 debt ratchet', () => {
  const debtItem = {
    rule: 'R8',
    file: 'plugins/demo/src/grid.ts',
    key: 'emptyText',
    remedy: '用 SDK 空态视图',
  };

  it('suppresses a violation that is listed as known debt', () => {
    write(
      'plugins/demo/src/grid.ts',
      material({ props: "decimals: { kind: 'number' }, emptyText: { kind: 'string' }" }),
    );
    expect(check([debtItem]).failures).toEqual([]);
  });

  it('fails when a debt item has been repaid but is still listed', () => {
    write('plugins/demo/src/grid.ts', material());
    expect(check([debtItem]).failures).toEqual([
      expect.stringMatching(/plugins\/demo\/src\/grid\.ts \[R8\] emptyText 已偿还/),
    ]);
  });

  it('fails closed when the reserved style source cannot be read', () => {
    write('packages/plugin-core/src/material/material-schema.ts', 'export const OTHER = {};');
    write('packages/material/src/clean.ts', material());
    expect(() => check()).toThrow(/MATERIAL_ATOMICITY_RESERVED_KEYS_UNREADABLE/);
  });
});

describe('repository state', () => {
  it('passes with the shipped ADR-0099 debt list', () => {
    expect(checkMaterialAtomicity().failures).toEqual([]);
  });
});
