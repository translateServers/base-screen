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
const controller = readSource(
  '../../../../src/browser/controllers/blueprint/designer-blueprint-workbench-controller.ts',
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
      "'commit-layout'",
      "'commit-viewport'",
      "'run-simulation'",
    ]) {
      expect(canvas).toContain(`type: ${command}`);
    }
  });

  it('stays an engine surface and never claims the host slot', () => {
    expect(canvas).not.toContain('BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT');
    expect(canvas).toContain("root.dataset.designerBlueprintCanvas = 'true'");
    expect(css).toContain('.designer-blueprint-canvas {');
  });

  it('mounts the default canvas only when no host canvas is assigned', () => {
    expect(markup).toContain('data-blueprint-default-canvas');
    expect(controller).toContain('createDesignerBlueprintDefaultCanvas');
    expect(controller).toContain('assigned ?? fallback');
    expect(controller).toContain('fallback.hidden = assigned !== undefined');
  });

  it('keeps the 24px port hit area, far-zoom labels and shared canvas grid tokens', () => {
    expect(nodesCss).toMatch(
      /\.designer-blueprint-canvas-port\s*\{[^}]*width: 24px;[^}]*height: 24px;/s,
    );
    expect(css).toContain('background-image: var(--designer-canvas-surface-image);');
    expect(css).toContain('background-size: var(--designer-canvas-surface-size);');
    expect(edgesCss).toContain('.designer-blueprint-canvas-viewport[data-zoom-far="true"]');
  });

  it('keeps the no-host fallback hidden behind the shared slot-ready state', () => {
    expect(surfaceCss).toContain('.designer-blueprint-default-canvas');
    expect(surfaceCss).toContain(
      '.designer-blueprint-surface[data-slot-ready="true"] .designer-blueprint-fallback',
    );
  });
});
