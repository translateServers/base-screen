import { describe, expect, it } from 'vitest';

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
    expect(workbenchCss).toContain('calc(var(--layer-depth, 0) * 20px);');
    expect(workbenchCss).toContain('.statusbar [data-project-status]');
    expect(workbenchCss).toContain('flex: 0 1 auto;');
    expect(workbenchCss).toContain('.statusbar [data-project-revision]');
    expect(workbenchCss).toContain('overflow-wrap: anywhere;');
  });

  it('R3 renders a usable collapsed rail with rotating collapse arrows (ADR-0037)', () => {
    // 折叠轨：关闭 scrollbar-gutter 占用，标题/计数不占 flex 槽位。
    expect(workbenchCss).toContain('.designer[data-left-collapsed="true"] .rail,');
    expect(workbenchCss).toContain('.designer[data-right-collapsed="true"] .properties {');
    expect(workbenchCss).toContain('scrollbar-gutter: auto;');
    expect(workbenchCss).toContain('.designer[data-left-collapsed="true"] .rail .panel-title,');
    expect(workbenchCss).toContain('.designer[data-left-collapsed="true"] .rail .panel-count,');
    expect(workbenchCss).toContain('display: none;');
    // 折叠按钮防压扁。
    expect(workbenchCss).toContain('.designer[data-left-collapsed="true"] .rail .panel-collapse,');
    expect(workbenchCss).toContain('flex: none;');
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
    expect(workbenchCss).not.toContain('margin: 0 calc(var(--designer-space-5) * -1);');
  });

  it('collapses the layer type label in interactive rows instead of squeezing the name', () => {
    // 交互态（hover/focus-within/选中/激活开关）类型标注 opacity 归零的同时折叠宽度，
    // 释放给 layer-name；仅淡出会保留不可见宽度并挤占名称（历史缺陷）。
    const interactiveRule = workbenchCss.slice(
      workbenchCss.indexOf('.layer-row:hover .layer-select small,'),
      workbenchCss.indexOf('/* 操作图标无底板'),
    );
    expect(interactiveRule).toContain('.layer-row[aria-selected="true"] .layer-select small,');
    expect(interactiveRule).toContain(
      '.layer-row:has(.layer-actions .designer-button[aria-pressed="true"]) .layer-select small {',
    );
    expect(interactiveRule).toContain('opacity: 0;');
    expect(interactiveRule).toContain('max-width: 0;');
    // 静息态保留类型标注（42% 上限），仅交互态折叠。
    expect(workbenchCss).toContain('max-width: 42%;');
    expect(workbenchCss).toContain(
      'transition:\n    opacity var(--designer-motion),\n    max-width var(--designer-motion);',
    );
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

      // accent 作为主按钮背景时，前景是 workspace 文本色，至少 3:1。
      atLeast(contrastRatio(surface('accent'), surface('surface-workspace')) ?? -1, 3);
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
    // 自适应列数：卡片最小 128px（+6px 列距），面板拖宽至约 300px 时一行两列，窄面板回退单列；
    // min(128px, 100%) 保证最窄面板（160px）下卡片不超出轨宽。
    expect(materialCardsCss).toContain(
      'grid-template-columns: repeat(auto-fill, minmax(min(128px, 100%), 1fr));',
    );
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
