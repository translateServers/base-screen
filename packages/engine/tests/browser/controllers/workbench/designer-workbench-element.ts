/** Minimal DOM fixture with node identity, sibling ordering and observable writes. */
export class WorkbenchElement {
  readonly children: WorkbenchElement[] = [];
  parentElement: WorkbenchElement | null = null;
  replaceChildrenCalls = 0;
  writes = 0;
  readonly captures = new Set<number>();
  readonly attributes: Record<string, string> = {};
  readonly dataset = new Proxy({} as Record<string, string>, {
    set: (target, key, value: string) => {
      this.writes++;
      return Reflect.set(target, key, value);
    },
    deleteProperty: (target, key) => {
      this.writes++;
      return Reflect.deleteProperty(target, key);
    },
  });
  readonly style = createStyle(() => this.writes++);
  #className = '';
  #textContent = '';
  ariaPressed = '';
  ariaSelected = '';
  title = '';
  hidden = false;
  clientLeft = 0;
  getBoundingClientRect = () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 });

  get className(): string {
    return this.#className;
  }
  set className(value: string) {
    this.writes++;
    this.#className = value;
  }
  get textContent(): string {
    return this.#textContent;
  }
  set textContent(value: string) {
    this.writes++;
    this.#textContent = value;
  }
  get firstElementChild(): WorkbenchElement | null {
    return this.children[0] ?? null;
  }
  get nextElementSibling(): WorkbenchElement | null {
    const siblings = this.parentElement?.children;
    return siblings?.[siblings.indexOf(this) + 1] ?? null;
  }

  setPointerCapture(pointerId: number): void {
    this.captures.add(pointerId);
  }
  hasPointerCapture(pointerId: number): boolean {
    return this.captures.has(pointerId);
  }
  releasePointerCapture(pointerId: number): void {
    this.captures.delete(pointerId);
  }

  readonly classList = {
    add: (name: string) => {
      this.className = this.className === '' ? name : `${this.className} ${name}`;
    },
  };
  readonly ownerDocument = { createElement: () => new WorkbenchElement() };

  appendChild(child: WorkbenchElement): WorkbenchElement {
    return this.insertBefore(child, null);
  }
  insertBefore(child: WorkbenchElement, before: WorkbenchElement | null): WorkbenchElement {
    if (child === before) return child;
    if (before !== null && before.parentElement !== this) throw new Error('Unknown sibling');
    child.remove();
    const index = before === null ? this.children.length : this.children.indexOf(before);
    this.children.splice(index, 0, child);
    child.parentElement = this;
    this.writes++;
    return child;
  }
  remove(): void {
    const parent = this.parentElement;
    if (parent === null) return;
    parent.children.splice(parent.children.indexOf(this), 1);
    parent.writes++;
    this.parentElement = null;
  }
  replaceChildren(...children: WorkbenchElement[]): void {
    this.replaceChildrenCalls++;
    for (const child of [...this.children]) child.remove();
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name: string, value: string): void {
    this.writes++;
    this.attributes[name] = value;
    if (name === 'aria-pressed') this.ariaPressed = value;
  }
  removeAttribute(name: string): void {
    this.writes++;
    delete this.attributes[name];
  }
  closest<T extends Element>(selector: string): T | null {
    return (
      selector === '[data-canvas-guide]' && this.dataset.canvasGuide === 'true' ? this : null
    ) as T | null;
  }
}

function createStyle(onWrite: () => void): CSSStyleDeclaration {
  const values: Record<string, string> = {};
  let cssText = '';
  const methods = {
    getPropertyValue: (property: string) => values[property] ?? '',
    setProperty: (property: string, value: string) => {
      onWrite();
      values[property] = value;
    },
    removeProperty: (property: string) => {
      onWrite();
      const old = values[property] ?? '';
      delete values[property];
      return old;
    },
  };
  return new Proxy(methods, {
    get: (target, key) => {
      if (key === 'cssText') return cssText;
      if (key in target) return Reflect.get(target, key);
      return typeof key === 'string'
        ? (values[key] ?? (key.startsWith('--') ? undefined : ''))
        : undefined;
    },
    set: (_target, key, value: string) => {
      onWrite();
      if (key === 'cssText') {
        cssText = value;
        for (const property of Object.keys(values)) delete values[property];
        for (const declaration of value.split(';')) {
          const colon = declaration.indexOf(':');
          if (colon >= 0) {
            values[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
          }
        }
      } else if (typeof key === 'string') {
        values[key] = value;
      }
      return true;
    },
  }) as unknown as CSSStyleDeclaration;
}
