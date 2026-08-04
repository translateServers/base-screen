import { describe, expect, it } from 'vitest';
import { createReactMaterialDefinition } from './index.js';

const manifest = {
  type: 'acme.react-label',
  tagName: 'acme-react-label',
  name: 'React Label',
  category: 'Basic',
  keywords: ['react'],
  defaultSize: { width: 100, height: 20 },
  defaultProps: { text: 'Label' },
  defaultStyle: {},
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

describe('React material bridge', () => {
  it('creates a valid Custom Element constructor without registration side effects', () => {
    const definition = createReactMaterialDefinition({
      manifest,
      component: (_props: { text: string; onValueClick?: (payload: unknown) => void }) => null,
      eventProps: { valueClick: 'onValueClick' },
    });

    expect(definition.ok).toBe(true);
    if (definition.ok) {
      expect(definition.value.manifest.type).toBe('acme.react-label');
    }
    expect('customElements' in globalThis).toBe(false);
  });
});
