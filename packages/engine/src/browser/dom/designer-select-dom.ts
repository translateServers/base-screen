import { designerIcon } from '../ui/designer-icons.js';

/**
 * 自绘下拉（设计原型 .select）：触发器 + 自绘弹层，隐藏的原生 select 承担取值与事件。
 *
 * 迁移方式刻意做成「增强既有元素」而不是重写调用点：既有面板把原生 select 当值载体
 * （读 .value、听 change），本函数只在外层套上触发器与弹层并把原生 select 视觉收进 1px，
 * 因此所有既有取数与 change 流水线零改动，迁移只是 appendChild 换成 appendChild(增强结果)。
 * 键盘：触发器 ↑↓/Enter/Space 展开并移动、选项上 ↑↓ 移动、Enter 选中、Esc 关闭；
 * 弹层贴底自动向上翻转，域外点击关闭（监听自回收，重渲染不残留）。
 */
export interface DesignerSelectControlHandle {
  /** 挂进字段行的外壳。 */
  readonly element: HTMLDivElement;
  /** 原生 select（值载体，保持原契约）。 */
  readonly select: HTMLSelectElement;
  /** 原生 select 的选项被重建后调用：镜像选项、同步触发器与禁用态。 */
  refresh(): void;
}

const SELECT_POPOVER_GAP = 16;

export function enhanceDesignerSelect(select: HTMLSelectElement): DesignerSelectControlHandle {
  const ownerDocument = select.ownerDocument;
  const element = ownerDocument.createElement('div');
  element.className = 'designer-select-control';
  const trigger = ownerDocument.createElement('button');
  trigger.type = 'button';
  trigger.className = 'designer-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  // 原生 select 被视觉收进 1px，用户看到的是这个触发器：禁用状态必须一起传导，
  // 否则 `select.disabled = true` 只挡住了键盘/取值，指针仍能展开并选值。
  trigger.disabled = select.disabled;
  const label = select.getAttribute('aria-label');
  if (label !== null) trigger.setAttribute('aria-label', label);
  const value = ownerDocument.createElement('span');
  value.className = 'designer-select-value';
  const caret = ownerDocument.createElement('span');
  caret.className = 'designer-select-caret';
  caret.innerHTML = designerIcon('chevron-down');
  trigger.appendChild(value);
  trigger.appendChild(caret);
  const menu = ownerDocument.createElement('div');
  menu.className = 'designer-select-menu';
  menu.setAttribute('role', 'listbox');
  if (label !== null) menu.setAttribute('aria-label', label);
  menu.hidden = true;

  // 选项镜像自原生 select（DOM 替身可能不实现 options，取空表即可，值仍走原生元素）。
  let optionButtons: HTMLButtonElement[] = [];
  const mirrorOptions = (): void => {
    menu.replaceChildren();
    optionButtons = [];
    for (const option of Array.from(select.options ?? [])) {
      const button = ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'designer-select-option';
      button.setAttribute('role', 'option');
      button.dataset.value = option.value;
      button.disabled = option.disabled;
      const text = ownerDocument.createElement('span');
      text.textContent = option.textContent;
      const check = ownerDocument.createElement('span');
      check.className = 'designer-select-check';
      check.innerHTML = designerIcon('check');
      button.appendChild(text);
      button.appendChild(check);
      menu.appendChild(button);
      optionButtons.push(button);
    }
    optionButtons.forEach((button, index) => {
      button.addEventListener('click', () => choose(index));
    });
  };

  select.className =
    select.className === ''
      ? 'designer-select-native'
      : `${select.className} designer-select-native`;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const selectedIndex = (): number =>
    typeof select.selectedIndex === 'number' ? select.selectedIndex : -1;
  const sync = (): void => {
    const current = selectedIndex();
    const option = current >= 0 ? select.options[current] : undefined;
    value.textContent = option?.textContent ?? '';
    value.dataset.placeholder = String(option === undefined || option.value === '');
    optionButtons.forEach((button, index) => {
      button.setAttribute('aria-selected', String(index === current));
    });
  };
  const close = (refocus: boolean): void => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (refocus) trigger.focus({ preventScroll: true });
  };
  const open = (): void => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const rect = trigger.getBoundingClientRect();
    const ownerWindow = ownerDocument.defaultView;
    if (ownerWindow !== null) {
      menu.dataset.side =
        ownerWindow.innerHeight - rect.bottom < menu.offsetHeight + SELECT_POPOVER_GAP &&
        rect.top > menu.offsetHeight + SELECT_POPOVER_GAP
          ? 'top'
          : 'bottom';
    }
    const selected = optionButtons[selectedIndex()];
    (selected ?? optionButtons.find((button) => !button.disabled))?.focus({ preventScroll: true });
  };
  const choose = (index: number): void => {
    const option = optionButtons[index];
    if (option === undefined || option.disabled) return;
    if (selectedIndex() !== index) {
      select.selectedIndex = index;
      sync();
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
    close(true);
  };
  const nextEnabled = (from: number, direction: 1 | -1): number => {
    for (
      let index = from + direction;
      index >= 0 && index < optionButtons.length;
      index += direction
    ) {
      if (!optionButtons[index]!.disabled) return index;
    }
    return from;
  };
  const activeIndex = (): number => {
    const active = optionButtons.findIndex((button) => button.dataset.active === 'true');
    return active < 0 ? Math.max(selectedIndex(), 0) : active;
  };
  const setActive = (index: number): void => {
    optionButtons.forEach((button, position) => {
      button.dataset.active = String(position === index);
    });
    optionButtons[index]?.focus({ preventScroll: true });
  };

  trigger.addEventListener('click', () => {
    if (menu.hidden) open();
    else close(true);
  });
  // 展开态的箭头/Enter/Space/Esc 是弹层自己的键盘作用域：必须止住冒泡，否则会被引擎的
  // 全局画布快捷键（微移 / 选层）抢走，面板还会因选区变化整段重渲染。
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (menu.hidden) {
        open();
        return;
      }
      setActive(nextEnabled(activeIndex(), event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (menu.hidden) open();
      else choose(activeIndex());
      return;
    }
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });
  // shadow 树里 document.activeElement 只回宿主，活动元素必须从所在的根取
  // （ShadowRoot 与 Document 都有 activeElement；DOM 替身缺 getRootNode 时回退宿主文档）。
  const activeInTree = (): Element | null =>
    (element.getRootNode?.() as { readonly activeElement?: Element | null } | null)
      ?.activeElement ??
    ownerDocument.activeElement ??
    null;
  menu.addEventListener('keydown', (event) => {
    const index = optionButtons.findIndex((button) => button === activeInTree());
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setActive(nextEnabled(index < 0 ? activeIndex() : index, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault();
      event.stopPropagation();
      choose(index);
    }
  });
  const refresh = (): void => {
    close(false);
    mirrorOptions();
    trigger.disabled = select.disabled;
    sync();
  };
  const onDocumentPointerDown = (event: Event): void => {
    // 面板重渲染整段替换 DOM：顺带回收域外监听，避免每次重渲染留一份。
    if (!element.isConnected) {
      ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true);
      return;
    }
    if (menu.hidden) return;
    // shadow 树外的捕获阶段 target 会被重定向成宿主：走 composedPath 取真实节点。
    const target = event.composedPath()[0] ?? event.target;
    if (target instanceof Node && element.contains(target)) return;
    close(false);
  };
  ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true);

  element.appendChild(trigger);
  element.appendChild(menu);
  element.appendChild(select);
  mirrorOptions();
  sync();
  return { element, select, refresh };
}
