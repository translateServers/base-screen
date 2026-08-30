import { describe, expect, it } from 'vitest';
import { baseCss, controlsCss, tokensCss, workbenchCss } from './designer-style-fixture.js';

describe('designer workbench structure and layout', () => {
  it('R8 reserves stable tracks for workbench geometry and dynamic status content', () => {
    expect(baseCss).toContain('--left-panel-width: 336px;');
    expect(baseCss).toContain('--right-panel-width: 336px;');
    expect(baseCss).toContain('grid-template-rows: 48px minmax(0, 1fr) 30px;');
    expect(baseCss).toContain('grid-column: 1 / -1;');
    expect(workbenchCss).toContain('grid-template-rows: 20px minmax(0, 1fr);');
    expect(workbenchCss).toContain('grid-row: 1 / 2 !important;');
    expect(workbenchCss).toContain('padding: 0 var(--designer-space-4);');
    expect(workbenchCss).toContain('.ruler-horizontal {');
    expect(workbenchCss).toContain('grid-row: 2 / 3 !important;');
    expect(baseCss).toContain('.designer > .designer-topbar {');
    expect(workbenchCss).toContain('overflow: hidden;');
    expect(baseCss).toContain('grid-row: 1 / 2;');
    expect(workbenchCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(workbenchCss).toContain('aspect-ratio: 16 / 10;');
    expect(workbenchCss).toContain('scrollbar-gutter: stable;');
    expect(workbenchCss).toContain('.properties[data-inspector-density="basic"]');
    expect(workbenchCss).toContain(':not([data-inspector-searching])');
    expect(workbenchCss).toContain('[data-inspector-advanced]');
    expect(workbenchCss).toContain('grid-template-rows: 38px minmax(58px, auto) minmax(0, 1fr);');
    expect(workbenchCss).toContain('grid-template-columns: 28px auto;');
    expect(workbenchCss).toMatch(/> \.inspector-toolbar\s*\{[^}]*grid-row: 2;/s);
    expect(workbenchCss).toContain('.properties[data-inspector-search-open]');
    expect(workbenchCss).toContain('.inspector-search-workspace-header');
    expect(workbenchCss).toContain('grid-template-rows: 40px auto auto minmax(0, 1fr);');
    expect(workbenchCss).toContain('.designer-datav-section-summary');
    expect(workbenchCss).toContain('right: 8px;');
    expect(workbenchCss).toContain('calc(var(--layer-depth, 0) * 20px);');
    expect(workbenchCss).toContain('.statusbar [data-project-status]');
    expect(workbenchCss).toContain('flex: 0 1 auto;');
    expect(workbenchCss).toContain('.statusbar [data-project-revision]');
    expect(workbenchCss).toContain('overflow-wrap: anywhere;');
  });

  it('keeps nested scrolling panel shells free of duplicate scrollbar gutters', () => {
    expect(workbenchCss).toMatch(/\.rail-view\[data-materials\]\s*\{[^}]*scrollbar-gutter: auto;/s);
    expect(workbenchCss).toMatch(
      /\.properties \.inspector-pane\[data-inspector-pane="data"\]\s*\{[^}]*scrollbar-gutter: auto;/s,
    );
    expect(workbenchCss).toMatch(/\.material-grid\s*\{[^}]*scrollbar-gutter: stable;/s);
    expect(workbenchCss).toMatch(
      /\.properties \.designer-datav-data-flow-content\s*\{[^}]*scrollbar-gutter: stable;/s,
    );
  });

  it('clips rendered components at the canvas boundary without clipping authoring overlays', () => {
    expect(workbenchCss).toMatch(
      /\.canvas-content\s*\{[^}]*overflow: clip;[^}]*border-radius: inherit;/s,
    );
    const canvasRule = workbenchCss.match(/\.canvas\s*\{([^}]*)\}/s);
    expect(canvasRule).not.toBeNull();
    expect(canvasRule?.[1]).not.toContain('overflow:');
  });

  it('keeps host left panel groups bounded, stable, and hidden with the collapsed rail', () => {
    expect(workbenchCss).toMatch(
      /\.rail-tab-label\s*\{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s,
    );
    expect(workbenchCss).toMatch(
      /\.host-left-panel-content > slot::slotted\(\*\)\s*\{[^}]*box-sizing: border-box;[^}]*min-width: 0;[^}]*max-width: 100%;/s,
    );
    expect(baseCss).toContain(
      '.designer[data-left-collapsed="true"] [data-host-left-panel-group][role="tabpanel"]',
    );
  });

  it('keeps inspector pane focus scrolling free of scroll-padding nudges', () => {
    // scroll-padding-block 会把边缘附近的焦点控件视为"需要滚入视口"：mousedown 聚焦
    // checkbox/select 时浏览器每次都会把面板滚动位置拖向控件（一次变化一次跳动），
    // 直到控件稳定在 padding 区域内。属性规则必须保持无 scroll-padding。
    const paneRule = workbenchCss.match(/\.properties \.inspector-pane\s*\{([^}]*)\}/s);
    expect(paneRule).not.toBeNull();
    expect(paneRule?.[1]).not.toContain('scroll-padding');
  });

  it('R3 renders discoverable collapsed rails with stable controls (ADR-0037)', () => {
    // 折叠轨：关闭 scrollbar-gutter 占用，左侧按钮使用独立的 48px 顶部控制槽。
    expect(workbenchCss).toContain('.designer[data-left-collapsed="true"] .rail,');
    expect(workbenchCss).toContain('.designer[data-right-collapsed="true"] .properties {');
    expect(workbenchCss).toContain('scrollbar-gutter: auto;');
    expect(workbenchCss).toMatch(
      /\.designer\[data-left-collapsed="true"\] \.rail \.panel-heading\s*\{[^}]*position: relative;[^}]*box-sizing: border-box;[^}]*grid-column: 1;[^}]*grid-row: 1;[^}]*width: 48px;[^}]*height: 48px;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer\[data-right-collapsed="true"\] \.properties \.panel-heading\s*\{[^}]*box-sizing: border-box;[^}]*padding: 8px;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer\[data-left-collapsed="true"\] \.rail \.panel-heading,\s*\.designer\[data-right-collapsed="true"\] \.properties \.panel-heading\s*\{[^}]*background: linear-gradient\(/s,
    );
    // 属性表单控件的表面规则不得覆盖右侧面板的折叠按钮。
    expect(workbenchCss).toContain('.properties .designer-control:not(.panel-collapse) {');
    expect(workbenchCss).not.toContain('.properties .designer-control {');
    expect(workbenchCss).toMatch(
      /\.designer\[data-left-collapsed="true"\] \.rail-tabs\s*\{[^}]*grid-row: 2;[^}]*padding-top: var\(--designer-space-2\);/s,
    );
    // 视觉按钮保持紧凑，但命中区达到 44px。
    expect(workbenchCss).toMatch(/\.panel-collapse::before\s*\{[^}]*inset: -6px;/s);
    expect(workbenchCss).toMatch(
      /\.panel-collapse\s*\{[^}]*transition: transform var\(--designer-motion\);/s,
    );
    // 右侧折叠轨显示纵向属性上下文，而不是空白轨道；不使用 writing-mode。
    expect(workbenchCss).toMatch(
      /\.designer\[data-right-collapsed="true"\] \.properties \.panel-collapsed-label\s*\{[^}]*display: block;[^}]*word-break: break-all;/s,
    );
    // 折叠按钮防压扁；分隔线仍保留指针事件，以支持越过阈值后拖拽展开。
    expect(workbenchCss).toContain('.designer[data-left-collapsed="true"] .rail .panel-collapse,');
    expect(workbenchCss).toContain('flex: none;');
    expect(workbenchCss).not.toMatch(
      /\.designer\[data-(?:left|right)-collapsed="true"\] > \[data-panel-handle[^}]*\{[^}]*pointer-events:\s*none;/s,
    );
    // 左右箭头折叠态旋转 180°。
    expect(workbenchCss).toContain(
      '.designer[data-left-collapsed="true"] .rail .panel-collapse svg,',
    );
    expect(workbenchCss).toContain(
      '.designer[data-right-collapsed="true"] .properties .panel-collapse svg',
    );
    expect(workbenchCss).toContain('transform: rotate(180deg);');
  });

  it('R3 keeps a Nebula-style three-section status bar with toggles and zoom menu', () => {
    expect(workbenchCss).toContain('.statusbar {');
    expect(workbenchCss).toContain('justify-content: space-between;');
    expect(workbenchCss).toContain('.statusbar-group {');
    expect(workbenchCss).toContain('.status-toggle {');
    expect(workbenchCss).toContain('.status-toggle[aria-checked="true"] .status-toggle-dot');
    expect(workbenchCss).toContain('.status-zoom-menu {');
  });

  it('R3 gives the designer a single top bar integrating the tool cluster and project menubar', () => {
    expect(baseCss).toContain('.designer > .designer-topbar {');
    expect(baseCss).toContain('.designer > .rail {');
    expect(baseCss).toContain('grid-column: 1 / 2;');
    expect(workbenchCss).toContain('.topbar-brand {');
    expect(workbenchCss).toContain('.topbar-center {');
    expect(workbenchCss).toContain('.topbar-actions {');
    expect(workbenchCss).toContain('.designer-menu-triggers {');
    expect(workbenchCss).toContain('.designer-tool-cluster {');
    expect(workbenchCss).toContain('.topbar-segment .designer-icon-button {');
    expect(workbenchCss).toContain('border-right: 1px solid var(--designer-border-default);');
    expect(workbenchCss).toContain('.topbar-save-status {');
    expect(workbenchCss).toContain('.topbar-save-status[data-state="dirty"] {');
    expect(workbenchCss).toContain('@keyframes designer-save-status-spin');
    expect(workbenchCss).not.toContain('.status-item');
  });

  it('R3 renders nested menus as side flyouts instead of inline rows', () => {
    expect(baseCss).toContain('.designer-menu .designer-submenu {');
    expect(baseCss).toContain('position: absolute;');
    expect(baseCss).toContain('left: calc(100% - 4px);');
    expect(workbenchCss).toContain('.designer-context-menu .designer-submenu {');
  });

  it('R8 keeps canvas grid and overlay layers driven by theme tokens', () => {
    expect(tokensCss).toContain('--designer-canvas-grid-line:');
    expect(tokensCss).toContain('--designer-surface-scrim:');
    expect(tokensCss).toContain(
      '--designer-z-canvas-guide: calc(var(--designer-canvas-component-count, 0) + 1);',
    );
    expect(tokensCss).toContain(
      '--designer-z-canvas-selection: calc(var(--designer-canvas-component-count, 0) + 2);',
    );
    expect(tokensCss).toContain('--designer-z-modal: 30;');
    expect(workbenchCss).toContain('var(--designer-canvas-grid-line)');
    expect(workbenchCss).toContain('background: var(--designer-surface-scrim);');
    expect(workbenchCss).toContain('z-index: var(--designer-z-modal);');
    expect(workbenchCss).not.toMatch(/(?:#|rgb\()/);
  });

  it('R1 exposes only the documented public theme inputs through private token fallbacks', () => {
    const publicTokens = [
      'surface-workspace',
      'text-primary',
      'border-default',
      'accent',
      'success',
      'warning',
      'danger',
      'shadow-overlay',
      'motion',
      'scrollbar-thumb',
    ];

    for (const token of publicTokens) {
      expect(tokensCss).toMatch(
        new RegExp(`--designer-${token}:\\s*var\\(\\s*--base-screen-designer-${token},`),
      );
    }
    expect(tokensCss).not.toContain('--base-screen-designer-z-modal');
    expect(tokensCss).not.toContain('--base-screen-designer-space-1');
    expect(tokensCss).not.toContain('--base-screen-designer-control-height');
  });

  it('R4 scopes scrollbar token consumption to owned Designer scroll containers', () => {
    expect(baseCss).toContain(
      'scrollbar-color: var(--designer-scrollbar-thumb) var(--designer-scrollbar-track);',
    );
    expect(baseCss).toContain('.designer-menu .designer-submenu::-webkit-scrollbar-thumb');
    expect(baseCss).toContain('.designer-context-menu .designer-submenu::-webkit-scrollbar-thumb');
    expect(baseCss).toContain('.designer-help-dialog .help-content::-webkit-scrollbar-thumb');
    expect(baseCss).toContain('.rail::-webkit-scrollbar-thumb');
    expect(baseCss).toContain('.properties::-webkit-scrollbar-thumb');
    expect(baseCss).toContain('.project-workspace::-webkit-scrollbar-thumb');
    expect(baseCss).toContain('scrollbar-color: auto;');
    expect(baseCss).not.toContain('body::-webkit-scrollbar');
  });

  it('R5 keeps sticky dataset actions inside the inspector content width', () => {
    expect(workbenchCss).toContain('.designer-dataset-actions {');
    expect(workbenchCss).toContain('position: sticky;');
    expect(workbenchCss).toContain('bottom: 0;');
    expect(workbenchCss).toContain('max-width: 100%;');
    expect(workbenchCss).toMatch(
      /\.designer-dataset-actions \{\s*position: sticky;\s*bottom: 0;\s*z-index: 1;/s,
    );
    expect(workbenchCss).toMatch(
      /\.properties \.designer-datav-data-flow-content:has\(\.designer-dataset-actions\)\s*\{[^}]*padding-bottom: 0;/s,
    );
    expect(workbenchCss).not.toContain('margin: 0 calc(var(--designer-space-5) * -1);');
  });

  it('R6 keeps the DataV-inspired data flow in one continuous inspector column', () => {
    expect(workbenchCss).toMatch(
      /\.properties \.designer-datav-data-flow\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*grid-template-rows: auto minmax\(0, 1fr\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.properties \.designer-datav-data-flow-progress\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.properties\s+\.designer-data-summary-step\[aria-current="step"\]\s+\.designer-data-summary-step-marker\s*\{[^}]*border-color: var\(--designer-accent\);[^}]*background: var\(--designer-accent\);[^}]*color: var\(--designer-text-on-accent\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.properties\s+\.designer-datav-data-flow-progress\s+\.designer-data-summary-step-marker\s*\{[^}]*border-color: var\(--designer-border-strong\);[^}]*background: var\(--designer-surface-control\);[^}]*color: var\(--designer-text-muted\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.properties \.designer-data-workbench-preview\s*\{\s*display: block;/s,
    );
    expect(workbenchCss).not.toContain('writing-mode: vertical-rl;');
  });

  it('keeps dataset summaries readable and settings stable in a narrow inspector', () => {
    expect(workbenchCss).toContain('.designer-dataset-summary-header {');
    expect(workbenchCss).not.toContain('.designer-dataset-summary > div {');
    expect(workbenchCss).toMatch(
      /\.designer-dataset-binding-summary-disclosure\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 12px;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-binding-summary-role\s*\{[^}]*max-width: 88px;[^}]*text-overflow: ellipsis;[^}]*background: var\(--designer-accent-surface\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-binding-summary-value\s*\{[^}]*color: var\(--designer-text-primary\);[^}]*text-overflow: ellipsis;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-binding-summary-fields > li\s*\{[^}]*grid-template-columns: 5px minmax\(0, 1fr\);[^}]*overflow-wrap: anywhere;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-authoring-settings\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-authoring-checkbox\s*\{[^}]*display: flex;[^}]*min-height: 40px;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-refresh-controls\s*\{[^}]*grid-column: 1 \/ -1;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-authoring-setting-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/s,
    );
    expect(workbenchCss).not.toContain(
      '.designer .designer-data-workbench {\n  display: none !important;',
    );
    expect(baseCss).toMatch(
      /\.designer\[data-data-workbench-open="true"\]\s*\{[^}]*grid-template-rows: 0 minmax\(0, 1fr\) 0;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-refresh-interval-control\s*\{[^}]*grid-template-columns: 64px auto;/s,
    );
  });

  it('presents multi-field selectors as stable, visible toggle controls', () => {
    expect(workbenchCss).toMatch(
      /\.designer-dataset-field-option\s*\{[^}]*min-height: 36px;[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-field-option\[aria-pressed="true"\]\s*\{[^}]*border-color: var\(--designer-accent\);[^}]*box-shadow: inset 3px 0 0 var\(--designer-accent\);/s,
    );
    expect(workbenchCss).toContain(
      '.designer-dataset-field-option:disabled:not([aria-pressed="true"]) {',
    );
    expect(workbenchCss).toContain('.designer-dataset-field-option::before {');
    expect(workbenchCss).toMatch(
      /\.designer-dataset-field-option::after\s*\{[^}]*top: 50%;[^}]*right: calc\(var\(--designer-space-3\) \+ 8px\);[^}]*transform: translate\(50%, -50%\) rotate\(45deg\);[^}]*transform-origin: center;/s,
    );
  });

  it('keeps quick color controls on their authored swatch colors in the inspector', () => {
    expect(workbenchCss).toMatch(
      /\.properties \.quick-config-colors \.designer-quick-config-button\s*\{[^}]*border-color: color-mix\(in srgb, var\(--quick-color\) 60%, var\(--designer-border-default\)\);[^}]*background-color: var\(--quick-color\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.properties \.quick-config-colors \.designer-quick-config-button\[aria-pressed="true"\]\s*\{[^}]*border-color: var\(--designer-accent\);[^}]*box-shadow: 0 0 0 2px var\(--designer-accent-surface\);/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-datav-quick-style-section\[data-quick-style-variant="batch"\][^{]*\.quick-config-colors[^{]*\.designer-quick-config-button\[aria-pressed="true"\]\s*\{[^}]*box-shadow: inset 0 0 0 2px var\(--designer-text-primary\);/s,
    );
  });
});
