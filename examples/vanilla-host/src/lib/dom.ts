export interface ElementOptions {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: Readonly<Record<string, (event: Event) => void>>;
}

/** 最小 DOM 构建助手：无框架环境下保持视图代码声明式、可读。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class !== undefined) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const [type, handler] of Object.entries(options.on ?? {})) {
    node.addEventListener(type, handler);
  }
  for (const child of children) node.append(child);
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}
