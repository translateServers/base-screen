import type { ScreenIntentReferenceOption } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { createDesignerInput } from '../designer-ui-primitives.js';

/**
 * 意图引用选择器（素材 / 数据集）。
 *
 * 三条与既有弹层不同的约束，都是被右栏布局逼出来的：
 * 1. 输入区在 `.properties` 里，而右栏 `overflow: hidden`——就地 absolute 会被裁掉，
 *    所以浮层渲染到 overlay host 并 `position: fixed`；
 * 2. 输入区贴在右栏底部，向下弹必然出屏，所以默认向上弹，空间不够再翻回下方；
 * 3. 右栏切页签会整块重渲染，浮层在 overlay host 里不会跟着消失——锚点一脱离就自关。
 */

const POPOVER_GAP = 4;
const POPOVER_MIN_WIDTH = 240;
const POPOVER_MAX_WIDTH = 320;

export interface IntentReferencePickerOptions {
  readonly ownerDocument: Document;
  readonly anchor: () => HTMLElement | undefined;
  readonly overlayHost: () => HTMLElement | undefined;
  readonly options: () => readonly ScreenIntentReferenceOption[];
  readonly onSelect: (option: ScreenIntentReferenceOption) => void;
  readonly onClose?: () => void;
}

export interface IntentReferencePicker {
  open(focusSearch: boolean): void;
  close(restoreFocus: boolean): void;
  isOpen(): boolean;
  handleKeyDown(event: KeyboardEvent): boolean;
  dispose(): void;
}

