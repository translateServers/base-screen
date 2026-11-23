import { describe, expect, it } from 'vitest';

interface NodeFileSystem {
  readFileSync(file: URL, encoding: 'utf8'): string;
}

interface NodeRuntime {
  getBuiltinModule(name: string): unknown;
}

function readSource(file: string): string {
  const runtime = (globalThis as typeof globalThis & { readonly process?: NodeRuntime }).process;
  const fileSystem = runtime?.getBuiltinModule('node:fs') as NodeFileSystem | undefined;
  if (fileSystem === undefined) throw new Error('NODE_BUILTIN_MODULE_UNAVAILABLE');
  return fileSystem.readFileSync(new URL(file, import.meta.url), 'utf8');
}

const canvas = readSource(
  '../../../../src/browser/dom/blueprint/designer-blueprint-default-canvas.ts',
);
const panel = readSource(
  '../../../../src/browser/controllers/blueprint/designer-blueprint-workbench-panel.ts',
);
const markup = readSource('../../../../src/browser/dom/workspace/designer-workspace-markup.ts');
const css = readSource(
  '../../../../src/browser/styles/workbench/designer-workbench-blueprint-canvas.css',
);
const edgesCss = readSource(
  '../../../../src/browser/styles/workbench/designer-workbench-blueprint-canvas-edges.css',
);
const nodesCss = readSource(
  '../../../../src/browser/styles/workbench/designer-workbench-blueprint-canvas-nodes.css',
);
const surfaceCss = readSource(
  '../../../../src/browser/styles/workbench/designer-workbench-blueprint-surface.css',
);

describe('engine default blueprint canvas', () => {
  it('speaks the public canvas protocol instead of a private channel', () => {
    expect(canvas).toContain('export function createDesignerBlueprintDefaultCanvas');
    expect(canvas).toContain('BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT');
    expect(canvas).toContain('BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT');
    expect(canvas).toContain('BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME');
    for (const command of [
      "'ready'",
      "'select'",
      "'connect'",
      "'delete-selection'",
      "'insert-node'",
      "'update-node'",
      "'duplicate-nodes'",
      "'commit-layout'",
      "'run-simulation'",
      "'clear-simulation'",
      "'history-undo'",
      "'history-redo'",
    ]) {
      expect(canvas).toContain(`type: ${command}`);
    }
  });

  it('stays an engine surface and never claims the host slot', () => {
    expect(canvas).not.toContain('BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT');
    expect(canvas).toContain("dataset.designerBlueprintCanvas = 'true'");
    expect(css).toContain('.designer-blueprint-canvas {');
  });

  it('mounts the default canvas only when no host canvas is assigned', () => {
    expect(markup).toContain('data-blueprint-default-canvas');
    expect(panel).toContain('createDesignerBlueprintDefaultCanvas');
    expect(panel).toContain('assigned ?? fallback');
    expect(panel).toContain('fallback.hidden = assigned !== undefined');
  });

  it('keeps the LIGHT CHASER card geometry, 28px port hit area and shared grid tokens', () => {
    expect(canvas).toContain('const NODE_WIDTH = 164;');
    expect(canvas).toContain('const ROW_HEIGHT = 27;');
    expect(canvas).toContain('const SNAP_DISTANCE = 28;');
    expect(nodesCss).toMatch(/\.bp-port::before\s*\{[^}]*width: 28px;[^}]*height: 28px;/s);
    expect(css).toContain('background-image: var(--designer-canvas-surface-image);');
    // 点阵随平移缩放，光晕层固定不平铺：平移只写 --bp-pan-*，不写整个 background-position。
    expect(css).toContain('background-repeat: repeat, no-repeat;');
    expect(css).toContain('var(--bp-pan-x, 0) var(--bp-pan-y, 0)');
    expect(canvas).not.toContain('style.backgroundPosition');
    expect(edgesCss).toContain('--designer-blueprint-edge');
  });

  it('builds the context menu from the shared designer menu styles', () => {
    expect(canvas).toContain('designer-context-menu');
    expect(canvas).toContain('designer-menu-item');
    // 行结构与顶栏菜单同源：图标 / 标签 / 快捷键三列，危险项用共享的 data-menu-tone。
    expect(canvas).toContain('class="menu-item-icon"');
    expect(canvas).toContain('class="menu-item-label"');
    expect(canvas).toContain('data-menu-tone="danger"');
  });

  it('keeps the no-host fallback hidden behind the shared slot-ready state', () => {
    expect(surfaceCss).toContain('.designer-blueprint-default-canvas');
    expect(surfaceCss).toContain(
      '.designer-blueprint-surface[data-slot-ready="true"] .designer-blueprint-fallback',
    );
  });
});
