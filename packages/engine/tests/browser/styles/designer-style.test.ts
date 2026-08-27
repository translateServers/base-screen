import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adoptDesignerStyleSheets,
  createDesignerStyle,
  DESIGNER_CSS,
} from '../../../src/browser/styles/designer-style.js';

interface NodeFileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}

interface NodeRuntime {
  getBuiltinModule(name: string): unknown;
}

function readCss(file: string): string {
  const runtime = (globalThis as typeof globalThis & { readonly process?: NodeRuntime }).process;
  const fileSystem = runtime?.getBuiltinModule('node:fs') as NodeFileSystem | undefined;
  if (fileSystem === undefined) throw new Error('NODE_BUILTIN_MODULE_UNAVAILABLE');
  return fileSystem.readFileSync(new URL(file, import.meta.url), 'utf8');
}

const baseCss = readCss('../../../src/browser/styles/designer-base.css');
const controlsCss = readCss('../../../src/browser/styles/designer-controls.css');
const tokensCss = readCss('../../../src/browser/styles/designer-tokens.css');
const workbenchCss = readCss('../../../src/browser/styles/designer-workbench.css');

function parseThemeFallback(block: string, token: string): string | undefined {
  const match = block.match(
    new RegExp(`--designer-${token}:\\s*var\\(\\s*--base-screen-designer-${token},\\s*([^)]+)\\)`),
  );
  const value = match?.[1]?.trim();
  return value === undefined || value.includes('var(') ? undefined : value;
}

function parseHex(color: string): { r: number; g: number; b: number } | undefined {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  const raw = match?.[1];
  if (raw === undefined) return undefined;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(first: string, second: string): number | undefined {
  const a = parseHex(first);
  const b = parseHex(second);
  if (a === undefined || b === undefined) return undefined;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function themeBlocks(): Record<'dark' | 'light', string> {
  const dark = tokensCss.slice(
    tokensCss.indexOf(':host {'),
    tokensCss.indexOf(':host([theme="light"])'),
  );
  const light = tokensCss.slice(tokensCss.indexOf(':host([theme="light"])'));
  return { dark, light };
}

describe('designer workbench visual convergence', () => {
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
      /\.designer-dataset-field-option\s*\{[^}]*min-height: 44px;[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/s,
    );
    expect(workbenchCss).toMatch(
      /\.designer-dataset-field-option\[aria-pressed="true"\]\s*\{[^}]*border-color: var\(--designer-accent\);[^}]*box-shadow: inset 3px 0 0 var\(--designer-accent\);/s,
    );
    expect(workbenchCss).toContain(
      '.designer-dataset-field-option:disabled:not([aria-pressed="true"]) {',
    );
    expect(workbenchCss).toContain('.designer-dataset-field-option::before {');
    expect(workbenchCss).toContain('.designer-dataset-field-option::after {');
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
    expect(baseCss).toContain('grid-template-rows: 24px 28px;');
    expect(baseCss).toContain('height: 56px;');
    expect(baseCss).toContain('.material-group-navigation .material-group-button {');
    expect(baseCss).toContain('display: inline-flex;');
    expect(baseCss).toContain('.material-group-count {');
    expect(baseCss).toContain('width: 16px;');
    // 分组导航行高容不下原生滚动条轨道（会裁剪按钮）：两行隐藏滚动条，
    // 可滚动性由 data-scroll-start/end 驱动的边缘渐隐表达，遮罩不含颜色以兼容主题切换。
    expect(baseCss).not.toContain('scrollbar-gutter');
    expect(baseCss).toContain('scrollbar-width: none;');
    expect(baseCss).toContain('.material-group-children::-webkit-scrollbar {');
    expect(baseCss).toContain('.material-group-children[data-scroll-start="true"],');
    expect(baseCss).toContain('.material-group-children[data-scroll-end="true"],');
    expect(baseCss).toContain('mask-image: linear-gradient(');
    expect(baseCss).toContain('.material-filters .designer-button[aria-pressed="true"]');
    expect(baseCss).toContain('.material-search-clear:not(:disabled):active');
    expect(baseCss).toContain(
      '.material-library-status-actions .designer-button:not(:disabled):active',
    );
    expect(workbenchCss).toContain('.status-console-trigger {');
    expect(workbenchCss).toContain('width: 84px;');
    expect(workbenchCss).toContain('.designer-error-console {');
    expect(workbenchCss).toContain('.error-console-current {');
    expect(materialCardsCss).toContain('aspect-ratio: 16 / 10;');
    // 纵向功能轨占用 48px 后，卡片以 104px 为最小宽度维持双列密度，窄面板回退单列；
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

describe('designer style sheet sharing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to a style element when constructable sheets are unavailable', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    const root = { adoptedStyleSheets: [] } as unknown as ShadowRoot;

    expect(adoptDesignerStyleSheets(root)).toBe(false);
    expect(root.adoptedStyleSheets).toHaveLength(0);

    const element = createDesignerStyle({
      createElement: () => ({ textContent: '' }),
    } as unknown as Document);
    // vitest 不解析 ?inline 导入（值为空串），与模块实际拼接值精确比对。
    expect(element.textContent).toBe(DESIGNER_CSS);
  });

  it('adopts one shared constructable sheet across roots and stays idempotent', () => {
    const replaceSync = vi.fn();
    class FakeSheet {
      constructor() {
        return { replaceSync };
      }
    }
    vi.stubGlobal('CSSStyleSheet', FakeSheet);
    const first = { adoptedStyleSheets: [] } as unknown as ShadowRoot;
    const second = { adoptedStyleSheets: [] } as unknown as ShadowRoot;

    expect(adoptDesignerStyleSheets(first)).toBe(true);
    expect(first.adoptedStyleSheets).toHaveLength(1);
    expect(replaceSync).toHaveBeenCalledTimes(1);
    expect(replaceSync.mock.calls[0]?.[0]).toBe(DESIGNER_CSS);

    // 第二个 root 复用同一共享 sheet 实例，不重复 replaceSync。
    expect(adoptDesignerStyleSheets(second)).toBe(true);
    expect(second.adoptedStyleSheets[0]).toBe(first.adoptedStyleSheets[0]);
    expect(replaceSync).toHaveBeenCalledTimes(1);

    // 同一 root 重复 adopt 幂等，不追加重复条目。
    expect(adoptDesignerStyleSheets(first)).toBe(true);
    expect(first.adoptedStyleSheets).toHaveLength(1);
  });
});
