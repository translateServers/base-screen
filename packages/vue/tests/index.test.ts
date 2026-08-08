import { describe, expect, it } from 'vitest';
import { collectGlobalRules } from '../src/global-styles.js';
import { createVueMaterialDefinition } from '../src/index.js';

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

  it('collects all readable rules across sheets', () => {
    const rules = collectGlobalRules([
      {
        cssRules: [
          { cssText: 'x-vue-echarts{display:block}' },
          { cssText: '.unrelated{color:red}' },
          { cssText: 'x-vue-echarts > .echarts-host{width:100%}' },
        ],
      },
    ]);

    expect(rules).toEqual([
      'x-vue-echarts{display:block}',
      '.unrelated{color:red}',
      'x-vue-echarts > .echarts-host{width:100%}',
    ]);
  });

  it('recurse into grouping rules and deduplicate rules and sheets', () => {
    const media = {
      cssText: '@media (min-width: 0px){x-vue-echarts{display:block}}',
      cssRules: [{ cssText: 'x-vue-echarts{display:block}' }],
    };
    const sheet = { cssRules: [media, media] };
    const rules = collectGlobalRules([sheet, sheet]);

    expect(rules).toEqual([
      '@media (min-width: 0px){x-vue-echarts{display:block}}',
      'x-vue-echarts{display:block}',
    ]);
  });
});
