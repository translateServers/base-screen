import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { renderDesignerBlueprintInspector } from '../../../../src/browser/dom/blueprint/designer-blueprint-inspector-dom.js';
import { renderDesignerBlueprintLibrary } from '../../../../src/browser/dom/blueprint/designer-blueprint-library-dom.js';
import { renderDesignerBlueprintWorkbenchChrome } from '../../../../src/browser/dom/blueprint/designer-blueprint-workbench-dom.js';

const relationship = {
  type: 'behavior' as const,
  id: 'relation-1',
  source: {
    kind: 'component' as const,
    componentId: 'source',
    event: { type: 'material-event' as const, eventName: 'click' },
  },
  target: { kind: 'component' as const, componentId: 'source' },
  effect: { type: 'component-visibility' as const, operation: 'show' as const },
};

const graph = {
  nodes: [
    {
      id: 'component:source',
      kind: 'component' as const,
      x: 0,
      y: 0,
      componentId: 'source',
      componentName: 'Source',
      materialType: 'base.button',
      events: [{ name: 'click', label: 'Click', available: true }],
    },
  ],
  edges: [
    {
      id: 'relation:relation-1',
      source: 'component:source',
      target: 'component:source',
      sourceHandle: 'event:click',
      targetHandle: 'relation:in',
      relationId: 'relation-1',
      relationKind: 'behavior' as const,
      kind: 'relation' as const,
      effectType: 'component-visibility' as const,
      eventName: 'click',
      operation: 'show' as const,
      deletable: true,
    },
  ],
};
const componentLibrary = graph.nodes;

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
    { type: 'static', id: 'selected<script>', name: 'selected<script>', initialValue: null },
  ],
  blueprint: { relations: [relationship] },
};

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

  it('renders component, logic and variable navigation with bounded actions', () => {
    const container = { innerHTML: '' } as HTMLElement;

    renderDesignerBlueprintLibrary(
      container,
      document,
      graph,
      componentLibrary,
      { kind: 'edge', id: 'edge:rule-1:trigger' },
      '',
      'variables',
      undefined,
    );

    expect(container.innerHTML).toContain('组件');
    expect(container.innerHTML).toContain('关系');
    expect(container.innerHTML).toContain('变量');
    expect(container.innerHTML).toContain('data-blueprint-add-variable="selected&lt;script&gt;"');
    expect(container.innerHTML).toContain('data-blueprint-drag-kind="variable"');
    expect(container.innerHTML).toContain('selected&lt;script&gt;');
    expect(container.innerHTML).not.toContain('selected<script>');
  });

  it('projects Blueprint-enabled host groups into the shared rail without duplicating slots', () => {
    const container = { innerHTML: '' } as HTMLElement;

    renderDesignerBlueprintLibrary(
      container,
      document,
      graph,
      componentLibrary,
      null,
      '',
      'host:automation',
      [
        { id: 'assets', label: 'Canvas assets' },
        {
          id: 'automation',
          label: 'Automation <tools>',
          icon: 'sparkle',
          workbenchModes: ['blueprint'],
        },
      ],
    );

    expect(container.innerHTML).toContain('data-blueprint-library-tab="host:automation"');
    expect(container.innerHTML).toContain('data-host-left-panel-mode="blueprint"');
    expect(container.innerHTML).toContain('aria-controls="designer-host-automation-panel"');
    expect(container.innerHTML).toContain('class="rail-view blueprint-library-main" hidden');
    expect(container.innerHTML).toContain('Automation &lt;tools&gt;');
    expect(container.innerHTML).not.toContain('host:assets');
    expect(container.innerHTML).not.toContain('<slot');
  });

  it('renders problems and the latest simulation trace in dedicated inspector tabs', () => {
    const container = { innerHTML: '' } as HTMLElement;
    const diagnostics = [
      {
        severity: 'error' as const,
        code: 'BLUEPRINT_CONDITION_INVALID' as const,
        path: [],
        message: '规则 <script> 无效',
      },
    ];
    const trace = {
      executedEdgeIds: ['edge:rule-1:action:0'],
      failedRuleIds: [],
      lines: ['rule-1 · 条件无 · 执行 1 个动作'],
    };

    renderDesignerBlueprintInspector(
      container,
      document,
      graph,
      null,
      'problems',
      diagnostics,
      trace,
    );
    expect(container.innerHTML).toContain('校验问题');
    expect(container.innerHTML).toContain('规则 &lt;script&gt; 无效');
    expect(container.innerHTML).not.toContain('规则 <script> 无效');

    renderDesignerBlueprintInspector(container, document, graph, null, 'trace', diagnostics, trace);
    expect(container.innerHTML).toContain('运行轨迹');
    expect(container.innerHTML).toContain('1 条连线执行');
    expect(container.innerHTML).toContain('rule-1 · 条件无 · 执行 1 个动作');
  });

  it('renders component structure and relation lists', () => {
    const container = { innerHTML: '' } as HTMLElement;

    renderDesignerBlueprintInspector(
      container,
      document,
      graph,
      { kind: 'node', id: 'component:source' },
      'configuration',
      [],
      null,
    );

    expect(container.innerHTML).toContain('结构');
    expect(container.innerHTML).toContain('data-blueprint-select-relation');
    expect(container.innerHTML).toContain('data-blueprint-delete');
  });

  it('renders keyboard-native set-variable source controls from declared event fields', () => {
    const container = { innerHTML: '' } as HTMLElement;
    const setVariableRelation = {
      type: 'behavior' as const,
      id: 'relation-2',
      source: relationship.source,
      target: { kind: 'variable' as const, variableId: 'selected' },
      effect: {
        type: 'set-variable' as const,
        value: { kind: 'event-payload' as const, path: ['row', 'id'] },
      },
    };
    const configuredDocument: ScreenDocument = {
      ...document,
      variables: [
        { type: 'static', id: 'selected', name: 'selected', initialValue: null },
        { type: 'static', id: 'fallback', name: 'fallback', initialValue: 1 },
      ],
      blueprint: { relations: [setVariableRelation] },
    };
    const configuredGraph = {
      nodes: [
        ...graph.nodes,
        {
          id: 'variable:selected',
          kind: 'variable' as const,
          x: 300,
          y: 0,
          variableId: 'selected',
          variableName: 'selected',
          variableType: 'static' as const,
          variableInitialValue: null,
          events: [],
        },
      ],
      edges: [
        {
          id: 'relation:relation-2',
          source: 'component:source',
          target: 'variable:selected',
          sourceHandle: 'event:click',
          targetHandle: 'relation:in',
          relationId: 'relation-2',
          relationKind: 'behavior' as const,
          kind: 'relation' as const,
          effectType: 'set-variable' as const,
          eventName: 'click',
          variableId: 'selected',
          deletable: true,
        },
      ],
    };
    const catalog = {
      get: () => ({
        manifest: {
          editorDescriptor: {
            events: [
              {
                name: 'click',
                payloadSchema: {
                  kind: 'object',
                  properties: {
                    row: {
                      kind: 'object',
                      properties: { id: { kind: 'string' } },
                      required: [],
                    },
                  },
                  required: [],
                },
              },
            ],
          },
        },
      }),
    } as never;

    renderDesignerBlueprintInspector(
      container,
      configuredDocument,
      configuredGraph,
      { kind: 'edge', id: 'relation:relation-2' },
      'configuration',
      [],
      null,
      catalog,
    );

    expect(container.innerHTML).toContain('data-blueprint-action-value-source');
    expect(container.innerHTML).toContain('data-blueprint-action-event-path');
    expect(container.innerHTML).toContain('row.id');
    expect(container.innerHTML).toContain('value="variable"');
    expect(container.innerHTML).toContain('<select');
  });
});
