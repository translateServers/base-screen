/**
 * 设计系统清单页（`/system.html`）。
 *
 * 这不是一套并行的示例样式，也不是 Storybook：页面挂在一个真实 `<base-screen-designer>`
 * 的 shadow root 里，用的就是产品那份样式表与表里的原语 —— 清单和产品长得不一样时，
 * 差的是产品，不是清单。
 *
 * 页面的用途只有一个：把「令牌 / 状态 / 组件」一次铺开，让样式评审看着同一页说话，
 * 而不是一版一版地猜选中该长什么样。所有数值都写成 `var(--designer-*)`，因此在
 * 浅色与深色主题下看的是同一份定义的两个投影（右上角可切换）。
 */

import type { ScreenDocument } from '../../../../packages/contracts/src/index.ts';
import {
  createDesignerFieldRow,
  createDesignerToggleField,
} from '../../../../packages/engine/src/browser/dom/designer-field-primitives.ts';
import { enhanceDesignerSelect } from '../../../../packages/engine/src/browser/dom/designer-select-dom.ts';
import {
  createDesignerButton,
  createDesignerControlShell,
  createDesignerIconButton,
  createDesignerInput,
  createDesignerSegmented,
  createDesignerSelect,
  createDesignerTabs,
  createDesignerTextarea,
} from '../../../../packages/engine/src/browser/dom/designer-ui-primitives.ts';
import {
  appendDesignerEmptyState,
  createDesignerBadge,
  createDesignerSection,
} from '../../../../packages/engine/src/browser/dom/panel/designer-chrome-primitives.ts';
import {
  type DesignerIconName,
  designerIcon,
} from '../../../../packages/engine/src/browser/dom/designer-icons.ts';
import { createBaseScreenMaterialCatalog } from '../../../../packages/plugin-core/src/index.ts';
import { defineBaseScreenElements } from '../../../../packages/sdk/src/index.ts';

const EMPTY_DOCUMENT: ScreenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
  components: [],
  variables: [],
  blueprint: { relations: [] },
};

/** 清单页自己的排版骨架。只做布局，不重画任何组件的外观；取值全部来自令牌。 */
const GALLERY_CSS = `
.sg {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  box-sizing: border-box;
  overflow: auto;
  padding: var(--designer-space-7) var(--designer-space-7) 96px;
  background: var(--designer-surface-workspace);
  color: var(--designer-text-primary);
  font: var(--designer-font);
}
.sg-head { display: grid; max-width: 880px; gap: var(--designer-space-3); }
.sg-title { margin: 0; font-size: var(--designer-font-size-xl); font-weight: 600; letter-spacing: var(--designer-tracking-display); }
.sg-lede { margin: 0; color: var(--designer-text-secondary); }
.sg-lede code { padding: 0 var(--designer-space-1); border-radius: var(--designer-radius-1); background: var(--designer-surface-control); font: var(--designer-font-numeric); font-size: var(--designer-font-size-xs); }
.sg-toc { display: flex; flex-wrap: wrap; gap: var(--designer-space-2); margin-top: var(--designer-space-2); }
.sg-toc a { padding: 2px var(--designer-space-3); border-radius: var(--designer-radius-pill); background: var(--designer-surface-control); color: var(--designer-text-secondary); font: var(--designer-font-small); text-decoration: none; }
.sg-toc a:hover { background: var(--designer-surface-control-hover); color: var(--designer-text-primary); }
.sg-section { display: grid; gap: var(--designer-space-5); margin-top: var(--designer-space-7); padding-top: var(--designer-space-6); border-top: 1px solid var(--designer-border-subtle); }
.sg-h2 { margin: 0; font-size: var(--designer-font-size-lg); font-weight: 600; letter-spacing: var(--designer-tracking-heading); }
.sg-note { max-width: 820px; margin: 0; color: var(--designer-text-muted); font: var(--designer-font-small); }
.sg-note strong { color: var(--designer-text-secondary); font-weight: 500; }
.sg-group { display: grid; gap: var(--designer-space-3); }
.sg-h3 { margin: 0; color: var(--designer-text-muted); font: var(--designer-font-small); font-weight: 600; letter-spacing: normal; text-transform: uppercase; }
.sg-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--designer-space-4); }
.sg-columns { display: grid; gap: var(--designer-space-3); grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); }
.sg-cell { display: grid; gap: var(--designer-space-2); padding: var(--designer-space-3); border-radius: var(--designer-radius-3); background: var(--designer-surface-panel); box-shadow: var(--designer-elev-card); }
.sg-swatch { height: 52px; border: 1px solid var(--designer-border-subtle); border-radius: var(--designer-radius-3); }
.sg-caption { overflow: hidden; color: var(--designer-text-muted); font: var(--designer-font-numeric); font-size: var(--designer-font-size-xs); text-overflow: ellipsis; white-space: nowrap; }
.sg-sample { color: var(--designer-text-primary); }
.sg-bar { height: 10px; border-radius: var(--designer-radius-1); background: var(--designer-accent); }
.sg-tile { display: grid; place-items: center; height: 52px; border: 1px solid var(--designer-border-default); background: var(--designer-surface-control); color: var(--designer-text-muted); font: var(--designer-font-numeric); font-size: var(--designer-font-size-xs); }
.sg-panel { width: 300px; overflow: hidden; border: 1px solid var(--designer-border-subtle); border-radius: var(--designer-radius-4); background: var(--designer-surface-panel); }
.sg-panel-body { display: grid; gap: var(--designer-space-2); padding: var(--designer-space-4); }
.sg-stack { display: grid; gap: var(--designer-space-2); }
.sg-table { width: 100%; border-collapse: collapse; font: var(--designer-font-small); }
.sg-table th, .sg-table td { padding: var(--designer-space-2) var(--designer-space-3); border-bottom: 1px solid var(--designer-border-subtle); text-align: left; vertical-align: top; }
.sg-table th { color: var(--designer-text-muted); font-weight: 500; white-space: nowrap; }
.sg-table td code { font: var(--designer-font-numeric); font-size: var(--designer-font-size-xs); }
.sg-theme { position: fixed; top: var(--designer-space-5); right: var(--designer-space-5); z-index: 2; }
`;

