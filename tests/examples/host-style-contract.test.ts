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

  it('keeps the modal focus helper byte-identical across hosts', () => {
    const baseline = read('examples/vanilla-host/src/lib/modal-focus.ts');
    for (const host of hosts.slice(1)) {
      expect(read(`examples/${host}/src/lib/modal-focus.ts`), host).toBe(baseline);
    }
    expect(baseline).toContain('trapModalFocus');
    expect(baseline).toContain('MutationObserver');
    // 焦点落到 body 时最上层弹层仍接管键盘；整块重建的 Vanilla 抽屉靠快照把焦点放回原控件。
    expect(baseline).toContain('if (!inside && !isTopmost()) return;');
    expect(baseline).toContain("document.addEventListener('focusin', onFocusIn, true);");
    expect(baseline).toContain('export function captureModalFocus');
    expect(baseline).toContain('export function restoreModalFocus');
  });

  it('keeps the datasource model byte-identical across hosts', () => {
    const baseline = read('examples/vanilla-host/src/lib/datasource-model.ts');
    for (const host of hosts.slice(1)) {
      expect(read(`examples/${host}/src/lib/datasource-model.ts`), host).toBe(baseline);
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
      // 被阻止的发布按钮并未 disabled：悬停规则必须排除 blocked，否则一悬停就变回主色。
      expect(source).toContain('.ws-primary:hover:not(:disabled):not([data-blocked="true"])');
    }
  });

  it('keeps modal, form-label and tab semantics in all host drawers', () => {
    const files = [
      'examples/react-host/src/components/datasource-drawer.tsx',
      'examples/vue-host/src/components/DatasourceDrawer.vue',
      'examples/vanilla-host/src/components/datasource-drawer.ts',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).toContain('trapModalFocus');
      expect(source).toContain('ds-form-error');
      expect(source).toContain('tabpanel');
      expect(source).toContain('aria-controls');
      // 错误关联来自校验结果的 field，不再按「字段为空」去猜。
      expect(source, file).not.toMatch(/formError !== null && (?:state\.)?draft\./);
      expect(source, file).toContain('formErrorField');
      // 面板内本来就有可聚焦控件：面板自身不再占一个 Tab 停靠点。
      expect(source, file).not.toMatch(/tabIndex=\{0\}|tabindex="0"|tabindex: '0'/);
    }
    // Vanilla 端 render() 会重建标签页按钮：键盘切换后必须从抽屉重新查询，不能用闭包里的旧 tabs。
    expect(read('examples/vanilla-host/src/components/datasource-drawer.ts')).not.toContain(
      'tabs.querySelector<HTMLButtonElement>(`[data-ds-mode=',
    );
    const vanilla = read('examples/vanilla-host/src/components/datasource-drawer.ts');
    expect(vanilla).toContain('const focus = captureModalFocus(drawer);');
    expect(vanilla).toContain('restoreModalFocus(drawer, focus);');
    expect(read('examples/react-host/src/components/datasource-drawer.tsx')).toContain(
      'aria-label="请求地址"',
    );
  });
});
