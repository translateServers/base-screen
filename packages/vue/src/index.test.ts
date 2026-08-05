import { describe, expect, it } from 'vitest';
import { createVueMaterialDefinition } from './index.js';

const manifest = {
  type: 'acme.vue-label',
  tagName: 'acme-vue-label',
  name: 'Vue Label',
  category: 'Basic',
  keywords: ['vue'],
  defaultSize: { width: 100, height: 20 },
  defaultProps: { text: 'Label' },
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object' as const,
    properties: { text: { kind: 'string' as const } },
    required: ['text'],
  },
  propertyPanel: [{ prop: 'text', label: 'Text', control: 'text' as const }],
  events: ['valueClick'],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: true, children: false },
};

describe('Vue material bridge', () => {
  it('creates a valid Custom Element constructor without registration side effects', () => {
    const definition = createVueMaterialDefinition({
      manifest,
      component: { render: () => null },
      eventProps: { valueClick: 'onValueClick' },
    });

    expect(definition.ok).toBe(true);
    if (definition.ok) {
      expect(definition.value.manifest.type).toBe('acme.vue-label');
    }
    expect('customElements' in globalThis).toBe(false);
  });
});
