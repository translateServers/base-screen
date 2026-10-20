import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenDataCapability,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialDataBindingRole,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';
import { createBaseScreenRenderer } from '../../../src/renderer/renderer.js';

export class FakeMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  model: BaseScreenMaterialModel | undefined;

  addEventListener(): void {}
  remove(): void {}
  removeEventListener(): void {}
}

export class FakeRoot {
  readonly children: FakeMaterialElement[] = [];
  readonly style = {} as CSSStyleDeclaration;

  appendChild(element: FakeMaterialElement): FakeMaterialElement {
    this.children.push(element);
    return element;
  }
}

export function createCatalog(
  type = 'base.test',
  dataCapabilities: readonly BaseScreenDataCapability[] = ['host-resource'],
): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type,
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: {
      kind: 'object',
      properties: {
        flipX: { kind: 'boolean' },
        flipY: { kind: 'boolean' },
        opacity: { kind: 'number' },
      },
      required: [],
    },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities,
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

export function createDatasetCatalog(
  adapter: BaseScreenMaterialTabularDataAdapter,
  roles: readonly BaseScreenMaterialDataBindingRole[] = [
    { id: 'columns', minFields: 1, maxFields: 256, valueTypes: ['string', 'number'] },
  ],
): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.test',
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['host-resource'],
    dataBinding: { roles },
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
    tabularDataAdapter: adapter,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

export function createStaticDatasetCatalog(
  adapter: BaseScreenMaterialTabularDataAdapter,
): BaseScreenMaterialCatalog {
  const fields = [
    { id: 'name', label: 'Name', valueType: 'string' as const, nullable: false },
    { id: 'amount', label: 'Amount', valueType: 'number' as const, nullable: false },
  ];
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.test',
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    defaultData: { fields, rows: [{ name: 'A', amount: 2 }] },
    staticData: {
      kind: 'tabular',
      defaultBinding: { fields: { columns: ['name', 'amount'] } },
    },
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['static'],
    dataBinding: {
      roles: [
        {
          id: 'columns',
          minFields: 1,
          maxFields: 256,
          valueTypes: ['string', 'number'],
        },
      ],
    },
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
    tabularDataAdapter: adapter,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

export function createEventCatalog(): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.test',
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: ['valueClick'],
    dataCapabilities: [],
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: EventfulMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

export class ExplodingConstructorElement {
  constructor() {
    throw new Error('constructor boom');
  }
}

export const modelExplosionState = { enabled: false };

export class ExplodingModelMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  #model: BaseScreenMaterialModel | undefined;

  get model(): BaseScreenMaterialModel | undefined {
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    if (modelExplosionState.enabled) {
      throw new Error('model boom');
    }
    this.#model = value;
  }

  addEventListener(): void {}
  remove(): void {}
  removeEventListener(): void {}
}

export class EventfulMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  model: BaseScreenMaterialModel | undefined;
  readonly handlers: Record<string, ((event: unknown) => void) | undefined> = {};

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.handlers[type] = handler;
  }

  removeEventListener(type: string): void {
    this.handlers[type] = undefined;
  }

  remove(): void {}

  fire(detail: unknown): void {
    this.handlers['base-screen-material-event']?.({
      bubbles: true,
      composed: true,
      type: 'base-screen-material-event',
      detail,
      stopPropagation() {},
    });
  }
}

export class DisplayManagingMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;

  set model(_value: BaseScreenMaterialModel) {
    this.style.display = 'block';
  }

  addEventListener(): void {}
  remove(): void {}
  removeEventListener(): void {}
}

export function createImageCatalog(): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.image',
    tagName: 'base-screen-image',
    name: '图片',
    category: '基础',
    keywords: ['图片'],
    defaultSize: { width: 100, height: 40 },
    defaultProps: { source: '', alt: '' },
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: {
      kind: 'object',
      properties: { source: { kind: 'string' }, alt: { kind: 'string' } },
      required: ['source', 'alt'],
    },
    propertyPanel: [
      { prop: 'source', label: '图片来源', control: 'text' },
      { prop: 'alt', label: '替代文本', control: 'text' },
    ],
    events: [],
    dataCapabilities: [],
    designCapabilities: { resize: true, rotate: true, children: false },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

export function component(
  id: string,
  zIndex: number,
  parentId: string | null = null,
  dataSource: ScreenComponentNode['dataSource'] = null,
): ScreenComponentNode {
  return {
    id,
    type: 'base.test',
    name: id,
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

export function document(
  components: readonly ScreenComponentNode[],
  variables: ScreenDocument['variables'] = [],
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables,
    blueprint: { rules: [] },
  };
}

export function rendererWithRoot(): {
  root: FakeRoot;
  renderer: ReturnType<typeof createBaseScreenRenderer>;
} {
  const root = new FakeRoot();
  return {
    root,
    renderer: createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    }),
  };
}
