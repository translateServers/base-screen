import type {
  ScreenCanvas,
  ScreenComponentNode,
  ScreenDocument,
  ScreenStaticVariable,
} from '@base-screen/contracts';

export const DEFAULT_CANVAS: ScreenCanvas = {
  width: 1920,
  height: 1080,
  backgroundColor: '#000000',
};

export function makeComponent(
  overrides: Partial<ScreenComponentNode> & { id?: string } = {},
): ScreenComponentNode {
  const id = overrides.id ?? 'c1';
  return {
    id,
    type: 'acme.kpi-card/v1',
    name: `Component ${id}`,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

export function makeVariable(
  overrides: Partial<ScreenStaticVariable> & { name?: string } = {},
): ScreenStaticVariable {
  return {
    type: 'static',
    name: overrides.name ?? 'var1',
    value: overrides.value ?? null,
    ...overrides,
  };
}

export function makeDocument(overrides: Partial<ScreenDocument> = {}): ScreenDocument {
  return {
    canvas: DEFAULT_CANVAS,
    components: [],
    variables: [],
    blueprint: { apiVersion: 1, rules: [] },
    ...overrides,
  };
}

/**
 * Build a chain of `depth` ancestors where each component parents the next.
 * The first component is a root (parentId: null). Returns components in
 * document order (root first, deepest descendant last).
 */
export function makeAncestorChain(
  depth: number,
  options: { locked?: boolean; hidden?: boolean } = {},
): ScreenComponentNode[] {
  const components: ScreenComponentNode[] = [];
  for (let index = 0; index <= depth; index++) {
    const id = `chain-${index}`;
    components.push(
      makeComponent({
        id,
        name: `Chain ${index}`,
        parentId: index === 0 ? null : `chain-${index - 1}`,
        zIndex: index,
        status: {
          locked: options.locked ?? false,
          hidden: options.hidden ?? false,
        },
      }),
    );
  }
  return components;
}