interface TokenEntry {
  readonly name: string;
  readonly hint?: string;
}

const SURFACES: readonly TokenEntry[] = [
  { name: 'surface-workspace', hint: '工作区底' },
  { name: 'surface-panel', hint: '面板底' },
  { name: 'surface-raised', hint: '浮起面' },
  { name: 'surface-control', hint: '控件底' },
  { name: 'surface-control-hover', hint: '控件划过' },
  { name: 'surface-control-active', hint: '控件按下' },
  { name: 'surface-overlay', hint: '弹层' },
  { name: 'surface-canvas', hint: '画布' },
  { name: 'surface-scrim', hint: '遮罩' },
];

const TEXTS: readonly TokenEntry[] = [
  { name: 'text-primary', hint: '正文' },
  { name: 'text-secondary', hint: '次级' },
  { name: 'text-muted', hint: '弱化' },
  { name: 'text-disabled', hint: '禁用' },
];

const BORDERS: readonly TokenEntry[] = [
  { name: 'border-subtle', hint: '分区线' },
  { name: 'border-default', hint: '控件描边' },
  { name: 'border-strong', hint: '强调描边' },
  { name: 'border-active', hint: '激活描边' },
  { name: 'focus-ring', hint: '焦点环' },
];

const SEMANTICS: readonly TokenEntry[] = [
  { name: 'accent', hint: '强调 / 主操作' },
  { name: 'accent-surface', hint: '强调淡底' },
  { name: 'accent-text', hint: '强调文本档' },
  { name: 'success', hint: '成功' },
  { name: 'success-surface' },
  { name: 'warning', hint: '警示' },
  { name: 'warning-surface' },
  { name: 'danger', hint: '危险' },
  { name: 'danger-surface' },
];

const SHADOWS: readonly TokenEntry[] = [
  { name: 'elev-ring', hint: '阴影当边框' },
  { name: 'elev-card', hint: '卡片三层栈' },
  { name: 'shadow-float', hint: '浮动' },
  { name: 'shadow-overlay', hint: '弹层' },
  { name: 'shadow-canvas', hint: '画布' },
];

const SPACES: readonly { name: string; value: string }[] = [
  { name: 'space-1', value: '2px' },
  { name: 'space-2', value: '4px' },
  { name: 'space-3', value: '6px' },
  { name: 'space-4', value: '8px' },
  { name: 'space-5', value: '12px' },
  { name: 'space-6', value: '16px' },
  { name: 'space-7', value: '24px' },
  { name: 'space-8', value: '32px' },
];

const RADII: readonly { name: string; value: string }[] = [
  { name: 'radius-1', value: '2px' },
  { name: 'radius-2', value: '6px' },
  { name: 'radius-4', value: '8px' },
  { name: 'radius-5', value: '12px' },
  { name: 'radius-pill', value: '999px' },
];

const FONT_SIZES: readonly { name: string; value: string; sample: string }[] = [
  { name: 'font-size-xs', value: '11px', sample: '画布图层 · 辅助读数' },
  { name: 'font-size-sm', value: '12px', sample: '画布图层 · 次要正文' },
  { name: 'font-size-base', value: '13px', sample: '画布图层 · 默认正文' },
  { name: 'font-size-md', value: '14px', sample: '画布图层 · 面板标题' },
  { name: 'font-size-lg', value: '15px', sample: '画布图层 · 分组标题' },
  { name: 'font-size-xl', value: '18px', sample: '画布图层 · 页面标题' },
];

