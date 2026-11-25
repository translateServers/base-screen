import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { renderDesignerBlueprintInspector } from '../../../../src/browser/dom/blueprint/designer-blueprint-inspector-dom.js';
import { renderDesignerBlueprintLibrary } from '../../../../src/browser/dom/blueprint/designer-blueprint-library-dom.js';
import { renderDesignerBlueprintWorkbenchChrome } from '../../../../src/browser/dom/blueprint/designer-blueprint-workbench-dom.js';
import {
  buildDesignerBlueprintComponentLibrary,
  buildDesignerBlueprintGraph,
  buildDesignerBlueprintVariableLibrary,
} from '../../../../src/common/operations/blueprint/designer-blueprint-model.js';
import {
  type BaseScreenBlueprintCanvasSelection,
  EMPTY_BLUEPRINT_CANVAS_SELECTION,
} from '../../../../src/common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

const catalog = {
  get: () => ({
    manifest: {
      events: ['click'],
      editorDescriptor: {
        events: [
          {
            name: 'click',
            label: 'Click',
            payloadSchema: {
              kind: 'object',
              properties: {
                row: { kind: 'object', properties: { id: { kind: 'string' } }, required: [] },
              },
              required: [],
            },
          },
        ],
      },
    },
  }),
} as unknown as BaseScreenMaterialCatalog;

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'source',
      type: 'base.button',
      name: 'Source',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    },
  ],
  variables: [
    { type: 'static', id: 'selected', name: 'selected<script>', initialValue: null },
    { type: 'static', id: 'fallback', name: 'fallback', initialValue: 1 },
  ],
  blueprint: {
    nodes: [
      { kind: 'component', id: 'component:source', componentId: 'source' },
      { kind: 'variable', id: 'variable:selected', variableId: 'selected' },
      {
        kind: 'condition',
        id: 'condition-1',
        name: 'Gate',
        condition: { left: { kind: 'event-payload', path: ['row'] }, operator: 'exists' },
      },
    ],
    edges: [
      {
        kind: 'flow',
        id: 'judge',
        from: { node: 'component:source', port: 'event:click' },
        to: { node: 'condition-1', port: 'judge' },
      },
      {
        kind: 'flow',
        id: 'write',
        from: { node: 'condition-1', port: 'yes' },
        to: { node: 'variable:selected', port: 'set' },
        value: { kind: 'event-payload', path: ['row', 'id'] },
      },
    ],
  },
};

const runtime = { getResourceType: () => undefined, hasBlueprintCapability: () => true };
const graph = buildDesignerBlueprintGraph(document, catalog, runtime, DESIGNER_UI_TEXT.blueprint);

function library(
  selection: BaseScreenBlueprintCanvasSelection,
  activeTab: string,
  groups?: never[],
) {
  const container = { innerHTML: '' } as HTMLElement;
  renderDesignerBlueprintLibrary(container, {
    document,
    graph,
    components: buildDesignerBlueprintComponentLibrary(document, catalog, runtime),
    variables: buildDesignerBlueprintVariableLibrary(document, DESIGNER_UI_TEXT.blueprint),
    selection,
    query: '',
    activeTab: activeTab as never,
    groups,
  });
  return container.innerHTML;
}

function inspector(
  selection: BaseScreenBlueprintCanvasSelection,
  tab: 'configuration' | 'problems' | 'trace',
  extra: { diagnostics?: never[]; trace?: never } = {},
) {
  const container = { innerHTML: '' } as HTMLElement;
  renderDesignerBlueprintInspector(
    container,
    document,
    graph,
    selection,
    tab,
    extra.diagnostics ?? [],
    extra.trace ?? null,
    catalog,
  );
  return container.innerHTML;
}

