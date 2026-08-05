import type { ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentCommand } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { DesignerIntegrationController } from '../../../src/browser/controllers/designer-integration-controller.js';

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'button-1',
      type: 'base.button',
      name: '按钮',
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
  variables: [{ type: 'static', name: 'count', value: 0 }],
  blueprint: { rules: [] },
};

class FakeTarget {
  readonly dataset: Record<string, string>;

  constructor(
    dataset: Record<string, string>,
    readonly value?: string,
    readonly checked?: boolean,
    readonly tagName = 'INPUT',
  ) {
    this.dataset = dataset;
  }

  closest<T extends Element>(selector: string): T | null {
    const matches =
      (selector === '[data-action]' && this.dataset.action !== undefined) ||
      (selector === '[data-blueprint-remove-rule]' &&
        this.dataset.blueprintRemoveRule !== undefined) ||
      (selector === '[data-blueprint-move-rule]' && this.dataset.blueprintMoveRule !== undefined) ||
      (selector === '[data-blueprint-rule]' && this.dataset.blueprintRule !== undefined) ||
      (selector === '[data-blueprint-add-action]' &&
        this.dataset.blueprintAddAction !== undefined) ||
      (selector === '[data-blueprint-remove-action]' &&
        this.dataset.blueprintRemoveAction !== undefined) ||
      (selector === '[data-blueprint-graph-node]' &&
        this.dataset.blueprintGraphNode !== undefined) ||
      (selector === '[data-blueprint-graph-action]' &&
        this.dataset.blueprintGraphAction !== undefined);
    return (matches ? this : null) as T | null;
  }
}

function authority(...capabilities: string[]): BaseScreenRuntimeContributionIndex {
  const granted = new Set(capabilities);
  return {
    getResourceType: () => undefined,
    hasBlueprintCapability: (capability) => granted.has(capability),
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => ({ manifest: { events: ['click', 'change'] } }),
  } as unknown as BaseScreenMaterialCatalog;
}

function createController(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  initial = document,
) {
  let current = initial;
  const commands: unknown[] = [];
  const diagnostics: unknown[] = [];
  const controller = new DesignerIntegrationController({
    emitDiagnostics: (value) => diagnostics.push(value),
    executeCommand: (command) => {
      commands.push(command);
      const result = applyScreenDocumentCommand(current, command);
      if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
      current = result.document;
      return { ok: true, value: current, diagnostics: result.diagnostics };
    },
    getCatalog: catalog,
    getDocument: () => current,
    getInteraction: () => ({ selectedComponentIds: ['button-1'], focusedComponentId: 'button-1' }),
    getRuntimeContributions: () => runtimeContributions,
  });
  return {
    commands,
    controller,
    diagnostics,
    get document() {
      return current;
    },
  };
}