function swatchGrid(items: readonly TokenEntry[]): string {
  return `<div class="sg-columns">${items
    .map(
      (item) => `<div class="sg-cell">
        <span class="sg-swatch" style="background: var(--designer-${item.name})"></span>
        <span class="sg-caption">--designer-${item.name}</span>
        ${item.hint === undefined ? '' : `<span class="sg-caption">${item.hint}</span>`}
      </div>`,
    )
    .join('')}</div>`;
}

function textGrid(): string {
  return `<div class="sg-columns">${TEXTS.map(
    (item) => `<div class="sg-cell">
      <span class="sg-sample" style="color: var(--designer-${item.name})">画布图层 340 × 48</span>
      <span class="sg-caption">--designer-${item.name}</span>
    </div>`,
  ).join('')}</div>`;
}

function shadowGrid(): string {
  return `<div class="sg-columns">${SHADOWS.map(
    (item) => `<div class="sg-cell" style="padding: var(--designer-space-5)">
      <span class="sg-swatch" style="border: 0; background: var(--designer-surface-raised); box-shadow: var(--designer-${item.name})"></span>
      <span class="sg-caption">--designer-${item.name}</span>
    </div>`,
  ).join('')}</div>`;
}

function spaceGrid(): string {
  return `<div class="sg-stack">${SPACES.map(
    (
      item,
    ) => `<div class="sg-row"><span class="sg-caption" style="width: 96px">--designer-${item.name}</span>
      <span class="sg-bar" style="width: var(--designer-${item.name}); height: 10px"></span>
      <span class="sg-caption">${item.value}</span></div>`,
  ).join('')}</div>`;
}

function radiusGrid(): string {
  return `<div class="sg-columns">${RADII.map(
    (item) => `<div class="sg-cell">
      <span class="sg-tile" style="border-radius: var(--designer-${item.name})">${item.value}</span>
      <span class="sg-caption">--designer-${item.name}</span>
    </div>`,
  ).join('')}</div>`;
}

const TRACKING: readonly { name: string; value: string; sizes: string }[] = [
  { name: 'tracking-display', value: '-0.022em', sizes: '≥18px' },
  { name: 'tracking-heading', value: '-0.016em', sizes: '15–17px' },
  { name: 'tracking-ui', value: '-0.01em', sizes: '14px' },
  { name: 'tracking-base', value: 'normal', sizes: '≤13px' },
];

function fontGrid(): string {
  return `<div class="sg-stack">${FONT_SIZES.map(
    (item) => `<div class="sg-row">
      <span class="sg-caption" style="width: 120px">--designer-${item.name}</span>
      <span style="font-size: var(--designer-${item.name}); line-height: 1.4">${item.sample}</span>
      <span class="sg-caption">${item.value}</span>
    </div>`,
  ).join('')}</div>`;
}

function trackingGrid(): string {
  return `<div class="sg-stack">${TRACKING.map(
    (item) => `<div class="sg-row">
      <span class="sg-caption" style="width: 148px">--designer-${item.name}</span>
      <span style="font-size: 18px; letter-spacing: var(--designer-${item.name})">画布图层排列与编组</span>
      <span class="sg-caption">${item.value}</span>
      <span class="sg-caption">${item.sizes}</span>
    </div>`,
  ).join('')}</div>`;
}

