export class LoadingTestNode {
  readonly attributes: Record<string, string> = {};
  readonly children: LoadingTestNode[] = [];
  parentNode: LoadingTestNode | undefined;
  shadowRoot: LoadingTestNode | undefined;
  textContent = '';
  className = '';

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  get hidden(): boolean {
    return this.attributes.hidden !== undefined;
  }

  set hidden(value: boolean) {
    if (value) this.attributes.hidden = '';
    else delete this.attributes.hidden;
  }

  get inert(): boolean {
    return this.attributes.inert !== undefined;
  }

  set inert(value: boolean) {
    if (value) this.attributes.inert = '';
    else delete this.attributes.inert;
  }

  attachShadow(): LoadingTestNode {
    this.shadowRoot = new LoadingTestNode('#shadow-root');
    return this.shadowRoot;
  }

  append(...nodes: LoadingTestNode[]): void {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }

  remove(): void {
    const siblings = this.parentNode?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = undefined;
  }
}

export function documentFixture() {
  const nodes: LoadingTestNode[] = [];
  const document = {
    createElement(tagName: string) {
      const node = new LoadingTestNode(tagName);
      nodes.push(node);
      return node;
    },
  } as unknown as Document;
  return { document, nodes };
}