describe('DesignerIntegrationController', () => {
  it('R7 updates graph-only selection without writing a canonical command', () => {
    const state = createController(authority('blueprint.trigger.material-event'));

    const handled = state.controller.onClick(
      new FakeTarget({ blueprintGraphNode: 'rule-1:trigger' }) as unknown as Element,
    );

    expect(handled).toBe(true);
    expect(state.commands).toEqual([]);
    expect(state.document).toEqual(document);
  });

  it('R10 fails closed with a fixed Chinese diagnostic when no authority grants a material event', () => {
    const state = createController(undefined);

    state.controller.onClick(
      new FakeTarget({ action: 'blueprint-add-rule' }) as unknown as Element,
    );

    expect(state.commands).toEqual([]);
    expect(state.diagnostics).toEqual([
      [
        {
          severity: 'error',
          code: 'BLUEPRINT_CAPABILITY_UNAVAILABLE',
          path: [],
          message: '蓝图能力不可用，未保存修改。',
        },
      ],
    ]);
  });

  it('R10 commits each canonical authoring edit through one replace-blueprint command', () => {
    const state = createController(
      authority(
        'blueprint.trigger.material-event',
        'blueprint.condition.compare',
        'blueprint.action.set-variable',
        'blueprint.action.emit-host-event',
        'blueprint.value.event-payload',
      ),
    );

    state.controller.onClick(
      new FakeTarget({ action: 'blueprint-add-rule' }) as unknown as Element,
    );
    state.controller.onChange({
      target: new FakeTarget({ blueprintRule: 'rule-1', blueprintTriggerEvent: 'true' }, 'change'),
    } as unknown as Event);
    state.controller.onChange({
      target: new FakeTarget(
        { blueprintRule: 'rule-1', blueprintCondition: 'true' },
        undefined,
        true,
      ),
    } as unknown as Event);
    state.controller.onClick(
      new FakeTarget({
        blueprintRule: 'rule-1',
        blueprintAddAction: 'set-variable',
      }) as unknown as Element,
    );
    state.controller.onClick(
      new FakeTarget({
        blueprintRule: 'rule-1',
        blueprintAddAction: 'emit-host-event',
      }) as unknown as Element,
    );
    state.controller.onChange({
      target: new FakeTarget(
        {
          blueprintRule: 'rule-1',
          blueprintActionIndex: '1',
          blueprintExpression: 'action',
        },
        '{"kind":"event-payload","path":["id"]}',
      ),
    } as unknown as Event);

    expect(state.commands).toHaveLength(6);
    expect(
      state.commands.every((command) => (command as { type: string }).type === 'replace-blueprint'),
    ).toBe(true);
    expect(state.document.blueprint.rules[0]).toMatchObject({
      trigger: { type: 'material-event', componentId: 'button-1', eventName: 'change' },
      condition: {
        left: { kind: 'literal', value: true },
        operator: 'eq',
        right: { kind: 'literal', value: true },
      },
      actions: [
        { type: 'set-variable', variableName: 'count', value: { kind: 'literal', value: null } },
        {
          type: 'emit-host-event',
          eventName: 'host_event',
          payload: { kind: 'event-payload', path: ['id'] },
        },
      ],
      requiredCapabilities: [
        'blueprint.trigger.material-event',
        'blueprint.condition.compare',
        'blueprint.action.set-variable',
        'blueprint.action.emit-host-event',
        'blueprint.value.event-payload',
      ],
    });
  });

  it('R10 refuses a reorder after a required capability is revoked', () => {
    const state = createController(authority('blueprint.trigger.material-event'), {
      ...document,
      blueprint: {
        rules: [
          {
            id: 'rule-1',
            trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
            requiredCapabilities: ['blueprint.trigger.material-event'],
            actions: [],
          },
          {
            id: 'rule-2',
            trigger: { type: 'material-event', componentId: 'button-1', eventName: 'change' },
            requiredCapabilities: ['blueprint.action.emit-host-event'],
            actions: [],
          },
        ],
      },
    });

    state.controller.onClick(
      new FakeTarget({
        blueprintMoveRule: 'rule-2',
        blueprintMoveDirection: 'up',
      }) as unknown as Element,
    );

    expect(state.commands).toEqual([]);
    expect(state.diagnostics).toEqual([
      [
        {
          severity: 'error',
          code: 'BLUEPRINT_CAPABILITY_UNAVAILABLE',
          path: [],
          message: '蓝图能力不可用，未保存修改。',
        },
      ],
    ]);
  });

  it('R11 submits an expression with the keyboard without requiring a pointer path', () => {
    const state = createController(
      authority('blueprint.trigger.material-event', 'blueprint.action.set-variable'),
      {
        ...document,
        blueprint: {
          rules: [
            {
              id: 'rule-1',
              trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
              actions: [
                {
                  type: 'set-variable',
                  variableName: 'count',
                  value: { kind: 'literal', value: 0 },
                },
              ],
            },
          ],
        },
      },
    );
    const preventDefault = vi.fn();

    const handled = state.controller.onKeyDown({
      key: 'Enter',
      isComposing: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault,
      target: new FakeTarget(
        {
          blueprintRule: 'rule-1',
          blueprintActionIndex: '0',
          blueprintExpression: 'action',
        },
        '{"kind":"literal","value":2}',
      ),
    } as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(state.commands).toHaveLength(1);
    expect(state.document.blueprint.rules[0]?.actions[0]).toMatchObject({
      type: 'set-variable',
      value: { kind: 'literal', value: 2 },
    });
  });

  it('R7 simulates the selected event without writing a canonical command', () => {
    const state = createController(
      authority('blueprint.trigger.material-event', 'blueprint.action.set-variable'),
      {
        ...document,
        blueprint: {
          rules: [
            {
              id: 'rule-1',
              trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
              requiredCapabilities: [
                'blueprint.trigger.material-event',
                'blueprint.action.set-variable',
              ],
              actions: [
                {
                  type: 'set-variable',
                  variableName: 'count',
                  value: { kind: 'literal', value: 2 },
                },
              ],
            },
          ],
        },
      },
    );

    const handled = state.controller.onClick(
      new FakeTarget({ blueprintGraphAction: 'simulate' }) as unknown as Element,
    );

    expect(handled).toBe(true);
    expect(state.commands).toEqual([]);
    expect(state.diagnostics).toEqual([]);
  });

  it('R7 applies the minimal event template through the canonical authoring path', () => {
    const state = createController(authority('blueprint.trigger.material-event'));

    const handled = state.controller.onClick(
      new FakeTarget({ blueprintGraphAction: 'apply-template' }) as unknown as Element,
    );

    expect(handled).toBe(true);
    expect(state.commands).toHaveLength(1);
    expect(state.document.blueprint.rules).toMatchObject([
      {
        id: 'rule-1',
        trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
      },
    ]);
  });

  it('R7 filters graph nodes and navigates them with arrow keys without canonical writes', () => {
    const state = createController(authority('blueprint.trigger.material-event'), {
      ...document,
      blueprint: {
        rules: [
          {
            id: 'rule-1',
            trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
            requiredCapabilities: ['blueprint.trigger.material-event'],
            actions: [],
          },
        ],
      },
    });
    state.controller.onClick(new FakeTarget({ action: 'open-blueprint' }) as unknown as Element);
    state.controller.onChange({
      target: new FakeTarget({ blueprintGraphSearch: 'true' }, 'button-1.click'),
    } as unknown as Event);
    const preventDefault = vi.fn();

    const handled = state.controller.onKeyDown({
      key: 'ArrowDown',
      preventDefault,
    } as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(state.commands).toEqual([]);
  });

  it('R7 clears graph selection before closing the Blueprint workspace with Escape', () => {
    const state = createController(authority('blueprint.trigger.material-event'), {
      ...document,
      blueprint: {
        rules: [
          {
            id: 'rule-1',
            trigger: { type: 'material-event', componentId: 'button-1', eventName: 'click' },
            requiredCapabilities: ['blueprint.trigger.material-event'],
            actions: [],
          },
        ],
      },
    });
    const preventDefault = vi.fn();
    state.controller.onClick(new FakeTarget({ action: 'open-blueprint' }) as unknown as Element);
    state.controller.onClick(
      new FakeTarget({ blueprintGraphNode: 'rule-1:trigger' }) as unknown as Element,
    );

    expect(
      state.controller.onKeyDown({ key: 'Escape', preventDefault } as unknown as KeyboardEvent),
    ).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(state.commands).toEqual([]);

    expect(
      state.controller.onKeyDown({ key: 'Escape', preventDefault } as unknown as KeyboardEvent),
    ).toBe(true);
  });
});
