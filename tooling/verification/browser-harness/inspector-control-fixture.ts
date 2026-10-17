import type { BaseScreenPluginInspectorControlElement } from '../../../packages/plugin-core/src/index.ts';
import { createMaterialPackage } from '../../../packages/plugin-sdk/src/index.ts';

export const HARNESS_INSPECTOR_CONTROL_TAG_NAME = 'harness-select-tone';
/** 故意没有任何 inspectorControl 贡献声明它：用于验证未授权标签只会降级，不会被实例化。 */
export const HARNESS_UNAUTHORIZED_CONTROL_TAG_NAME = 'harness-never-authorized';
export const HARNESS_INSPECTOR_MATERIAL_TYPE = 'harness.inspector-demo';
export const HARNESS_INSPECTOR_MATERIAL_TAG_NAME = 'harness-inspector-demo';

const TONES = ['neutral', 'warning', 'critical'] as const;

/**
 * 自定义表单控件：与内建控件同一契约——宿主写 model，用户改值后派发 change，宿主读 value。
 * 它拿不到 Engine 的 Store 或事务，只能通过 value + change 影响文档。
 */
export class HarnessSelectToneElement
  extends HTMLElement
  implements BaseScreenPluginInspectorControlElement
{
  #value: string | undefined;
  #writes = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set model(model: { value?: unknown }) {
    const next = typeof model?.value === 'string' ? model.value : undefined;
    // 外部把文档改回同值时不重绘，避免同值写入引起抖动。
    if (next === this.#value) {
      this.#render();
      return;
    }
    this.#value = next;
    this.#render();
  }

  get model(): never {
    return undefined as never;
  }

  get value(): string | undefined {
    return this.#value;
  }

  get writes(): number {
    return this.#writes;
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    const shadow = this.shadowRoot;
    if (shadow === null) return;
    // 骨架是编译期字面量；来自文档的值一律走 textContent，不把文档内容当 markup 解析。
    shadow.innerHTML = `
      <style>
        :host { display: flex; gap: 4px; }
        button { padding: 2px 8px; font: inherit; background: #16202b; color: #e5eefb; border: 1px solid #2a3b50; border-radius: 3px; cursor: pointer; }
        button[aria-pressed="true"] { background: #1f6f4a; border-color: #1f6f4a; }
      </style>
      <span class="harness-tone-writes" data-tone-writes></span>
    `;
    const counter = shadow.querySelector<HTMLElement>('[data-tone-writes]');
    if (counter !== null) counter.textContent = String(this.#writes);
    for (const tone of TONES) {
      const button = this.ownerDocument.createElement('button');
      button.type = 'button';
      button.textContent = tone;
      button.dataset.toneChoice = tone;
      button.setAttribute('aria-pressed', String(this.#value === tone));
      button.addEventListener('click', () => this.#commit(tone));
      shadow.appendChild(button);
    }
  }

  #commit(tone: string): void {
    if (tone === this.#value) return;
    this.#value = tone;
    this.#writes += 1;
    // 与内建控件一致的提交时机：宿主在 change 上读 value 并走 props 事务。
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    this.#render();
  }
}

/** 未授权标签的探针元素：若它 ever 被实例化，E2E 就能观察到越权渲染。 */
export class HarnessUnauthorizedProbeElement extends HTMLElement {
  connectedCallback(): void {
    this.textContent = 'UNAUTHORIZED_CONTROL_RENDERED';
  }
}

const inspectorDemoManifest = {
  type: HARNESS_INSPECTOR_MATERIAL_TYPE,
  tagName: HARNESS_INSPECTOR_MATERIAL_TAG_NAME,
  name: '检查器控件样例',
  category: '验证',
  keywords: ['inspector', 'control'],
  defaultSize: { width: 240, height: 80 },
  defaultProps: { title: '检查器控件样例', tone: 'neutral', caption: '' },
  defaultStyle: {},
  propsSchema: {
    kind: 'object' as const,
    properties: {
      title: { kind: 'string' as const },
      tone: { kind: 'enum' as const, values: [...TONES] },
      caption: { kind: 'string' as const },
    },
    required: ['title'],
  },
  propertyPanel: [],
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  events: [],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
  // 只用于验证检查器控件；不进物料库，避免改动其它断言依赖的分组基线。
  libraryVisible: false,
  editorDescriptor: {
    appearance: [
      {
        id: 'content',
        label: '内容',
        fields: [
          { id: 'title', target: 'props', path: ['title'], label: '标题', control: 'text' },
          {
            id: 'tone',
            target: 'props',
            path: ['tone'],
            label: '语气',
            control: 'custom',
            tagName: HARNESS_INSPECTOR_CONTROL_TAG_NAME,
          },
          {
            id: 'caption',
            target: 'props',
            path: ['caption'],
            label: '副标题（未授权控件）',
            control: 'custom',
            tagName: HARNESS_UNAUTHORIZED_CONTROL_TAG_NAME,
          },
        ],
      },
    ],
  },
};

class HarnessInspectorDemoElement extends HTMLElement {
  static readonly manifest = inspectorDemoManifest;

  #model: { props?: Record<string, unknown> } | undefined;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set model(model: { props?: Record<string, unknown> }) {
    this.#model = model;
    const shadow = this.shadowRoot;
    if (shadow === null) return;
    const title = typeof model?.props?.title === 'string' ? model.props.title : '';
    // 只放编译期骨架，文档内容走 textContent。
    shadow.innerHTML = '<p data-demo-title></p>';
    const node = shadow.querySelector('[data-demo-title]');
    if (node !== null) node.textContent = title;
  }

  get model(): never {
    return this.#model as never;
  }

  connectedCallback(): void {
    if (this.#model === undefined) this.model = { props: {} };
  }
}

export const harnessInspectorDemoMaterialManifest = inspectorDemoManifest;

const packageResult = createMaterialPackage({
  id: 'harness.inspector-fixtures',
  materials: [
    { manifest: inspectorDemoManifest as never, element: HarnessInspectorDemoElement as never },
  ],
});

if (!packageResult.ok) {
  throw new Error(
    `Base Screen browser harness inspector fixture is invalid: ${JSON.stringify(packageResult.diagnostics)}`,
  );
}

export const harnessInspectorDemoMaterialPackage = packageResult.value;

/**
 * 只注册两个控件标签。物料包 define() 由宿主在 main.ts 里显式调用，与
 * hostedMaterialPackage / draftMaterialPackage 的用法保持一致。
 * 未授权探针同样注册：用来证明授权依据是 inspectorControl 贡献，而不是宿主注册过什么。
 */
export function defineHarnessInspectorFixtures(): void {
  if (customElements.get(HARNESS_INSPECTOR_CONTROL_TAG_NAME) === undefined) {
    customElements.define(HARNESS_INSPECTOR_CONTROL_TAG_NAME, HarnessSelectToneElement);
  }
  if (customElements.get(HARNESS_UNAUTHORIZED_CONTROL_TAG_NAME) === undefined) {
    customElements.define(HARNESS_UNAUTHORIZED_CONTROL_TAG_NAME, HarnessUnauthorizedProbeElement);
  }
}