const STATIC_HTML = `
<header class="sg-head">
  <h1 class="sg-title">Base Screen 设计系统 · 清单</h1>
  <p class="sg-lede">
    令牌、状态、组件都摊在这一页上。左侧图层面板与蓝图库的选中态，就是「状态矩阵」里那一条 ——
    改一处，两边一起变。这一页不是并行的示例样式：它挂在真实
    <code>base-screen-designer</code> 的 shadow root 里，用的是产品同一份样式表。
    右上角可切换浅色 / 深色。
  </p>
  <nav class="sg-toc">
    <a href="#surface">表面与文字</a>
    <a href="#state">状态矩阵</a>
    <a href="#type">字阶</a>
    <a href="#geometry">间距 / 圆角 / 阴影</a>
    <a href="#components">组件</a>
    <a href="#geist">规范对照</a>
    <a href="#gaps">缺口</a>
  </nav>
</header>

<section class="sg-section" id="surface">
  <h2 class="sg-h2">表面、文字、边框与语义色</h2>
  <p class="sg-note">层级靠表面亮度差与 alpha 收边，不靠阴影浓度。语义色只用于状态与主操作，不用于普通文本。</p>
  <div class="sg-group"><h3 class="sg-h3">表面</h3>${swatchGrid(SURFACES)}</div>
  <div class="sg-group"><h3 class="sg-h3">文本四级</h3>${textGrid()}</div>
  <div class="sg-group"><h3 class="sg-h3">边框与焦点</h3>${swatchGrid(BORDERS)}</div>
  <div class="sg-group"><h3 class="sg-h3">强调与语义</h3>${swatchGrid(SEMANTICS)}</div>
</section>

<section class="sg-section" id="state">
  <h2 class="sg-h2">状态矩阵</h2>
  <p class="sg-note">
    选中态全站只有一份绘制（<strong>列表选中 = 比悬停更实的中性块 + 1px 中性收边</strong>，不着强调色），
    落在 <code>designer-workbench-selection.css</code>；面板文件只负责几何，不写底色。
    悬停无法静态摆出来 —— 下面每个样本都可以直接划过去看真实反馈。
  </p>
  <div class="sg-group"><h3 class="sg-h3">列表行</h3><div class="sg-row" data-mount="rows"></div></div>
  <div class="sg-group"><h3 class="sg-h3">按钮</h3><div class="sg-row" data-mount="buttons"></div></div>
  <div class="sg-group"><h3 class="sg-h3">分段控件</h3><div class="sg-row" data-mount="segmented"></div></div>
</section>

<section class="sg-section" id="type">
  <h2 class="sg-h2">字阶</h2>
  <p class="sg-note">Geist 优先；层级靠字号与字距，不靠字重堆叠。数字读数走等宽数字，避免宽度跳动。
    字距随字号收紧（规范原值 48px/-2.4px、32px/-1.28px、24px/-0.96px、14px/normal，这里按同比例折成 em）。</p>
  ${fontGrid()}
  <div class="sg-group"><h3 class="sg-h3">字距阶梯</h3>${trackingGrid()}</div>
  <div class="sg-row">
    <span class="sg-caption" style="width: 120px">--designer-font</span>
    <span style="font: var(--designer-font)">默认正文 · 13 / 1.5</span>
  </div>
  <div class="sg-row">
    <span class="sg-caption" style="width: 120px">--designer-font-small</span>
    <span style="font: var(--designer-font-small)">次级正文 · 12 / 1.4</span>
  </div>
  <div class="sg-row">
    <span class="sg-caption" style="width: 120px">--designer-font-numeric</span>
    <span style="font: var(--designer-font-numeric)">340 × 48 · 1,204</span>
  </div>
</section>

<section class="sg-section" id="geometry">
  <h2 class="sg-h2">间距、圆角与阴影</h2>
  <p class="sg-note">间距 8 档（2/4/6/8/12/16/24/32）：前 7 档是面板内部的紧凑节奏，32 留给大区块。重复出现的几何值已进令牌，剩余字面量按门禁基线逐步清零。</p>
  <div class="sg-group"><h3 class="sg-h3">间距</h3>${spaceGrid()}</div>
  <div class="sg-group"><h3 class="sg-h3">圆角</h3>${radiusGrid()}</div>
  <div class="sg-group"><h3 class="sg-h3">阴影</h3>${shadowGrid()}</div>
</section>

<section class="sg-section" id="components">
  <h2 class="sg-h2">组件</h2>
  <p class="sg-note">表单控件与字段行全部来自原语：default 30px / compact 28px 两档、模板控件经 adoption 原地归一、禁用态只用颜色与描边（不叠透明度）；列表行、空态、徽标与分区标题统一由 <code>designer-workbench-chrome.css</code> 提供外观。</p>
  <div class="sg-group"><h3 class="sg-h3">表单控件</h3><div class="sg-row" data-mount="form"></div></div>
  <div class="sg-group"><h3 class="sg-h3">面板件</h3><div class="sg-row" data-mount="panels"></div></div>
  <div class="sg-group"><h3 class="sg-h3">蓝图库行</h3><div class="sg-row" data-mount="blueprint"></div></div>
</section>

<section class="sg-section" id="geist">
  <h2 class="sg-h2">与 Geist 规范的对照</h2>
  <p class="sg-note">逐条比对的结果只分三种：<strong>对齐</strong>、<strong>有意偏离</strong>（写明原因）、
    <strong>待收敛</strong>（已知债务）。偏离必须能在这一页找到理由，否则就是 bug。</p>
  <table class="sg-table">
    <thead><tr><th>条目</th><th>Geist 规范</th><th>我们的落点</th><th>状态</th></tr></thead>
    <tbody>
      <tr><td>字体栈</td><td>Geist / Geist Mono，全局 liga</td><td><code>font-family</code> / <code>font-family-mono</code></td><td>对齐</td></tr>
      <tr><td>文本灰阶</td><td>#171717 / #4d4d4d / #666666 / #808080</td><td><code>text-primary/secondary/muted/disabled</code>（同值）</td><td>对齐</td></tr>
      <tr><td>主操作按钮</td><td>#171717 底 + 白字；暗色主题反白</td><td><code>.designer-button[data-variant="primary"]</code> 用 text-primary / surface-raised</td><td>对齐</td></tr>
      <tr><td>阴影当边框</td><td><code>0 0 0 1px rgb(0 0 0 / 8%)</code></td><td><code>--designer-elev-ring</code>（33 处在用）</td><td>对齐，真实 border 仍在迁移</td></tr>
      <tr><td>卡片阴影栈</td><td>描边 + 2px 微抬 + 8px 远距 + 内圈 #fafafa</td><td><code>--designer-elev-card</code></td><td>本批新增</td></tr>
      <tr><td>字距</td><td>-2.4px@48 → normal@14，随字号收紧</td><td><code>tracking-display / heading / ui / base</code></td><td>本批新增（折成 em）</td></tr>
      <tr><td>字重</td><td>400 / 500 / 600 三档，正文不用 700</td><td>原 650 与 700 全部收进 600</td><td>本批对齐</td></tr>
      <tr><td>焦点环</td><td>2px 蓝色 hsla(212, 100%, 48%)</td><td><code>--designer-focus-ring</code> #0070f3 / #5297fc</td><td>对齐</td></tr>
      <tr><td>圆角</td><td>2 / 4 / 6 / 8 / 12 / pill</td><td>2 / 6 / 6 / 8 / 12 / pill —— 缺 4px，第 2、3 档重复</td><td>待收敛（改动面 50 处，单独一批）</td></tr>
      <tr><td>间距</td><td>8 基数，16 之后直接跳 32</td><td>2–24 + 新增 32</td><td>有意偏离：密集面板需要 24 这一档</td></tr>
      <tr><td>字号阶梯</td><td>12–48px（营销页）</td><td>11–18px（工作台）</td><td>有意偏离：密度优先，字距按同比例折算</td></tr>
      <tr><td>工作流三色</td><td>Ship 红 / Preview 粉 / Develop 蓝</td><td>无（产品里没有流水线语义）</td><td>不适用</td></tr>
      <tr><td>色彩纪律</td><td>灰阶是系统色，颜色只做功能</td><td>强调色 = 主操作 / 焦点 / 定位，不表示选中</td><td>对齐</td></tr>
    </tbody>
  </table>
</section>

<section class="sg-section" id="gaps">
  <h2 class="sg-h2">缺口：设计系统还没有覆盖到的地方</h2>
  <p class="sg-note">基线条目由 <code>node tooling/checks/designer-styles.mjs --report</code> 生成，脚本只允许条目下降；本页不复制具体计数，避免两份数字互相漂移。</p>
  <table class="sg-table">
    <thead><tr><th>缺口</th><th>现状</th><th>唯一落点应在这</th></tr></thead>
    <tbody>
      <tr><td>状态没有语义层</td><td>悬停 / 按下 / 禁用 / 焦点仍由各面板本地绘制</td><td><code>designer-workbench-states.css</code>（待建）</td></tr>
      <tr><td>选中画法曾有四版</td><td>淡底+竖条 → 实心 → 空心描边 → 中性块；现在只保留最后一版</td><td><code>designer-workbench-selection.css</code></td></tr>
      <tr><td>几何没有全部进令牌</td><td>gap / padding / margin 仍有字面量，按基线逐步清零</td><td><code>designer-tokens.css</code> 的几何组</td></tr>
    </tbody>
  </table>
</section>
`;

