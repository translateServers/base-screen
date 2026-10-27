import type { ScreenValueRef } from '@base-screen/contracts';
import {
  createDesignerButton,
  createDesignerInput,
  createDesignerTabs,
} from '../designer-ui-primitives.js';
import { appendDesignerEmptyState } from '../panel/designer-chrome-primitives.js';
import { renderValueRefSummary, valueRefSummaryText } from './designer-value-ref-summary-dom.js';
import {
  badgeOf,
  buildValueRefOptions,
  type DesignerValueRefKind,
  type DesignerValueRefOption,
  type DesignerValueRefPickerOptions,
  filterValueRefOptions,
  VALUE_REF_SEARCH_DEBOUNCE_MS,
} from './designer-value-ref-types.js';

/**
 * 取值选择器：触发器 + 浮层。
 *
 * 结构约定（探针与 T03b 都依赖）：
 * - 触发器 `[data-value-ref-trigger="<controlKey>"]`，`aria-haspopup="dialog"`；
 * - 浮层 `role="dialog"`，挂在 `popoverHost`（段之外），不随段 diff 重建；
 * - 分段 `[role="tablist"]`（只剩一种形态时不显示）；
 * - 列表 `[role="listbox"]` + `aria-activedescendant`；
 * - 选中播报 `[data-value-ref-live][aria-live="polite"]`。
 *
 * 键盘：`Enter`/`Space`/`↓` 打开并聚焦搜索；`↑↓` 移动、`Enter` 选中、`Esc` 关闭、
 * `Tab` 关闭且不困住焦点、`Home`/`End` 首尾。
 */
