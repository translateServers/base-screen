import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';

export class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  /** 最小 classList：只服务「读出当前类名 + 追加类名」，与 className 串保持一致。 */
  readonly classList = {
    add: (...tokens: string[]): void => {
      const current = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const token of tokens) current.add(token);
      this.className = [...current].join(' ');
    },
    contains: (token: string): boolean =>
      this.className.split(/\s+/).filter(Boolean).includes(token),
    remove: (...tokens: string[]): void => {
      const removing = new Set(tokens);
      this.className = this.className
        .split(/\s+/)
        .filter((token) => token !== '' && !removing.has(token))
        .join(' ');
    },
  };
  checked = false;
  disabled = false;
  focus: unknown = undefined;
  hidden = false;
  selected = false;
  title = '';
  textContent = '';
  className = '';
  type = '';
  value = '';
  ariaLabel: string | null = null;
  closestResult: FakeElement | null = null;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  closest<T extends Element>(selector: string): T | null {
    const dataSelector = /^(?:([a-z]+))?\[data-([a-z0-9-]+)(?:="[^"]*")?\]$/i.exec(selector);
    if (dataSelector !== null) {
      const tagName = dataSelector[1]?.toLowerCase();
      const key = dataSelector[2]!.replace(/-([a-z])/g, (_, letter: string) =>
        letter.toUpperCase(),
      );
      if (
        (tagName === undefined || this.tagName.toLowerCase() === tagName) &&
        this.dataset[key] !== undefined
      ) {
        return this as unknown as T;
      }
      const result = this.closestResult;
      if (
        result !== null &&
        (tagName === undefined || result.tagName.toLowerCase() === tagName) &&
        result.dataset[key] !== undefined
      ) {
        return result as unknown as T;
      }
      return null;
    }
    if (selector === '.designer') return this.closestResult as unknown as T;
    return null;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  /** `<select>` 的 option 集合：分段控件按它派生按钮，与浏览器一致。 */
  get options(): readonly FakeElement[] {
    return this.children.filter((child) => child.tagName.toLowerCase() === 'option');
  }

  addEventListener(): void {}

  querySelector<T extends Element>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T extends Element>(selector: string): T[] {
    const selectors = selector.split(',').map((part) => part.trim());
    return descendants(this).filter((child) =>
      selectors.some((part) => matchesSelector(child, part)),
    ) as unknown as T[];
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes[name] !== undefined;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    this.textContent = '';
  }
}

export class FakeDocument {
  readonly listeners = new Map<string, Set<EventListener>>();

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }
}

export class FakeInput {
  readonly dataset: Record<string, string>;
  ariaInvalid = '';
  parentElement: null = null;

  constructor(
    property: string,
    readonly value: string,
    datasetKey = 'property',
  ) {
    this.dataset = { [datasetKey]: property };
  }

  closest(): null {
    return null;
  }
}

export function document(
  dataSource: ScreenDocument['components'][number]['dataSource'] = null,
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'label-1',
        type: 'base.label',
        name: 'Label',
        parentId: null,
        position: { x: 10, y: 20 },
        size: { width: 100, height: 40 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: { title: 'Status' },
        style: { color: '#ffffff' },
        dataSource,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

export function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () =>
      ({
        manifest: {
          dataCapabilities: ['static', 'host-resource'],
          propertyPanel: [{ prop: 'title', label: 'Title', control: 'text' }],
          propsSchema: {
            kind: 'object',
            properties: { title: { kind: 'string' } },
            required: ['title'],
          },
          stylePanel: [{ style: 'color', label: 'Color', control: 'color', allowGradient: true }],
          styleSchema: {
            kind: 'object',
            properties: { color: { kind: 'string' } },
            required: ['color'],
          },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

export function groupCatalog(): BaseScreenMaterialCatalog {
  return {
    get: (type: string) =>
      ({
        manifest: {
          type,
          designCapabilities: {
            resize: true,
            rotate: true,
            children: type === 'base.group',
          },
          dataCapabilities: [],
          propertyPanel: [],
          propsSchema: { kind: 'object', properties: {}, required: [] },
          stylePanel: [],
          styleSchema: { kind: 'object', properties: {}, required: [] },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

export function imageCatalog(): BaseScreenMaterialCatalog {
  return {
    get: () =>
      ({
        manifest: {
          dataCapabilities: [],
          propertyPanel: [
            { prop: 'source', label: '图片来源', control: 'text' },
            { prop: 'alt', label: '替代文本', control: 'text' },
          ],
          propsSchema: {
            kind: 'object',
            properties: { source: { kind: 'string' }, alt: { kind: 'string' } },
            required: ['source', 'alt'],
          },
          stylePanel: [],
          styleSchema: { kind: 'object', properties: {}, required: [] },
        },
      }) as unknown,
  } as unknown as BaseScreenMaterialCatalog;
}

export function resourceAuthority(): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'asset'
        ? {
            kind: 'dataResourceType',
            id: 'asset',
            name: '资源',
            configSchema: { kind: 'object', properties: {}, required: [] },
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

/** 支持枚举的宿主索引形态（与 plugin-manager 快照一致），用于钉住资源类型选择器渲染。 */
export function enumerableResourceAuthority(): BaseScreenRuntimeContributionIndex {
  const resourceType = {
    kind: 'dataResourceType',
    id: 'asset',
    name: '资源',
    configSchema: { kind: 'object', properties: {}, required: [] },
  } as const;
  return {
    getResourceType: (candidate) => (candidate === resourceType.id ? resourceType : undefined),
    hasBlueprintCapability: () => false,
    listResourceTypes: () => [resourceType],
  };
}

export function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  const dataSelector = /^\[data-([a-z0-9-]+)(?:="([^"]*)")?\](:checked)?$/i.exec(selector);
  if (dataSelector !== null) {
    const key = dataSelector[1]!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = element.dataset[key];
    if (value === undefined || (dataSelector[2] !== undefined && value !== dataSelector[2])) {
      return false;
    }
    return dataSelector[3] !== ':checked' || element.checked;
  }
  if (selector.startsWith('.')) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}
