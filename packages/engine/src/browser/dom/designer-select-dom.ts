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
  /** 自绘触发器；调用方可在其上挂 size/density 等视觉钩子。 */
  readonly trigger: HTMLButtonElement;
  /** 原生 select 的选项被重建后调用：镜像选项、同步触发器与禁用态。 */
  refresh(): void;
}

/** 弹层与触发器的间距，与 `.designer-select-menu` 的 4px 偏移一致。 */
const SELECT_POPOVER_GAP = 4;
/** 弹层与视口边缘的安全距离。 */
const SELECT_POPOVER_MARGIN = 8;
/** 选项很多时的高度上限：超出后在弹层内部滚动，不把所在面板顶穿。 */
const SELECT_POPOVER_MAX_HEIGHT = 320;
const SELECT_POPOVER_MIN_HEIGHT = 96;

interface AnchorRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function enhanceDesignerSelect(select: HTMLSelectElement): DesignerSelectControlHandle {
  const ownerDocument = select.ownerDocument;
  const element = ownerDocument.createElement('div');
  element.className = 'designer-select-control';
  const trigger = ownerDocument.createElement('button');
  trigger.type = 'button';
  trigger.className = 'designer-select-trigger';
  if (select.dataset.size !== undefined) trigger.dataset.size = select.dataset.size;
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
  // 引擎浮层归属标记：画布在祖先节点监听 wheel 做平移/缩放，overscroll-behavior 只约束
  // 原生滚动链、不阻断 JS 冒泡；弹层内的滚轮必须在归属节点截断，否则会驱动下面的画布。
  // 普通滚轮不 preventDefault，保留弹层自身滚动；ctrl/meta 滚轮等价浏览器缩放，直接阻断。
  menu.dataset.designerOverlay = 'select-menu';
  menu.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
      event.stopPropagation();
    },
    { passive: false },
  );

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
  let anchorFrame: number | undefined;
  let anchor: AnchorRect | undefined;
  const stopTracking = (): void => {
    if (anchorFrame !== undefined) {
      ownerDocument.defaultView?.cancelAnimationFrame?.(anchorFrame);
      anchorFrame = undefined;
    }
    anchor = undefined;
  };
  const close = (refocus: boolean): void => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    stopTracking();
    if (refocus) trigger.focus({ preventScroll: true });
  };
  // 触发器常位于带 overflow 裁切、固定高度的面板/浮层里：绝对定位的弹层会被截成一条
  // （蓝图模拟区一屏只露出最后一枚选项）。改为跟随视口定位，并把高度按可用空间夹紧、
  // 超出部分在弹层内滚动；左边缘与宽度始终照抄触发器，展开/收起不改变触发器几何。
  const placeMenu = (): void => {
    const view: Window | null | undefined = ownerDocument.defaultView;
    const viewportHeight = view?.innerHeight ?? 0;
    if (viewportHeight <= 0) return;
    const rect = trigger.getBoundingClientRect();
    const naturalHeight = Math.max(menu.scrollHeight, menu.offsetHeight);
    const spaceBelow = viewportHeight - SELECT_POPOVER_MARGIN - rect.bottom - SELECT_POPOVER_GAP;
    const spaceAbove = rect.top - SELECT_POPOVER_MARGIN - SELECT_POPOVER_GAP;
    const requiredHeight = Math.min(naturalHeight, SELECT_POPOVER_MAX_HEIGHT);
    const placeAbove = spaceBelow < requiredHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.min(
      SELECT_POPOVER_MAX_HEIGHT,
      Math.max(SELECT_POPOVER_MIN_HEIGHT, placeAbove ? spaceAbove : spaceBelow),
    );
    menu.dataset.floating = 'true';
    menu.dataset.side = placeAbove ? 'top' : 'bottom';
    // 定位属于几何计算的一部分：显式写死 fixed 与 bottom:auto，避免样式层加载顺序/缓存
    // 让弹层退回 absolute 后，视口坐标被叠加到字段自身坐标上而整体偏移。
    menu.style.position = 'fixed';
    menu.style.bottom = 'auto';
    menu.style.width = `${rect.width}px`;
    // 只做左对齐：横向夹紧会让弹层与触发器错位，宽度相同意味着触发器可见时弹层也可见。
    menu.style.left = `${rect.left}px`;
    // 高度取整向下，保证夹紧后的弹层不会超出可用空间一个像素；翻转的 top 用同一个取整值，
    // 才能保证与触发器的 4px 间距不因小数差而漂移。
    const clampedHeight = Math.floor(maxHeight);
    menu.style.maxHeight = `${clampedHeight}px`;
    const height = Math.min(naturalHeight, clampedHeight);
    const top = placeAbove
      ? Math.max(SELECT_POPOVER_MARGIN, rect.top - SELECT_POPOVER_GAP - height)
      : rect.bottom + SELECT_POPOVER_GAP;
    menu.style.top = `${top}px`;
  };
  // 固定定位会把弹层锚定在视口：面板滚动、容器展开/位移或 resize 都不会带着它走。
  // 每帧只读一次触发器几何，变化时才重算坐标，保持“跟随触发器”的既有语义。
  const readAnchor = (rect: DOMRect): AnchorRect => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });
  const trackAnchor = (): void => {
    anchorFrame = undefined;
    if (menu.hidden || !element.isConnected) return;
    const rect = trigger.getBoundingClientRect();
    const previous = anchor;
    if (
      previous === undefined ||
      previous.left !== rect.left ||
      previous.top !== rect.top ||
      previous.width !== rect.width ||
      previous.height !== rect.height
    ) {
      anchor = readAnchor(rect);
      placeMenu();
    }
    anchorFrame = ownerDocument.defaultView?.requestAnimationFrame?.(trackAnchor);
  };
  const startTracking = (): void => {
    stopTracking();
    anchor = readAnchor(trigger.getBoundingClientRect());
    anchorFrame = ownerDocument.defaultView?.requestAnimationFrame?.(trackAnchor);
  };
  // 弹层可滚动后，选中项可能落在可视区外：展开时把它带回视野，避免“打开却看不到当前值”。
  const revealOption = (option: HTMLButtonElement): void => {
    menu.scrollTop = Math.max(0, option.offsetTop - (menu.clientHeight - option.offsetHeight) / 2);
  };
  const open = (): void => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    placeMenu();
    startTracking();
    const selected = optionButtons[selectedIndex()];
    const target = selected ?? optionButtons.find((button) => !button.disabled);
    target?.focus({ preventScroll: true });
    if (target !== undefined) revealOption(target);
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
  return { element, select, trigger, refresh };
}
