import { describe, expect, it } from 'vitest';
import {
  baseCss,
  contrastRatio,
  controlsCss,
  parseThemeFallback,
  themeBlocks,
  tokensCss,
  workbenchCss,
} from './designer-style-fixture.js';

describe('designer workbench interaction and accessibility', () => {
  it('keeps the fill color picker compact and its popover out of form layout flow', () => {
    expect(controlsCss).toMatch(
      /\.designer-color-palette-trigger\s*\{[^}]*width: 100%;[^}]*height: 34px;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-color-popover\s*\{[^}]*position: fixed;[^}]*box-sizing: border-box;[^}]*width: 280px;[^}]*max-height: 560px;/s,
    );
    expect(controlsCss).not.toContain('.designer-color-popover-heading');
    expect(controlsCss).toMatch(
      /\.designer-color-palette-modes\s*\{[^}]*grid-template-columns: repeat\(3, 28px\);/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-color-palette-mode\s*\{[^}]*width: 28px;[^}]*height: 28px;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-color-palette-mode-icon,[^{]*\.designer-color-palette-mode-icon svg\s*\{[^}]*width: 15px;[^}]*height: 15px;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-field:has\(> \.designer-color-palette\)\s*\{[^}]*overflow: visible;/s,
    );
    expect(controlsCss).toMatch(/\.designer-fill-color-plane\s*\{[^}]*height: 120px;/s);
    expect(controlsCss).toContain('grid-template-columns: 1.55fr repeat(4, minmax(0, 1fr));');
    expect(controlsCss).toMatch(
      /\.designer-fill-color-channel \.designer-input\[type="number"\]\s*\{[^}]*appearance: textfield;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-color-palette-stop-bar\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) auto;[^}]*min-height: var\(--designer-control-height-compact\);/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-color-palette\[data-color-palette-mode="radial-gradient"\][^{]*\.designer-color-palette-parameters\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-color-palette-stop-bar \.designer-color-palette-action\s*\{[^}]*width: var\(--designer-control-height-compact\);[^}]*height: var\(--designer-control-height-compact\);/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-fill-color-hue-track,[^{]*\.designer-fill-color-alpha-track\s*\{[^}]*height: 16px;[^}]*overflow: visible;[^}]*padding-block: 3px;[^}]*background-clip: content-box;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-fill-color-hue,[^{]*\.designer-fill-color-alpha\s*\{[^}]*position: absolute;[^}]*height: 16px;[^}]*outline: 0;[^}]*cursor: ew-resize;[^}]*touch-action: none;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-fill-color-hue::-webkit-slider-thumb,[^{]*\.designer-fill-color-alpha::-webkit-slider-thumb\s*\{[^}]*width: 14px;[^}]*height: 14px;[^}]*border-radius: 50%;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-fill-color-hue::-moz-range-thumb,[^{]*\.designer-fill-color-alpha::-moz-range-thumb\s*\{[^}]*width: 14px;[^}]*height: 14px;[^}]*border-radius: 50%;/s,
    );
    expect(controlsCss).toMatch(
      /\.designer-fill-color-hue:focus-visible,[^{]*\.designer-fill-color-alpha:focus-visible\s*\{[^}]*--designer-fill-slider-thumb-shadow:[^}]*var\(--designer-focus-ring\)[^}]*;/s,
    );
    expect(controlsCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.designer-fill-color-hue::-webkit-slider-thumb,[^{]*\.designer-fill-color-alpha::-webkit-slider-thumb\s*\{[^}]*transition-duration: 0s;[^}]*\}[^}]*\.designer-fill-color-hue::-moz-range-thumb,[^{]*\.designer-fill-color-alpha::-moz-range-thumb\s*\{[^}]*transition-duration: 0s;/s,
    );
  });

  it('keeps the DataV-style layer toolbar and tree geometry stable', () => {
    expect(workbenchCss).toContain('.rail-view[data-layers]:not([hidden]) {');
    expect(workbenchCss).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(workbenchCss).toContain('.layer-toolbar {');
    expect(workbenchCss).toContain(
      'grid-template-columns: repeat(4, minmax(28px, 1fr)) 1px repeat(2, minmax(28px, 1fr));',
    );
    expect(workbenchCss).toContain('.layer-toolbar-button:disabled {');
    expect(workbenchCss).toContain('[data-layer-root] {');
    expect(workbenchCss).toContain('scrollbar-gutter: stable;');
    expect(workbenchCss).toContain('grid-template-columns: 24px minmax(0, 1fr);');
    expect(workbenchCss).toContain('.layer-row[data-layer-selectable="true"] {');
    expect(workbenchCss).toContain('.layer-row:has(.layer-select:focus-visible) {');
    expect(workbenchCss).toContain('--layer-row-surface:');
    expect(workbenchCss).toContain('inset 2px 0 0 var(--designer-accent)');
    expect(workbenchCss).toContain('position: absolute;');
    expect(workbenchCss).not.toContain('.layer-select small {');
  });

  it('R3 presents shortcut help as a scannable, responsive modal', () => {
    expect(workbenchCss).toContain('.designer-help-dialog .help-card {');
    expect(workbenchCss).toContain('width: min(480px, 100%);');
    expect(workbenchCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(workbenchCss).toContain('.designer-help-dialog .help-section h3 {');
    expect(workbenchCss).toContain('.designer-help-dialog .help-shortcuts {');
    expect(workbenchCss).toContain('.designer-help-dialog .help-content p kbd {');
    expect(workbenchCss).toContain('@keyframes designer-help-card-in');
    expect(workbenchCss).toContain('@media (max-height: 760px)');
  });

  it('R11 preserves visible forced-color states and removes editor motion', () => {
    expect(controlsCss).toContain('.designer-checkbox:focus-visible');
    expect(controlsCss).toContain('.designer-button[aria-busy="true"]');
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(baseCss).toContain('.canvas-guide-preview');
    expect(baseCss).toContain('@media (forced-colors: active)');
    expect(baseCss).toContain('.designer-control[aria-invalid="true"]');
    expect(workbenchCss).toContain('@media (forced-colors: active)');
    expect(workbenchCss).toContain('.canvas-guide-snap');
    expect(workbenchCss).toContain('background: Highlight;');
  });

  it('keeps all Designer buttons on one interaction-state contract', () => {
    expect(tokensCss).toContain('--designer-button-primary-background: color-mix(');
    expect(tokensCss).toContain('--designer-button-primary-hover: color-mix(');
    expect(tokensCss).toContain('--designer-button-primary-active: color-mix(');
    expect(controlsCss).toMatch(/\.designer-button\s*\{[^}]*touch-action: manipulation;/s);
    expect(controlsCss).toMatch(/\.designer-button\s*\{[^}]*transition: transform/s);
    expect(controlsCss).toContain('.designer-button:hover:not(:disabled) {');
    expect(controlsCss).toContain(
      '.designer-button[data-variant="primary"]:hover:not(:disabled) {',
    );
    expect(controlsCss).toContain('.designer-button[data-variant="danger"]:hover:not(:disabled) {');
    expect(controlsCss).toContain('.designer-button[data-variant="ghost"]:hover:not(:disabled) {');
    expect(controlsCss).toContain('.designer-button[aria-pressed="true"]:hover:not(:disabled) {');
    expect(controlsCss).toContain('.designer-button:disabled {');
    expect(controlsCss).toContain('color: var(--designer-text-on-accent);');
    expect(controlsCss).not.toContain('transform: scale(0.96);');
  });

  it('R2 centers the selection outline on the component bounds so snap guides align with it', () => {
    expect(workbenchCss).toContain('.selection {');
    expect(workbenchCss).toContain('outline: 2px solid var(--designer-accent);');
    expect(workbenchCss).toContain('outline-offset: -1px;');
    expect(workbenchCss).toContain('.selection-grab {');
    expect(workbenchCss).toContain('pointer-events: auto;');
  });

  it('keeps keyboard focus visible on the canvas without changing viewport geometry', () => {
    expect(workbenchCss).toMatch(/\.viewport:focus\s*\{[^}]*outline: none;/s);
    const focusVisibleRule = workbenchCss.match(
      /\.viewport:focus-visible:not\(\[data-pointer-focus\]\)\s*\{([^}]*)\}/s,
    );

    expect(focusVisibleRule?.[1]).toContain(
      'box-shadow: inset 0 0 0 2px var(--designer-focus-ring);',
    );
    expect(focusVisibleRule?.[1]).not.toContain('border:');
    expect(workbenchCss).not.toMatch(/\.viewport:focus\s*,\s*\.viewport:focus-visible/);
  });

  it('draws panel separator focus without changing the resize hit area', () => {
    expect(workbenchCss).toMatch(/\.panel-handle:focus-visible\s*\{[^}]*outline: none;/s);
    expect(workbenchCss).toMatch(
      /\.panel-handle:focus-visible::before\s*\{[^}]*background: var\(--designer-focus-ring\);[^}]*box-shadow:/s,
    );
    expect(workbenchCss).not.toMatch(/\.panel-handle:focus-visible\s*\{[^}]*border:/s);
  });

  it('keeps coordinate entry viewport-anchored, focusable, and geometrically stable', () => {
    const coordinateCss = workbenchCss.slice(
      workbenchCss.indexOf('.designer-coordinate-entry {'),
      workbenchCss.indexOf('.viewport[data-grid="false"]'),
    );

    expect(coordinateCss).toMatch(/\.designer-coordinate-entry\s*\{[^}]*position: absolute;/s);
    expect(coordinateCss).toContain('width: min(192px, calc(100% - 16px));');
    expect(coordinateCss).toMatch(/\.designer-coordinate-entry\s*\{[^}]*border: 0;/s);
    expect(coordinateCss).toMatch(/\.designer-coordinate-entry\s*\{[^}]*padding: 0;/s);
    expect(coordinateCss).toMatch(/\.designer-coordinate-entry\s*\{[^}]*background: transparent;/s);
    expect(coordinateCss).toMatch(/\.designer-coordinate-entry\s*\{[^}]*box-shadow: none;/s);
    expect(coordinateCss).toMatch(/\.designer-coordinate-entry\[hidden\]\s*\{[^}]*display: none;/s);
    expect(coordinateCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(coordinateCss).toMatch(/\.designer-coordinate-entry-error\s*\{[^}]*min-height: 14px;/s);
    expect(coordinateCss).toMatch(/\.designer-coordinate-entry-input input\s*\{[^}]*border: 0;/s);
    expect(coordinateCss).toMatch(
      /\.designer-coordinate-entry-input input\s*\{[^}]*height: 26px;[^}]*min-height: 26px;/s,
    );
    expect(coordinateCss).toMatch(
      /\.designer-coordinate-entry-input input\s*\{[^}]*padding-left: 22px;/s,
    );
    expect(coordinateCss).toMatch(
      /\.designer-coordinate-entry-axis,[^{]*\.designer-coordinate-entry-unit\s*\{[^}]*z-index: 1;/s,
    );
    expect(coordinateCss).not.toContain('transform:');
    expect(controlsCss).toContain('.designer-control:focus-visible');
    expect(controlsCss).toContain('.designer-control[aria-invalid="true"]');
  });

  it('R2 styles Moveable-like transient distance measurements with tokens', () => {
    expect(tokensCss).toContain('--designer-measurement-label:');
    expect(workbenchCss).toContain('.canvas-measurement {');
    expect(workbenchCss).toContain(
      'border-left: var(--designer-overlay-pixel, 1px) dashed var(--designer-snap-guide);',
    );
    expect(workbenchCss).toContain('.canvas-measurement-label {');
    expect(workbenchCss).toContain('color: var(--designer-measurement-label);');
  });

  it('R2 built-in dark/light text, focus and semantic pairs meet documented contrast', () => {
    const { dark, light } = themeBlocks();
    const surfaceTokens = [
      'surface-workspace',
      'surface-panel',
      'surface-raised',
      'surface-control',
      'surface-overlay',
    ];
    for (const [themeName, block] of Object.entries({ dark, light })) {
      const surface = (name: string): string => parseThemeFallback(block, name) ?? '';
      const surfaces = surfaceTokens.map(surface);
      const atLeast = (value: number, minimum: number): void => {
        expect(value, themeName).toBeGreaterThanOrEqual(minimum);
      };

      // 普通正文：primary/secondary 在全部 surface 上达到 WCAG AA 4.5:1。
      const primary = surface('text-primary');
      const secondary = surface('text-secondary');
      for (const background of surfaces) {
        atLeast(contrastRatio(primary, background) ?? -1, 4.5);
        atLeast(contrastRatio(secondary, background) ?? -1, 4.5);
      }

      // 标签/辅助文字只落在 panel 与 overlay 上，仍按正文 4.5:1 校验。
      const muted = surface('text-muted');
      atLeast(contrastRatio(muted, surface('surface-panel')) ?? -1, 4.5);
      atLeast(contrastRatio(muted, surface('surface-overlay')) ?? -1, 4.5);

      // focus ring 是非文本界面指示，对常见 surface 至少 3:1。
      const focus = surface('focus-ring');
      for (const background of [
        surface('surface-workspace'),
        surface('surface-panel'),
        surface('surface-control'),
        surface('surface-overlay'),
      ]) {
        atLeast(contrastRatio(focus, background) ?? -1, 3);
      }

      // 语义角色与其低强调 surface 至少 3:1（非文本/较大文本）。
      for (const token of ['accent', 'success', 'warning', 'danger']) {
        const foreground = surface(token);
        const background = surface(`${token}-surface`);
        atLeast(contrastRatio(foreground, background) ?? -1, 3);
      }

      // 主按钮使用独立的深色化 accent token；最终组合色对比度由真实浏览器用例校验。
      expect(tokensCss).toContain('--designer-button-primary-background: color-mix(');
    }
  });

  it('R2 keeps the material library hierarchy token-driven and geometrically stable', () => {
    const materialCardsCss = workbenchCss.slice(
      workbenchCss.indexOf('.material-grid {'),
      workbenchCss.indexOf('.designer-asset-section {'),
    );

    expect(baseCss).toContain('.material-group-navigation {');
    expect(baseCss).toContain('grid-template-columns: 32px 76px;');
    expect(baseCss).toContain('grid-template-columns: 108px minmax(0, 1fr);');
    expect(baseCss).toContain('grid-template-rows: 32px minmax(0, 1fr);');
    expect(baseCss).toContain('.material-group-navigation .material-group-button {');
    expect(baseCss).toContain('flex: 0 0 var(--designer-control-height-compact);');
    expect(baseCss).not.toContain('.material-group-heading {');
    expect(baseCss).toMatch(/\.material-group-roots\s*\{[^}]*padding-inline: 0;/s);
    expect(baseCss).toMatch(
      /\.material-group-navigation \.material-group-back,\s*\.material-group-navigation \.material-group-button\s*\{[^}]*width: 100%;[^}]*height: var\(--designer-control-height-compact\);/s,
    );
    expect(baseCss).toMatch(
      /\.material-group-navigation \.material-group-button\[aria-pressed="true"\]:hover:not\(:disabled\)\s*\{[^}]*color: var\(--designer-text-primary\);/s,
    );
    expect(baseCss).toMatch(
      /\.material-group-glyph,\s*\.material-group-glyph svg,\s*\.material-group-toggle-glyph,\s*\.material-group-toggle-glyph svg\s*\{[^}]*width: var\(--designer-icon-size\);[^}]*height: var\(--designer-icon-size\);/s,
    );
    expect(baseCss).toMatch(
      /\.material-group-roots \.material-group-label,\s*\.material-group-roots \.material-group-meta\s*\{[^}]*display: none;/s,
    );
    expect(baseCss).toMatch(/\.material-group-count\s*\{[^}]*display: none;/s);
    expect(baseCss).toMatch(
      /\.material-group-popover \.material-group-children \.material-group-count\s*\{[^}]*display: grid;/s,
    );
    expect(baseCss).toContain('.material-group-count {');
    expect(baseCss).toContain('flex: 0 0 24px;');
    // 两列独立纵向滚动，隐藏滚动条（无可见滚动条，同 .material-categories 模式）。
    expect(baseCss).toMatch(
      /\.material-group-roots,\s*\.material-group-children\s*\{[^}]*scrollbar-width: none;/s,
    );
    expect(baseCss).toMatch(
      /\.material-group-roots::-webkit-scrollbar,\s*\.material-group-children::-webkit-scrollbar\s*\{[^}]*display: none;/s,
    );
    expect(baseCss).not.toContain('data-scroll-start');
    expect(baseCss).not.toContain('data-scroll-end');
    expect(baseCss).toContain('@container material-library (width < 264px)');
    expect(workbenchCss).toContain('container-name: material-library;');
    expect(baseCss).toMatch(/\.material-group-overlay\s*\{[^}]*position: absolute;/s);
    expect(baseCss).toMatch(/\.material-group-popover\s*\{[^}]*width: 288px;[^}]*height: 360px;/s);
    expect(baseCss).toContain('.material-filters .designer-button[aria-pressed="true"]');
    expect(baseCss).toMatch(
      /\.material-search input,\s*\.layer-search input\s*\{[^}]*padding-left: calc\(var\(--designer-space-3\) \+ var\(--designer-control-height\)\);/s,
    );
    expect(baseCss).toContain('.material-search-clear:not(:disabled):active');
    expect(baseCss).toMatch(
      /\.material-search \.material-search-clear\s*\{[^}]*top: 0;[^}]*bottom: 0;[^}]*width: 24px;[^}]*height: 24px;[^}]*margin-block: auto;/s,
    );
    expect(baseCss).toMatch(
      /\.material-search input::-webkit-search-cancel-button\s*\{[^}]*display: none;/s,
    );
    expect(baseCss).toContain(
      '.material-library-status-actions .designer-button:not(:disabled):active',
    );
    expect(workbenchCss).toContain('.status-console-trigger {');
    expect(workbenchCss).toContain('width: 84px;');
    expect(workbenchCss).toContain('.designer-error-console {');
    expect(workbenchCss).toContain('.error-console-current {');
    expect(workbenchCss).toContain('.error-console-history-heading {');
    expect(workbenchCss).toContain('.error-console-entry-heading {');
    expect(workbenchCss).toMatch(/\.error-console-list\s*\{[^}]*scrollbar-gutter:\s*stable;/s);
    expect(workbenchCss).toContain(
      '[data-error-console-summary][data-error-console-tone="warning"]',
    );
    expect(materialCardsCss).toContain('aspect-ratio: 16 / 10;');
    // 纵向功能轨和分类列以外，卡片以 104px 为最小宽度自适应列数；
    // min(104px, 100%) 保证最窄面板下卡片不超出内容区。
    expect(materialCardsCss).toContain(
      'grid-template-columns: repeat(auto-fill, minmax(min(104px, 100%), 1fr));',
    );
    expect(workbenchCss).toContain('.material-library-toolbar {');
    expect(workbenchCss).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(materialCardsCss).toContain('overflow: hidden auto;');
    expect(materialCardsCss).toContain('.material-card-meta {');
    expect(materialCardsCss).toContain('display: grid;');
    expect(materialCardsCss).toContain('hsl(var(--material-hue, 215)');
    // 交互只做绘制反馈：图标缩放、边框与阴影变化，禁止位移类变换（防抖）。
    expect(materialCardsCss).not.toContain('translateY(');
  });

  it('R2 disables editor motion under reduced motion and keeps system scrollbar in forced colors', () => {
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(baseCss).toContain('.designer-control,');
    expect(baseCss).toContain('.material-card,');
    expect(baseCss).toContain('.designer-error-console,');
    expect(baseCss).toMatch(/scrollbar-color:\s*auto;/);
    expect(baseCss).toMatch(/@media\s*\(forced-colors:\s*active\)/);
    expect(baseCss).toContain(
      '.material-group-navigation .material-group-button[aria-pressed="true"]',
    );
  });
});
