import { parseScreenDocument } from '../../../src/document/parse.js';

export function component(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    type: 'acme.kpi-card',
    name: 'KPI Card',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

export function document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    dataSources: [],
    variables: [],
    blueprint: { rules: [] },
    ...overrides,
  };
}

export const parse = parseScreenDocument;
