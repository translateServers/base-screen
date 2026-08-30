import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { renderDesignerBlueprintInspector } from '../../../../src/browser/dom/blueprint/designer-blueprint-inspector-dom.js';
import { renderDesignerBlueprintLibrary } from '../../../../src/browser/dom/blueprint/designer-blueprint-library-dom.js';
import { renderDesignerBlueprintWorkbenchChrome } from '../../../../src/browser/dom/blueprint/designer-blueprint-workbench-dom.js';

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
      id: 'edge:rule-1:trigger',
      source: 'component:source',
      target: 'component:source',
      sourceHandle: 'event:click',
      targetHandle: 'visibility:show',
      ruleId: 'rule-1',
      kind: 'trigger' as const,
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
  variables: [{ type: 'static', name: 'selected<script>', value: null }],
  blueprint: {
    rules: [
      {
        id: 'rule-1',
        trigger: { type: 'material-event', componentId: 'source', eventName: 'click' },
        actions: [],
      },
    ],
  },
};

describe('Designer Blueprint panel DOM', () => {
  it('reveals the Blueprint panels and restores the canvas heading on mode changes', () => {
    const layout = { dataset: {} };
    const library = { hidden: true };
    const inspector = { hidden: true };
    const leftTitle = { textContent: '物料', dataset: {} };
    const leftCount = {
      textContent: '4',
      dataset: {},
      attributes: new Map([['aria-label', '物料：4 项']]),
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
      rules: 2,
      actions: 3,
      problems: 0,
    });
    expect(library.hidden).toBe(false);
    expect(inspector.hidden).toBe(false);
    expect(leftTitle.textContent).toBe('蓝图节点库');
    expect(leftCount.textContent).toBe('7');
    expect(rightTitle.textContent).toBe('蓝图配置');

    renderDesignerBlueprintWorkbenchChrome(root, 'canvas', true, {
      nodes: 7,
      rules: 2,
      actions: 3,
      problems: 0,
    });
    expect(library.hidden).toBe(true);
    expect(inspector.hidden).toBe(true);
    expect(leftTitle.textContent).toBe('物料');
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
    expect(container.innerHTML).toContain('逻辑');
    expect(container.innerHTML).toContain('变量');
    expect(container.innerHTML).toContain('data-blueprint-insert="set-variable"');
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

  it('shows saved unconnected nodes as configurable canvas members', () => {
    const container = { innerHTML: '' } as HTMLElement;
    const node = {
      id: 'unconnected:condition:1',
      kind: 'condition' as const,
      x: 20,
      y: 30,
      condition: {
        left: { kind: 'event-payload' as const, path: [] },
        operator: 'exists' as const,
      },
      summary: { kind: 'condition' as const, primary: 'event.*', secondary: 'exists' },
      unconnected: true as const,
    };

    renderDesignerBlueprintInspector(
      container,
      document,
      { nodes: [...graph.nodes, node], edges: graph.edges },
      { kind: 'node', id: node.id },
      'configuration',
      [],
      null,
    );

    expect(container.innerHTML).toContain('待连接节点');
    expect(container.innerHTML).toContain('该节点已保存到当前文档');
    expect(container.innerHTML).toContain('data-blueprint-delete');
  });
});
