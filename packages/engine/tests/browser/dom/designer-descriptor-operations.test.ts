import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createDescriptorArrayTransaction,
  createDescriptorFieldTransaction,
} from '../../../src/browser/dom/designer-descriptor-operations.js';

const propsSchema = {
  kind: 'object' as const,
  properties: {
    title: {
      kind: 'object' as const,
      properties: {
        show: { kind: 'boolean' as const },
        text: { kind: 'string' as const, maxLength: 64 },
      },
      required: [],
    },
    series: {
      kind: 'array' as const,
      items: {
        kind: 'object' as const,
        properties: {
          name: { kind: 'string' as const },
          type: { kind: 'enum' as const, values: ['line', 'bar'] },
          yAxisIndex: { kind: 'enum' as const, values: [0, 1] },
          color: { kind: 'string' as const },
        },
        required: [],
      },
      maxItems: 4,
    },
  },
  required: [],
};

const styleSchema = {
  kind: 'object' as const,
  properties: { color: { kind: 'string' as const } },
  required: [],
};

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'chart-1',
      type: 'base.echarts',
      name: '图表',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {
        title: { show: true, text: '标题' },
        series: [
          { name: 'a', type: 'line', yAxisIndex: 0, color: '#fff' },
          { name: 'b', type: 'bar', yAxisIndex: 1, color: '#000' },
        ],
      },
      style: { color: '#000000' },
      dataSource: {
        type: 'host-resource',
        resourceType: 'dataset',
        resourceId: 'r1',
        params: { limit: { kind: 'literal', value: 10 } },
        binding: { fields: { dimension: ['region'] } },
      },
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};

const interaction = { selectedComponentIds: ['chart-1'], focusedComponentId: 'chart-1' };

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => ({
      manifest: {
        propsSchema,
        styleSchema,
        dataBinding: { roles: [{ id: 'dimension' }] },
      },
    }),
  } as unknown as BaseScreenMaterialCatalog;
}

class FakeControl {
  readonly dataset: Record<string, string> = {};
  value = '';
  checked = false;
  type = 'text';

  constructor(dataset: Record<string, string>, value = '', checked = false, type = 'text') {
    this.dataset = dataset;
    this.value = value;
    this.checked = checked;
    this.type = type;
  }
}