function layerRow(
  ownerDocument: Document,
  state: {
    readonly name: string;
    readonly selected?: boolean;
    readonly hidden?: boolean;
    readonly locked?: boolean;
    readonly current?: boolean;
    readonly hue?: number;
    readonly icon?: DesignerIconName;
  },
): HTMLElement {
  const row = ownerDocument.createElement('div');
  row.className = 'designer-list-row layer-row';
  row.dataset.density = 'default';
  row.setAttribute('role', 'treeitem');
  row.ariaSelected = String(state.selected === true);
  row.style.paddingInlineStart = '8px';
  row.style.setProperty('--layer-hue', String(state.hue ?? 258));
  if (state.hidden === true) row.dataset.hidden = 'true';
  if (state.locked === true) row.dataset.locked = 'true';
  if (state.current === true) row.ariaCurrent = 'true';
  if (state.hidden !== true) row.dataset.layerSelectable = 'true';

  const select = ownerDocument.createElement('button');
  select.type = 'button';
  select.className = 'designer-control designer-button layer-select';
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'layer-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon(state.icon ?? 'grid');
  select.appendChild(glyph);
  const copy = ownerDocument.createElement('span');
  copy.className = 'layer-copy';
  const name = ownerDocument.createElement('span');
  name.className = 'layer-name';
  name.textContent = state.name;
  const meta = ownerDocument.createElement('span');
  meta.className = 'layer-meta';
  meta.setAttribute('aria-hidden', 'true');
  const size = ownerDocument.createElement('span');
  size.className = 'layer-size';
  size.textContent = '340 × 48';
  meta.append(size);
  copy.append(name, meta);
  select.appendChild(copy);
  row.appendChild(select);

  for (const property of ['locked', 'hidden'] as const) {
    const toggle = ownerDocument.createElement('button');
    toggle.type = 'button';
    toggle.className = `designer-control designer-button layer-${property === 'hidden' ? 'eye' : 'lock'}`;
    toggle.dataset.layerToggle = property;
    toggle.ariaPressed = String(
      property === 'hidden' ? state.hidden === true : state.locked === true,
    );
    toggle.innerHTML = designerIcon(
      property === 'hidden' ? (state.hidden === true ? 'eye-off' : 'eye') : 'lock',
    );
    // 常态开关是收起的；清单里为了让评审看清图标位置，强制显形。
    toggle.style.opacity = '1';
    row.appendChild(toggle);
  }
  return row;
}