export function createValueRefPicker(options: DesignerValueRefPickerOptions): {
  readonly element: HTMLElement;
  readonly dispose: () => void;
} {
  const document = options.ownerDocument;
  const text = options.text;
  const trigger = createDesignerButton(document, {
    ariaLabel: options.ariaLabel,
    className: 'designer-value-ref-trigger',
  });
  trigger.dataset.valueRefTrigger = options.controlKey;
  trigger.dataset.dsControl = options.controlKey;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const live = document.createElement('span');
  live.className = 'designer-visually-hidden';
  live.dataset.valueRefLive = 'true';
  live.setAttribute('aria-live', 'polite');

  const shell = document.createElement('div');
  shell.className = 'designer-value-ref-field';
  shell.append(trigger, live);
  renderTriggerSummary();

  let popover: HTMLElement | undefined;
  let search: HTMLInputElement | undefined;
  let list: HTMLElement | undefined;
  let activeIndex = 0;
  let visible: readonly DesignerValueRefOption[] = [];
  let query = '';
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let disposeListeners: (() => void) | undefined;

  function currentOptions(): readonly DesignerValueRefOption[] {
    return filterValueRefOptions(buildValueRefOptions(options.input, text), query);
  }

  function renderTriggerSummary(): void {
    trigger.replaceChildren(
      renderValueRefSummary(document, options.input.current, options.input, text),
    );
  }

  function open(focusSearch: boolean): void {
    if (popover !== undefined) {
      if (focusSearch) search?.focus();
      return;
    }
    popover = buildPopover();
    const opened = popover;
    const host = resolvePopoverHost();
    host.appendChild(popover);
    positionPopover();
    trigger.setAttribute('aria-expanded', 'true');
    const onPointerDown = (event: Event): void => {
      // 监听在 document 上，而设计器整棵树在 shadow root 里：到达 document 时 `event.target`
      // 已被重定向成宿主元素（`base-screen-designer`），拿它判断「是否点在浮层里」永远为假，
      // 结果是「点选项」被当成「点浮层外面」——浮层在 click 之前就被关掉，选不中任何东西。
      // 判据必须走 `composedPath()`：它保留了穿过 shadow 边界的真实祖先链。
      const path = event.composedPath();
      if (path.includes(opened) || path.includes(trigger)) return;
      close(false);
    };
    const onReflow = (): void => positionPopover();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.defaultView?.addEventListener('scroll', onReflow, true);
    document.defaultView?.addEventListener('resize', onReflow);
    disposeListeners = () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.defaultView?.removeEventListener('scroll', onReflow, true);
      document.defaultView?.removeEventListener('resize', onReflow);
    };
    popover.addEventListener('keydown', onKeyDown);
    if (focusSearch) search?.focus();
    else list?.focus();
  }

  function close(restoreFocus: boolean): void {
    popover?.remove();
    popover = undefined;
    search = undefined;
    list = undefined;
    query = '';
    disposeListeners?.();
    disposeListeners = undefined;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  /** 浮层宿主：优先调用点提供的 overlay 宿主，缺省退到触发器所在的设计器子树。 */
  function resolvePopoverHost(): HTMLElement {
    if (options.popoverHost !== undefined) return options.popoverHost;
    const designer = trigger.closest('.designer');
    if (designer instanceof HTMLElement) {
      const existing = designer.querySelector<HTMLElement>('[data-designer-overlay-host]');
      if (existing !== null) return existing;
      const fallback = document.createElement('div');
      fallback.dataset.designerOverlayHost = 'true';
      fallback.className = 'designer-overlay-host';
      fallback.style.position = 'fixed';
      fallback.style.inset = '0';
      fallback.style.pointerEvents = 'none';
      designer.appendChild(fallback);
      return fallback;
    }
    return trigger.offsetParent instanceof HTMLElement ? trigger.offsetParent : document.body;
  }

  function positionPopover(): void {
    if (popover === undefined) return;
    const anchor = (options.anchor ?? trigger).getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.left = `${Math.round(anchor.left)}px`;
    popover.style.top = `${Math.round(anchor.bottom + 4)}px`;
    // 工作台里的控件有 650px 宽；列表跟着拉满会让每行只剩变量名和一大片空白。
    popover.style.minWidth = `${Math.round(Math.min(anchor.width, 360))}px`;
    popover.style.pointerEvents = 'auto';
  }

  function buildPopover(): HTMLElement {
    const dialog = document.createElement('div');
    dialog.className = 'designer-value-ref-popover';
    dialog.dataset.valueRefPopover = 'true';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', text.placeholder);
    dialog.setAttribute('aria-modal', 'false');

    const kinds = options.input.allowedKinds;
    // 只开一种形态时列表内不再重复徽标；`variable` 单形态改用原型里的 `{ }` 字形。
    dialog.dataset.valueRefKinds = kinds.join(' ');
    if (kinds.length > 1) {
      const tabs = createDesignerTabs(document, {
        ariaLabel: text.placeholder,
        className: 'designer-value-ref-tabs',
        items: kinds.map((kind) => ({
          className: 'designer-value-ref-tab',
          dataset: { valueRefTab: kind },
          label: tabLabel(kind),
          value: kind,
        })),
        selected: kindOf(options.input.current),
      });
      for (const tab of tabs.buttons.values()) {
        tab.addEventListener('click', () => {
          query = '';
          if (search !== undefined) search.value = '';
          renderList();
        });
      }
      dialog.appendChild(tabs.element);
    }

    // 表单控件一律走共享原语（检查器/面板的形状与可访问性口径只在这里定义一次）。
    search = createDesignerInput(document, {
      type: 'search',
      className: 'designer-value-ref-search',
      ariaLabel: text.search,
      placeholder: text.search,
    });
    search.dataset.valueRefSearch = 'true';
    search.addEventListener('input', () => {
      const value = search?.value ?? '';
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        query = value;
        renderList();
      }, VALUE_REF_SEARCH_DEBOUNCE_MS);
    });
    dialog.appendChild(search);

    list = document.createElement('div');
    list.className = 'designer-value-ref-list';
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    dialog.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'designer-value-ref-footer';
    const manage = createDesignerButton(document, { text: text.manage });
    manage.dataset.valueRefManage = 'true';
    manage.addEventListener('click', () => {
      options.onManage?.();
      close(true);
    });
    footer.appendChild(manage);
    dialog.appendChild(footer);

    renderList();
    return dialog;
  }

  function tabLabel(kind: DesignerValueRefKind): string {
    if (kind === 'inline') return text.tab.inline;
    if (kind === 'variable') return text.tab.variable;
    return text.tab.field;
  }

  function renderList(): void {
    if (list === undefined) return;
    visible = currentOptions();
    activeIndex = Math.min(activeIndex, Math.max(visible.length - 1, 0));
    list.replaceChildren();
    if (visible.length === 0) {
      const searching = query.trim().length > 0;
      const actions = searching
        ? [{ label: text.clearSearch, dataset: { valueRefClearSearch: 'true' } }]
        : options.allowCreateVariable === true
          ? [{ label: text.createVariable, dataset: { valueRefCreate: 'true' } }]
          : [];
      const { element: empty, actionButtons } = appendDesignerEmptyState(list, {
        title: searching ? text.emptySearch : text.emptyVariables,
        actions,
      });
      empty.dataset.valueRefEmpty = searching ? 'search' : 'items';
      const action = actionButtons[0];
      if (action !== undefined) {
        action.title = searching ? text.emptySearch : text.emptyVariables;
        action.addEventListener('click', () => {
          if (searching) {
            query = '';
            if (search !== undefined) search.value = '';
            renderList();
            search?.focus();
          } else {
            options.onCreateVariable?.();
            close(true);
          }
        });
      }
      list.removeAttribute('aria-activedescendant');
      return;
    }
    visible.forEach((option, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'designer-value-ref-option';
      item.id = optionId(option.id);
      item.dataset.valueRefOption = option.id;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(isSelected(option)));
      item.appendChild(renderValueRefSummary(document, option.value, options.input, text));
      item.addEventListener('click', () => choose(option));
      if (index === activeIndex) item.dataset.active = 'true';
      list!.appendChild(item);
    });
    list.setAttribute('aria-activedescendant', optionId(visible[activeIndex]!.id));
  }

  function isSelected(option: DesignerValueRefOption): boolean {
    const current = options.input.current;
    if (current === null) return false;
    if (current.kind !== option.value.kind) return false;
    if (current.kind === 'variable' && option.value.kind === 'variable') {
      return current.variableId === option.value.variableId;
    }
    if (current.kind === 'data-source-field' && option.value.kind === 'data-source-field') {
      return (
        current.dataSourceId === option.value.dataSourceId &&
        current.path.join('.') === option.value.path.join('.')
      );
    }
    if (current.kind === 'inline' && option.value.kind === 'inline') {
      return current.value === option.value.value;
    }
    return false;
  }

  function choose(option: DesignerValueRefOption): void {
    const summary = summarize(option);
    // 顺序是硬要求：**先关闭并交还焦点，再通知调用点**。
    // 触发器住在会被重建的段里，调用点一收到选择就会重建那个段（草稿变了），
    // 反过来的话 `close(true)` 里的 `trigger.focus()` 会落在一个已经脱离文档的旧按钮上，
    // 焦点随之掉给 body，而节点身份、内容断言全都照旧通过——只有键盘用户能感觉到。
    close(true);
    live.textContent = text.selected(summary);
    options.onSelect(option.value);
  }

  function summarize(option: DesignerValueRefOption): string {
    return `${badgeOf(option.kind, text)} ${option.label}`;
  }

  function move(delta: number): void {
    if (visible.length === 0) return;
    activeIndex = (activeIndex + delta + visible.length) % visible.length;
    for (const [index, node] of [...(list?.children ?? [])].entries()) {
      if (node instanceof HTMLElement && node.dataset.valueRefOption !== undefined) {
        node.dataset.active = String(index === activeIndex);
      }
    }
    if (list !== undefined) {
      list.setAttribute('aria-activedescendant', optionId(visible[activeIndex]!.id));
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        return;
      case 'Home':
        event.preventDefault();
        activeIndex = 0;
        move(0);
        return;
      case 'End':
        event.preventDefault();
        activeIndex = visible.length - 1;
        move(0);
        return;
      case 'Enter': {
        const option = visible[activeIndex];
        if (option === undefined) return;
        event.preventDefault();
        choose(option);
        return;
      }
      case 'Escape':
        event.preventDefault();
        close(true);
        return;
      case 'Tab':
        // Tab 不困住焦点：直接关闭并让浏览器把焦点交给下一个控件。
        close(false);
        return;
      default:
        return;
    }
  }

  trigger.addEventListener('click', () => {
    if (popover === undefined) open(true);
    else close(true);
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(true);
    }
  });

  return {
    element: shell,
    dispose: () => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      disposeListeners?.();
      popover?.remove();
      popover = undefined;
      trigger.replaceChildren();
      shell.replaceChildren();
    },
  };
}

function kindOf(ref: ScreenValueRef | null): DesignerValueRefKind | undefined {
  return ref?.kind;
}

function optionId(id: string): string {
  return `designer-value-ref-option-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

export { valueRefSummaryText };
