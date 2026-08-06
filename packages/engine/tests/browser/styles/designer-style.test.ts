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
    expect(workbenchCss).toContain('min-height: 56px;');
    expect(workbenchCss).toContain('.statusbar [data-project-status]');
    expect(workbenchCss).toContain('flex: 0 1 auto;');
    expect(workbenchCss).toContain('.statusbar [data-project-revision]');
    expect(workbenchCss).toContain('overflow-wrap: anywhere;');
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
    expect(workbenchCss).toContain('.status-item {');
  });

  it('R8 keeps canvas grid and overlay layers driven by theme tokens', () => {
    expect(tokensCss).toContain('--designer-canvas-grid-line:');
    expect(tokensCss).toContain('--designer-surface-scrim:');
    expect(tokensCss).toContain('--designer-z-canvas-selection: 2;');
    expect(tokensCss).toContain('--designer-z-modal: 30;');
    expect(workbenchCss).toContain('var(--designer-canvas-grid-line)');
    expect(workbenchCss).toContain('background: var(--designer-surface-scrim);');
    expect(workbenchCss).toContain('z-index: var(--designer-z-modal);');
    expect(workbenchCss).not.toMatch(/(?:#|rgb\()/);
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
});