function blueprintRow(
  ownerDocument: Document,
  state: { readonly name: string; readonly selected?: boolean; readonly placed?: boolean },
): HTMLElement {
  const row = ownerDocument.createElement('div');
  row.className = 'designer-list-row blueprint-palette-item';
  row.dataset.density = 'comfortable';
  row.dataset.placed = String(state.placed === true);
  row.dataset.selected = String(state.selected === true);
  const primary = ownerDocument.createElement('button');
  primary.type = 'button';
  primary.className = 'blueprint-palette-primary';
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'blueprint-palette-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon('layers');
  const copy = ownerDocument.createElement('span');
  const title = ownerDocument.createElement('strong');
  title.textContent = state.name;
  const detail = ownerDocument.createElement('small');
  detail.textContent = 'base.text · 1 个可用事件';
  copy.append(title, detail);
  primary.append(glyph, copy);
  const action = ownerDocument.createElement('button');
  action.type = 'button';
  action.className = 'blueprint-palette-action';
  action.innerHTML = designerIcon(state.placed === true ? 'locate' : 'plus');
  row.append(primary, action);
  return row;
}

function labeled(ownerDocument: Document, caption: string, node: HTMLElement): HTMLElement {
  const cell = ownerDocument.createElement('div');
  cell.className = 'sg-cell';
  cell.style.width = '316px';
  const label = ownerDocument.createElement('span');
  label.className = 'sg-caption';
  label.textContent = caption;
  cell.append(label, node);
  return cell;
}

function mountRowStates(container: HTMLElement, ownerDocument: Document): void {
  const samples: readonly { caption: string; state: Parameters<typeof layerRow>[1] }[] = [
    { caption: '默认', state: { name: '数据集排行卡', hue: 258 } },
    {
      caption: '选中（与蓝图库同一份配方）',
      state: { name: '数据集排行卡', selected: true, hue: 258 },
    },
    { caption: '当前焦点 · 未选中', state: { name: '宿主端口预警', current: true, hue: 190 } },
    { caption: '已隐藏', state: { name: '副标题', hidden: true, hue: 258 } },
    { caption: '已锁定', state: { name: '标题', locked: true, hue: 258 } },
  ];
  for (const sample of samples) {
    const cell = labeled(ownerDocument, sample.caption, layerRow(ownerDocument, sample.state));
    container.appendChild(cell);
  }
}

function mountButtons(container: HTMLElement, ownerDocument: Document): void {
  const samples: readonly {
    caption: string;
    text: string;
    variant?: 'primary' | 'danger' | 'ghost';
    disabled?: boolean;
  }[] = [
    { caption: '默认（次级）', text: '添加图层' },
    { caption: '主操作', text: '应用', variant: 'primary' },
    { caption: '幽灵', text: '取消', variant: 'ghost' },
    { caption: '危险', text: '删除', variant: 'danger' },
    { caption: '禁用', text: '应用', variant: 'primary', disabled: true },
  ];
  for (const sample of samples) {
    const button = createDesignerButton(ownerDocument, {
      text: sample.text,
      variant: sample.variant,
      disabled: sample.disabled,
    });
    container.appendChild(labeled(ownerDocument, sample.caption, button));
  }
  const iconRow = ownerDocument.createElement('div');
  iconRow.className = 'sg-cell';
  iconRow.style.width = '316px';
  const label = ownerDocument.createElement('span');
  label.className = 'sg-caption';
  label.textContent = '图标按钮（置顶 / 上移 / 下移 / 置底）';
  const group = ownerDocument.createElement('div');
  group.className = 'layer-toolbar';
  for (const [icon, name] of [
    ['bring-to-front', 'front'],
    ['arrow-up', 'up'],
    ['arrow-down', 'down'],
    ['send-to-back', 'back'],
  ] as const) {
    group.appendChild(
      createDesignerIconButton(ownerDocument, {
        className: 'layer-toolbar-button',
        icon,
        label: name,
      }),
    );
  }
  iconRow.append(label, group);
  container.appendChild(iconRow);
}

function mountSegmented(container: HTMLElement, ownerDocument: Document): void {
  const { element } = createDesignerSegmented(ownerDocument, {
    ariaLabel: '单位',
    selected: 'px',
    options: [
      { value: 'px', label: '像素' },
      { value: 'percent', label: '百分比' },
    ],
  });
  container.appendChild(labeled(ownerDocument, '分段：像素 / 百分比（aria-pressed）', element));

  const compact = createDesignerSegmented(ownerDocument, {
    ariaLabel: '密度',
    selected: 'comfortable',
    size: 'compact',
    options: [
      { value: 'compact', label: '紧凑' },
      { value: 'comfortable', label: '舒适' },
    ],
  });
  container.appendChild(labeled(ownerDocument, 'compact 分段（28 / 24）', compact.element));
}