describe('Designer Blueprint panel DOM', () => {
  it('reveals the Blueprint panels and restores the canvas heading on mode changes', () => {
    const layout = { dataset: {} };
    const library = { hidden: true };
    const inspector = { hidden: true };
    const leftTitle = { textContent: '素材', dataset: {} };
    const leftCount = {
      textContent: '4',
      dataset: {},
      attributes: new Map([['aria-label', '素材：4 项']]),
      getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
      },
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      },
    };
    const rightTitle = { textContent: '页面配置', dataset: {} };
    const elements = new Map<string, unknown>([
      ['.designer', layout],
      ['[data-blueprint-library]', library],
      ['[data-blueprint-inspector]', inspector],
      ['[data-left-panel-title]', leftTitle],
      ['[data-left-panel-count]', leftCount],
      ['[data-right-panel-title]', rightTitle],
    ]);
    const root = {
      querySelector(selector: string) {
        return elements.get(selector) ?? null;
      },
      querySelectorAll() {
        return [];
      },
    } as unknown as ShadowRoot;

    renderDesignerBlueprintWorkbenchChrome(root, 'blueprint', true, {
      nodes: 7,
      relations: 2,
      semantic: 1,
      structural: 1,
      problems: 0,
    });
    expect(library.hidden).toBe(false);
    expect(inspector.hidden).toBe(false);
    expect(leftTitle.textContent).toBe('蓝图节点库');
    expect(leftCount.textContent).toBe('7');
    expect(rightTitle.textContent).toBe('蓝图配置');

    renderDesignerBlueprintWorkbenchChrome(root, 'canvas', true, {
      nodes: 7,
      relations: 2,
      semantic: 1,
      structural: 1,
      problems: 0,
    });
    expect(library.hidden).toBe(true);
    expect(inspector.hidden).toBe(true);
    expect(leftTitle.textContent).toBe('素材');
    expect(leftCount.textContent).toBe('4');
    expect(rightTitle.textContent).toBe('页面配置');
  });

  it('renders the component, logic and variable library with escaped, bounded actions', () => {
    const variables = library(EMPTY_BLUEPRINT_CANVAS_SELECTION, 'variables');
    expect(variables).toContain('data-blueprint-select-node="variable:selected"');
    expect(variables).toContain('data-blueprint-add-variable="fallback"');
    expect(variables).toContain('data-blueprint-drag-kind="variable"');
    expect(variables).toContain('selected&lt;script&gt;');
    expect(variables).not.toContain('selected<script>');
    const logic = library({ nodes: [], edges: ['write'] }, 'relations');
    expect(logic).toContain('data-blueprint-insert-node="timer"');
    expect(logic).toContain('data-blueprint-insert-node="condition"');
    expect(logic).toContain('data-blueprint-select-edge="write"');
    expect(logic).toMatch(/data-selected="true"[^>]*data-category="data"/);
  });

  it('projects Blueprint-enabled host groups into the shared rail without duplicating slots', () => {
    const html = library(EMPTY_BLUEPRINT_CANVAS_SELECTION, 'host:automation', [
      { id: 'assets', label: 'Canvas assets' },
      {
        id: 'automation',
        label: 'Automation <tools>',
        icon: 'sparkle',
        workbenchModes: ['blueprint'],
      },
    ] as never[]);
    expect(html).toContain('data-blueprint-library-tab="host:automation"');
    expect(html).toContain('data-host-left-panel-mode="blueprint"');
    expect(html).toContain('aria-controls="designer-host-automation-panel"');
    expect(html).toContain('class="rail-view blueprint-library-main" hidden');
    expect(html).toContain('Automation &lt;tools&gt;');
    expect(html).not.toContain('host:assets');
    expect(html).not.toContain('<slot');
  });

  it('renders problems and the depth-first simulation trace in dedicated tabs', () => {
    const diagnostics = [
      {
        severity: 'error',
        code: 'BLUEPRINT_CONDITION_INVALID',
        path: [],
        message: 'rule <script> broken',
      },
    ] as never[];
    const trace = {
      trigger: { nodeId: 'component:source', port: 'event:click' },
      executedEdgeIds: ['judge'],
      visitedNodeIds: ['component:source', 'condition-1'],
      steps: [
        { kind: 'trigger', nodeId: 'component:source', depth: 0, text: 'Source' },
        {
          kind: 'condition',
          nodeId: 'condition-1',
          edgeId: 'judge',
          passed: false,
          depth: 1,
          text: 'Gate <b>',
        },
      ],
      failed: false,
    } as never;
    const problems = inspector(EMPTY_BLUEPRINT_CANVAS_SELECTION, 'problems', {
      diagnostics,
      trace,
    });
    expect(problems).toContain('rule &lt;script&gt; broken');
    expect(problems).not.toContain('rule <script> broken');
    const run = inspector(EMPTY_BLUEPRINT_CANVAS_SELECTION, 'trace', { diagnostics, trace });
    expect(run).toContain('data-blueprint-trace');
    expect(run).toContain('data-kind="condition" data-passed="false"');
    expect(run).toContain('Gate &lt;b&gt;');
    expect(run).toContain('data-blueprint-clear-trace');
  });

  it('renders node configuration groups with anchors, rename and upstream / downstream edges', () => {
    const html = inspector({ nodes: ['condition-1'], edges: [] }, 'configuration');
    expect(html).toContain('data-blueprint-node-config="condition-1"');
    expect(html).toContain('data-blueprint-node-field="name"');
    expect(html).toContain('data-blueprint-node-field="operator"');
    expect(html).toContain('data-blueprint-expression="left"');
    expect(html).toContain('data-blueprint-select-edge="judge"');
    expect(html).toContain('data-blueprint-select-edge="write"');
    expect(html).toContain('<code>judge</code>');
  });

  it('renders edge value editors from declared event fields and batch actions for multi-selection', () => {
    const edge = inspector({ nodes: [], edges: ['write'] }, 'configuration');
    expect(edge).toContain('data-blueprint-edge-config="write"');
    expect(edge).toContain('data-blueprint-expression="value"');
    expect(edge).toContain('data-expression-part="field"');
    expect(edge).toContain('value="row.id"');
    expect(edge).toContain('value="variable"');
    expect(edge).toContain('data-blueprint-delete');
    const multi = inspector(
      { nodes: ['condition-1', 'variable:selected'], edges: [] },
      'configuration',
    );
    expect(multi).toContain('data-blueprint-nodes-enabled="false"');
    expect(multi).toContain('data-blueprint-delete');
  });
});