export function createIntentReferencePicker(
  input: IntentReferencePickerOptions,
): IntentReferencePicker {
  const { ownerDocument } = input;
  const text = DESIGNER_UI_TEXT.intent;
  const root = ownerDocument.createElement('div');
  root.className = 'intent-ref-popover';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-label', text.referencePickerTitle);
  root.hidden = true;

  const search = createDesignerInput(ownerDocument, {
    type: 'search',
    className: 'intent-ref-search',
    placeholder: text.referenceSearch,
    ariaLabel: text.referenceSearch,
  });
  const list = ownerDocument.createElement('div');
  list.className = 'intent-ref-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', text.referencePickerTitle);
  root.append(search, list);

  let open = false;
  let query = '';
  let filtered: readonly ScreenIntentReferenceOption[] = [];
  let activeIndex = -1;
  let disposeListeners: (() => void) | undefined;

  const optionKey = (item: ScreenIntentReferenceOption): string => `${item.kind}:${item.id}`;
  const optionId = (index: number): string => `designer-intent-ref-option-${index}`;

  function matches(item: ScreenIntentReferenceOption, needle: string): boolean {
    if (needle === '') return true;
    const haystack = `${item.label} ${item.note ?? ''}`.toLowerCase();
    return haystack.includes(needle);
  }

  function renderList(): void {
    const all = input.options();
    const needle = query.trim().toLowerCase();
    filtered = all.filter((item) => matches(item, needle));
    list.replaceChildren();
    if (filtered.length === 0) {
      const empty = ownerDocument.createElement('p');
      empty.className = 'intent-ref-empty';
      empty.textContent = needle === '' ? text.referenceEmpty : text.referenceEmptySearch;
      list.append(empty);
      list.removeAttribute('aria-activedescendant');
      activeIndex = -1;
      return;
    }
    if (activeIndex < 0 || activeIndex >= filtered.length) activeIndex = 0;

    let renderedGroup: string | null = null;
    filtered.forEach((item, index) => {
      // 两类同时存在时才分段标题：只有一类时多一行标题是噪音。
      if (all.some((entry) => entry.kind !== item.kind) && item.kind !== renderedGroup) {
        renderedGroup = item.kind;
        const group = ownerDocument.createElement('p');
        group.className = 'intent-ref-group';
        group.setAttribute('role', 'presentation');
        group.textContent =
          item.kind === 'asset' ? text.referenceKindAsset : text.referenceKindDataset;
        list.append(group);
      }
      list.append(renderOption(item, index));
    });
    syncActive();
  }

  function renderOption(item: ScreenIntentReferenceOption, index: number): HTMLElement {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'intent-ref-option';
    button.id = optionId(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.dataset.intentRefOption = optionKey(item);

    if (item.thumbnailUrl === undefined) {
      const icon = ownerDocument.createElement('span');
      icon.className = 'intent-ref-option-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = designerIcon(item.kind === 'asset' ? 'image' : 'table');
      button.append(icon);
    } else {
      const thumb = ownerDocument.createElement('img');
      thumb.className = 'intent-ref-option-thumb';
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      thumb.src = item.thumbnailUrl;
      button.append(thumb);
    }

    const body = ownerDocument.createElement('span');
    body.className = 'intent-ref-option-text';
    const name = ownerDocument.createElement('span');
    name.className = 'intent-ref-option-name';
    name.textContent = item.label;
    body.append(name);
    if (item.note !== undefined && item.note !== '') {
      const note = ownerDocument.createElement('span');
      note.className = 'intent-ref-option-note';
      note.textContent = item.note;
      body.append(note);
    }
    button.append(body);
    return button;
  }

  function syncActive(): void {
    const nodes = [...list.querySelectorAll<HTMLElement>('.intent-ref-option')];
    nodes.forEach((node, index) => {
      const active = index === activeIndex;
      node.dataset.active = String(active);
      node.setAttribute('aria-selected', String(active));
    });
    const activeNode = nodes[activeIndex];
    if (activeNode === undefined) list.removeAttribute('aria-activedescendant');
    else {
      list.setAttribute('aria-activedescendant', activeNode.id);
      activeNode.scrollIntoView({ block: 'nearest' });
    }
  }

  function position(): void {
    const anchor = input.anchor();
    if (anchor === undefined || anchor.isConnected === false) {
      close(false);
      return;
    }
    const host = input.overlayHost() ?? ownerDocument.body;
    if (root.parentElement !== host) host.append(root);
    const rect = anchor.getBoundingClientRect();
    const view = ownerDocument.defaultView;
    if (view === null) return;
    root.style.maxWidth = `${POPOVER_MAX_WIDTH}px`;
    const width = Math.min(Math.max(rect.width, POPOVER_MIN_WIDTH), POPOVER_MAX_WIDTH);
    root.style.width = `${Math.round(width)}px`;
    const height = root.offsetHeight;
    const spaceAbove = rect.top;
    const spaceBelow = view.innerHeight - rect.bottom;
    // 输入区贴底：优先向上弹，上方也不够才回落到下方并夹进视口。
    const above = spaceAbove >= height + POPOVER_GAP || spaceAbove >= spaceBelow;
    const top = above ? rect.top - height - POPOVER_GAP : rect.bottom + POPOVER_GAP;
    const left = Math.min(Math.max(POPOVER_GAP, rect.left), view.innerWidth - width - POPOVER_GAP);
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(Math.max(POPOVER_GAP, top))}px`;
  }

  function bindOutside(): void {
    const onPointerDown = (event: Event): void => {
      const path = event.composedPath();
      if (path.includes(root)) return;
      const anchor = input.anchor();
      if (anchor !== undefined && path.includes(anchor)) return;
      close(false);
    };
    const onReposition = (): void => {
      if (open) position();
    };
    ownerDocument.addEventListener('pointerdown', onPointerDown, true);
    ownerDocument.addEventListener('scroll', onReposition, true);
    ownerDocument.defaultView?.addEventListener('resize', onReposition);
    disposeListeners = () => {
      ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
      ownerDocument.removeEventListener('scroll', onReposition, true);
      ownerDocument.defaultView?.removeEventListener('resize', onReposition);
    };
  }

  function select(index: number): void {
    const item = filtered[index];
    if (item === undefined) return;
    // 先关再回调：回调会重建输入区，浮层留到后面会让焦点落在已脱离的节点上。
    close(true);
    input.onSelect(item);
  }

  function close(restoreFocus: boolean): void {
    if (!open) return;
    open = false;
    root.hidden = true;
    root.remove();
    disposeListeners?.();
    disposeListeners = undefined;
    query = '';
    search.value = '';
    if (restoreFocus) input.anchor()?.focus();
    input.onClose?.();
  }

  function openPicker(focusSearch: boolean): void {
    if (open) {
      position();
      return;
    }
    open = true;
    root.hidden = false;
    query = '';
    search.value = '';
    activeIndex = 0;
    renderList();
    position();
    bindOutside();
    if (focusSearch) search.focus();
    else list.focus();
  }

  search.addEventListener('input', () => {
    query = search.value;
    activeIndex = 0;
    renderList();
    position();
  });

  list.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('.intent-ref-option');
    if (target === null || target === undefined) return;
    const index = [...list.querySelectorAll('.intent-ref-option')].indexOf(target);
    if (index >= 0) select(index);
  });

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (!open) return false;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (filtered.length > 0) {
          activeIndex = (activeIndex + 1) % filtered.length;
          syncActive();
        }
        return true;
      case 'ArrowUp':
        event.preventDefault();
        if (filtered.length > 0) {
          activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
          syncActive();
        }
        return true;
      case 'Home':
        event.preventDefault();
        activeIndex = 0;
        syncActive();
        return true;
      case 'End':
        event.preventDefault();
        activeIndex = Math.max(0, filtered.length - 1);
        syncActive();
        return true;
      case 'Enter':
        event.preventDefault();
        select(activeIndex);
        return true;
      case 'Escape':
        event.preventDefault();
        close(true);
        return true;
      case 'Tab':
        // 关闭但不把焦点困在浮层里：Tab 是用户想离开这一层。
        close(false);
        return true;
      default:
        return false;
    }
  }

  return {
    open: openPicker,
    close,
    isOpen: () => open,
    handleKeyDown,
    dispose: () => close(false),
  };
}
