import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- 工具脚本为 .mjs，无类型声明；测试只消费 CSS 扫描器。
import { scanCssBlocks } from '../../tooling/checks/designer-style-scan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hosts = ['react-host', 'vue-host', 'vanilla-host'] as const;
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

interface CssBlock {
  readonly parent: { readonly atRule: boolean };
  readonly selector: string;
  readonly fullSelector: string;
  readonly declarations: ReadonlyArray<{ readonly property: string; readonly value: string }>;
}

function commonComponentBlocks(source: string): string[] {
  return scanCssBlocks(source)
    .filter(
      (block: CssBlock) => !(block.parent.atRule && /^(?:from|to|\d+%)$/.test(block.selector)),
    )
    .filter((block: CssBlock) => !block.fullSelector.includes('.spinner'))
    .map((block) => `${block.fullSelector}|${JSON.stringify(block.declarations)}`)
    .sort();
}

describe('host style contracts stay aligned across frameworks', () => {
  it('keeps shared host stylesheets byte-identical', () => {
    for (const file of ['base.css', 'layout.css', 'online-materials.css', 'asset-library.css']) {
      const baseline = read(`examples/vanilla-host/src/styles/${file}`);
      for (const host of hosts.slice(1)) {
        expect(read(`examples/${host}/src/styles/${file}`), `${host}/${file}`).toBe(baseline);
      }
    }
  });

  it('keeps the common component stylesheet blocks aligned while allowing adapter tails', () => {
    const baseline = commonComponentBlocks(read('examples/vanilla-host/src/styles/components.css'));
    for (const host of hosts.slice(1)) {
      expect(
        commonComponentBlocks(read(`examples/${host}/src/styles/components.css`)),
        host,
      ).toEqual(baseline);
    }
  });

  it('shares one metric-value contract and one visual constant set', () => {
    const baseline = read('examples/vanilla-host/src/screen/metric-value.ts');
    for (const host of hosts.slice(1)) {
      expect(read(`examples/${host}/src/screen/metric-value.ts`), host).toBe(baseline);
    }
    expect(baseline).toContain('METRIC_VALUE_CONTAINER_STYLE');
    expect(baseline).toContain('METRIC_VALUE_NUMBER_STYLE');
    expect(read('examples/react-host/src/screen/metric-value-material.tsx')).toContain(
      'METRIC_VALUE_NUMBER_STYLE',
    );
    expect(read('examples/vue-host/src/components/MetricValue.vue')).toContain(
      'METRIC_VALUE_NUMBER_STYLE',
    );
    expect(read('examples/vanilla-host/src/screen/metric-value-element.ts')).toContain(
      'METRIC_VALUE_NUMBER_STYLE',
    );
    expect(read('examples/vanilla-host/src/screen/metric-value-element.ts')).toContain(
      "this.style.display = rendererDisplay === 'none' ? 'none' : 'flex';",
    );
  });

  it('does not express disabled workshop controls through opacity', () => {
    for (const host of hosts) {
      const source = read(`examples/${host}/src/screen/component-workshop.ts`);
      expect(source).not.toContain('.ws-button:disabled, .ws-icon:disabled { opacity:');
      expect(source).not.toContain('.ws-primary[data-blocked="true"] { opacity:');
    }
  });
});