describe('AE-ED-C03 descriptor transactions write canonical paths', () => {
  it('writes a nested object path through props validation', () => {
    const control = new FakeControl(
      {
        descriptorFieldId: 'titleText',
        descriptorTarget: 'props',
        descriptorPath: JSON.stringify(['title', 'text']),
        descriptorControl: 'text',
      },
      '新标题',
    );
    const result = createDescriptorFieldTransaction(
      control as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const command = result.value.commands[0];
    expect(command?.type).toBe('update-components');
    if (command?.type === 'update-components') {
      expect((command.patch.props as { title: { text: string } }).title.text).toBe('新标题');
    }
  });

  it('preserves numeric enum values inside repeatable array items', () => {
    const control = new FakeControl(
      {
        descriptorFieldId: 'seriesYAxis',
        descriptorTarget: 'props',
        descriptorPath: JSON.stringify(['series', 0, 'yAxisIndex']),
        descriptorControl: 'select',
      },
      '1',
    );
    const result = createDescriptorFieldTransaction(
      control as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );

    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const command = result.value.commands[0];
    if (command?.type === 'update-components') {
      const series = (command.patch.props as { series: Array<{ yAxisIndex: number }> }).series;
      expect(series[0]?.yAxisIndex).toBe(1);
      expect(typeof series[0]?.yAxisIndex).toBe('number');
    }
  });

  it('writes style and boolean fields with schema validation', () => {
    const booleanControl = new FakeControl(
      {
        descriptorFieldId: 'titleShow',
        descriptorTarget: 'props',
        descriptorPath: JSON.stringify(['title', 'show']),
        descriptorControl: 'boolean',
      },
      '',
      false,
    );
    const booleanResult = createDescriptorFieldTransaction(
      booleanControl as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(booleanResult?.ok).toBe(true);

    const styleControl = new FakeControl(
      {
        descriptorFieldId: 'color',
        descriptorTarget: 'style',
        descriptorPath: JSON.stringify(['color']),
        descriptorControl: 'color',
      },
      '#ff0000',
    );
    const styleResult = createDescriptorFieldTransaction(
      styleControl as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(styleResult?.ok).toBe(true);
    if (!styleResult?.ok) return;
    const styleCommand = styleResult.value.commands[0];
    expect(styleCommand?.type).toBe('update-components');
    if (styleCommand?.type === 'update-components') {
      expect(styleCommand.patch.style).toEqual({ color: '#ff0000' });
      expect(styleCommand.patch.props).toBeUndefined();
    }
  });

  it('rejects values that violate the schema fail closed', () => {
    const control = new FakeControl(
      {
        descriptorFieldId: 'titleText',
        descriptorTarget: 'props',
        descriptorPath: JSON.stringify(['title', 'text']),
        descriptorControl: 'text',
      },
      'x'.repeat(100),
    );
    const result = createDescriptorFieldTransaction(
      control as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(result?.ok).toBe(false);
  });

  it('writes data params and binding fields without a second state source', () => {
    const paramsControl = new FakeControl(
      {
        descriptorFieldId: 'limit',
        descriptorTarget: 'data',
        descriptorPath: JSON.stringify(['params', 'limit']),
        descriptorControl: 'number',
      },
      '25',
      false,
      'number',
    );
    const paramsResult = createDescriptorFieldTransaction(
      paramsControl as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(paramsResult?.ok).toBe(true);
    if (!paramsResult?.ok) return;
    const command = paramsResult.value.commands[0];
    if (command?.type === 'update-components') {
      const source = command.patch.dataSource as ScreenComponentNode['dataSource'];
      expect(source?.type).toBe('host-resource');
      if (source?.type === 'host-resource') {
        expect(source.params.limit).toEqual({ kind: 'literal', value: 25 });
      }
    }

    const bindingControl = new FakeControl(
      {
        descriptorFieldId: 'dimensionField',
        descriptorTarget: 'data',
        descriptorPath: JSON.stringify(['binding', 'fields', 'dimension', 0]),
        descriptorControl: 'field-selector',
      },
      'amount',
    );
    const bindingResult = createDescriptorFieldTransaction(
      bindingControl as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(bindingResult?.ok).toBe(true);
    if (!bindingResult?.ok) return;
    const bindingCommand = bindingResult.value.commands[0];
    if (bindingCommand?.type === 'update-components') {
      const source = bindingCommand.patch.dataSource as ScreenComponentNode['dataSource'];
      expect(source?.type).toBe('host-resource');
      if (source?.type === 'host-resource') {
        expect(source.binding).not.toBeNull();
        if (source.binding !== null) {
          expect(source.binding.fields.dimension).toEqual(['amount']);
          expect(source.binding.fields).not.toHaveProperty('fields');
        }
      }
    }
  });
});

describe('AE-ED-C03 array transactions', () => {
  it('adds, removes and reorders repeatable array items with schema limits', () => {
    const add = createDescriptorArrayTransaction(
      {
        dataset: {
          descriptorArrayPath: JSON.stringify(['series']),
          descriptorArrayAction: 'add',
          descriptorArrayIndex: '1',
        },
      } as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(add?.ok).toBe(true);

    const remove = createDescriptorArrayTransaction(
      {
        dataset: {
          descriptorArrayPath: JSON.stringify(['series']),
          descriptorArrayAction: 'remove',
          descriptorArrayIndex: '0',
        },
      } as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(remove?.ok).toBe(true);
    if (!remove?.ok) return;
    const command = remove.value.commands[0];
    if (command?.type === 'update-components') {
      expect((command.patch.props as { series: unknown[] }).series).toHaveLength(1);
    }

    const moveUp = createDescriptorArrayTransaction(
      {
        dataset: {
          descriptorArrayPath: JSON.stringify(['series']),
          descriptorArrayAction: 'move-down',
          descriptorArrayIndex: '0',
        },
      } as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(moveUp?.ok).toBe(true);
  });

  it('rejects unknown array actions and out-of-range writes', () => {
    const unknown = createDescriptorArrayTransaction(
      {
        dataset: {
          descriptorArrayPath: JSON.stringify(['series']),
          descriptorArrayAction: 'explode',
          descriptorArrayIndex: '0',
        },
      } as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(unknown).toBeUndefined();

    const outOfRange = createDescriptorArrayTransaction(
      {
        dataset: {
          descriptorArrayPath: JSON.stringify(['series']),
          descriptorArrayAction: 'remove',
          descriptorArrayIndex: '99',
        },
      } as unknown as EventTarget,
      document,
      interaction,
      catalog(),
    );
    expect(outOfRange?.ok).toBe(false);
  });
});