function mountForm(container: HTMLElement, ownerDocument: Document): void {
  const panel = ownerDocument.createElement('div');
  panel.className = 'sg-panel';
  panel.style.width = '340px';
  const body = ownerDocument.createElement('div');
  body.className = 'sg-panel-body';

  const textRow = createDesignerFieldRow(ownerDocument, { label: '名称' });
  textRow.control.appendChild(
    createDesignerInput(ownerDocument, { value: '数据集排行卡', ariaLabel: '名称' }),
  );
  body.appendChild(textRow.field);

  const selectRow = createDesignerFieldRow(ownerDocument, { label: '对齐' });
  selectRow.control.appendChild(
    enhanceDesignerSelect(
      createDesignerSelect(ownerDocument, {
        ariaLabel: '对齐',
        options: [
          { label: '左对齐', value: 'left', selected: true },
          { label: '居中', value: 'center' },
          { label: '右对齐', value: 'right' },
        ],
      }),
    ).element,
  );
  body.appendChild(selectRow.field);

  const areaRow = createDesignerFieldRow(ownerDocument, { label: '描述' });
  areaRow.control.appendChild(
    createDesignerTextarea(ownerDocument, { value: '用于顶部指标卡', ariaLabel: '描述' }),
  );
  body.appendChild(areaRow.field);

  const compactRow = createDesignerFieldRow(ownerDocument, { label: '紧凑输入' });
  compactRow.control.appendChild(
    createDesignerInput(ownerDocument, { ariaLabel: '紧凑输入', size: 'compact', value: '28px' }),
  );
  body.appendChild(compactRow.field);

  const disabledRow = createDesignerFieldRow(ownerDocument, { label: '禁用输入' });
  disabledRow.control.appendChild(
    createDesignerInput(ownerDocument, {
      ariaLabel: '禁用输入',
      disabled: true,
      value: '不可编辑',
    }),
  );
  body.appendChild(disabledRow.field);

  const tabsRow = createDesignerFieldRow(ownerDocument, { label: '页签' });
  tabsRow.control.appendChild(
    createDesignerTabs(ownerDocument, {
      ariaLabel: '检查器页签',
      items: [
        { value: 'style', label: '样式' },
        { value: 'data', label: '数据' },
      ],
      selected: 'style',
    }).element,
  );
  body.appendChild(tabsRow.field);

  const shellRow = createDesignerFieldRow(ownerDocument, { label: '参数' });
  const shell = createDesignerControlShell(ownerDocument);
  const shellInput = createDesignerInput(ownerDocument, { ariaLabel: '参数', value: 'value' });
  shellInput.dataset.flush = 'true';
  shell.appendChild(shellInput);
  shellRow.control.appendChild(shell);
  body.appendChild(shellRow.field);

  body.appendChild(
    createDesignerToggleField(ownerDocument, {
      control: 'switch',
      label: '显示图例',
      hint: '随数据源刷新',
      checked: true,
    }).field,
  );

  body.appendChild(
    createDesignerToggleField(ownerDocument, {
      control: 'checkbox',
      label: '参与轮播',
    }).field,
  );

  body.appendChild(
    createDesignerToggleField(ownerDocument, {
      checked: true,
      control: 'switch',
      disabled: true,
      label: '禁用开关',
    }).field,
  );

  panel.appendChild(body);
  container.appendChild(panel);
}

