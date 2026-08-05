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
    expect(workbenchCss).toContain('grid-template-rows: 48px 20px minmax(0, 1fr) 28px;');
    expect(workbenchCss).toContain('min-height: 52px;');
    expect(workbenchCss).toContain('.statusbar > [data-project-status]');
    expect(workbenchCss).toContain('flex: 0 1 12ch;');
    expect(workbenchCss).toContain('.statusbar > [data-project-revision]');
    expect(workbenchCss).toContain('flex: 0 1 18ch;');
    expect(workbenchCss).toContain('overflow-wrap: anywhere;');
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
});