function mountPanels(container: HTMLElement, ownerDocument: Document): void {
  const panel = ownerDocument.createElement('div');
  panel.className = 'sg-panel';
  panel.innerHTML = `
    <header class="panel-heading">
      <p class="panel-title">画布图层</p>
      <span class="designer-badge panel-count" data-tone="neutral">12</span>
    </header>
    <div class="sg-panel-body">
      <p class="list-heading">画布图层 · 从上到下</p>
      <div class="layer-toolbar" data-mount="toolbar"></div>
      <div class="designer-empty">
        <span class="designer-empty-icon" aria-hidden="true">${designerIcon('layers')}</span>
        <p class="designer-empty-title">画布还没有图层</p>
        <p class="designer-empty-hint">从素材面板添加组件后，这里会列出全部图层。</p>
      </div>
    </div>`;
  const toolbar = panel.querySelector<HTMLElement>('[data-mount="toolbar"]');
  if (toolbar !== null) {
    for (const [icon, name, disabled] of [
      ['bring-to-front', '置顶', true],
      ['arrow-up', '上移', false],
      ['arrow-down', '下移', false],
      ['send-to-back', '置底', true],
    ] as const) {
      toolbar.appendChild(
        createDesignerIconButton(ownerDocument, {
          className: 'layer-toolbar-button',
          disabled,
          icon,
          label: name,
        }),
      );
    }
    const separator = ownerDocument.createElement('span');
    separator.className = 'layer-toolbar-separator';
    separator.setAttribute('role', 'separator');
    separator.setAttribute('aria-orientation', 'vertical');
    toolbar.appendChild(separator);
    for (const [icon, name] of [
      ['group', '编组'],
      ['ungroup', '取消编组'],
    ] as const) {
      toolbar.appendChild(
        createDesignerIconButton(ownerDocument, {
          className: 'layer-toolbar-button',
          disabled: true,
          icon,
          label: name,
        }),
      );
    }
  }
  container.appendChild(panel);

  const chromePanel = ownerDocument.createElement('div');
  chromePanel.className = 'sg-panel';
  const chromeBody = ownerDocument.createElement('div');
  chromeBody.className = 'sg-panel-body';
  const section = createDesignerSection(chromeBody, { title: '分段标题' });
  const sampleInput = createDesignerInput(ownerDocument, {
    ariaLabel: '示例字段',
    value: '示例',
  });
  section.element.appendChild(sampleInput);
  const badgeRow = ownerDocument.createElement('div');
  badgeRow.className = 'sg-row';
  for (const [tone, label] of [
    ['neutral', '中性'],
    ['accent', '强调'],
    ['success', '成功'],
    ['warning', '警告'],
    ['danger', '危险'],
  ] as const) {
    createDesignerBadge(badgeRow, { text: label, tone });
  }
  chromeBody.appendChild(badgeRow);
  appendDesignerEmptyState(chromeBody, {
    icon: 'search',
    title: '没有匹配结果',
    hint: '换个关键词或清除筛选条件。',
    actions: [{ label: '清除搜索', dataset: { chromeSample: 'clear' } }],
  });
  chromePanel.appendChild(chromeBody);
  container.appendChild(chromePanel);
}

function mountBlueprint(container: HTMLElement, ownerDocument: Document): void {
  const list = ownerDocument.createElement('div');
  list.className = 'sg-panel';
  list.style.width = '340px';
  const inner = ownerDocument.createElement('div');
  inner.className = 'sg-panel-body';
  inner.style.gap = '0';
  inner.append(
    blueprintRow(ownerDocument, { name: '标题', selected: true, placed: true }),
    blueprintRow(ownerDocument, { name: '副标题', placed: true }),
    blueprintRow(ownerDocument, { name: '宿主数据' }),
  );
  list.appendChild(inner);
  container.appendChild(list);
}

/** shadow root 由元素自己按「已连接 + 有 catalog」两个条件创建，所以只能等它出现。 */
async function waitForShadowRoot(host: HTMLElement): Promise<ShadowRoot> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const root = host.shadowRoot;
    if (root !== null) return root;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error('DESIGNER_SYSTEM_GALLERY_SHADOW_ROOT_MISSING');
}

async function mount(): Promise<void> {
  document.title = 'Base Screen · 设计系统清单';
  defineBaseScreenElements();
  const host = document.createElement('base-screen-designer');
  host.setAttribute('data-system-gallery', 'true');
  await customElements.whenDefined('base-screen-designer');
  host.catalog = createBaseScreenMaterialCatalog([]);
  host.document = EMPTY_DOCUMENT;
  document.body.append(host);
  const root = await waitForShadowRoot(host);

  const style = document.createElement('style');
  style.textContent = GALLERY_CSS;
  root.append(style);

  const gallery = document.createElement('div');
  gallery.className = 'sg';
  gallery.innerHTML = STATIC_HTML;
  root.append(gallery);

  const ownerDocument = host.ownerDocument;
  const mountPoint = (name: string): HTMLElement => {
    const node = gallery.querySelector<HTMLElement>(`[data-mount="${name}"]`);
    if (node === null) throw new Error(`DESIGNER_SYSTEM_GALLERY_MOUNT_MISSING:${name}`);
    return node;
  };
  mountRowStates(mountPoint('rows'), ownerDocument);
  mountButtons(mountPoint('buttons'), ownerDocument);
  mountSegmented(mountPoint('segmented'), ownerDocument);
  mountForm(mountPoint('form'), ownerDocument);
  mountPanels(mountPoint('panels'), ownerDocument);
  mountBlueprint(mountPoint('blueprint'), ownerDocument);

  // 主题开关：清单要在两套主题下都成立，否则只是一套配色的说明书。缺省即黑夜。
  const toggle = createDesignerButton(ownerDocument, { text: '切换浅色', variant: 'ghost' });
  toggle.className += ' sg-theme';
  toggle.addEventListener('click', () => {
    // 浅色是显式 opt-in：回到缺省（无属性）就是黑夜，顺带证明默认值没被改坏。
    const light = host.getAttribute('theme') === 'light';
    if (light) host.removeAttribute('theme');
    else host.setAttribute('theme', 'light');
    toggle.textContent = light ? '切换浅色' : '切换黑夜';
  });
  gallery.append(toggle);
}

void mount();
