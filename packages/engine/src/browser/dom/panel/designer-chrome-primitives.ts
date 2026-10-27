import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';
import { createDesignerButton, designerClassNames } from '../designer-ui-primitives.js';

/**
 * 面板件原语：分区、空态、徽标的结构只有这一处，外观只有 `styles/workbench/
 * designer-workbench-chrome.css` 一处。各面板从这里取结构，自己只负责布局（宽度、
 * 间距、定位），不再各自拼 header/徽标/空态骨架或重写外观。
 */

export type DesignerBadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface CreateDesignerBadgeOptions {
  readonly text: string;
  readonly tone?: DesignerBadgeTone;
  readonly className?: string;
  readonly dataset?: Readonly<Record<string, string>>;
  readonly title?: string;
  readonly ariaLabel?: string;
}

/** 徽标：计数、类型、状态共用同一形态，语义只由 `data-tone` 表达。 */
export function createDesignerBadge(
  parent: HTMLElement,
  options: CreateDesignerBadgeOptions,
): HTMLSpanElement {
  const badge = parent.ownerDocument.createElement('span');
  badge.className = designerClassNames('designer-badge', options.className);
  badge.textContent = options.text;
  badge.dataset.tone = options.tone ?? 'neutral';
  if (options.title !== undefined) badge.title = options.title;
  if (options.ariaLabel !== undefined) badge.setAttribute('aria-label', options.ariaLabel);
  for (const [key, value] of Object.entries(options.dataset ?? {})) badge.dataset[key] = value;
  parent.appendChild(badge);
  return badge;
}

export interface DesignerEmptyStateAction {
  readonly label: string;
  readonly ariaLabel?: string;
  readonly variant?: 'primary' | 'danger' | 'ghost' | 'neutral';
  readonly dataset?: Readonly<Record<string, string>>;
}

export interface AppendDesignerEmptyStateOptions {
  readonly title: string;
  readonly hint?: string;
  readonly icon?: DesignerIconName;
  /** `success` 用于「无问题是好状态」的空态（蓝图健康检查）。 */
  readonly tone?: 'neutral' | 'success';
  readonly actions?: readonly DesignerEmptyStateAction[];
  readonly className?: string;
  readonly role?: 'status' | 'alert';
  readonly live?: 'polite' | 'assertive';
}

export interface DesignerEmptyStateHandle {
  readonly element: HTMLElement;
  readonly actionButtons: readonly HTMLButtonElement[];
}

/** 空态：图标 + 结论 + 下一步出口；面板只决定放在哪，不重画形态。 */
export function appendDesignerEmptyState(
  parent: HTMLElement,
  options: AppendDesignerEmptyStateOptions,
): DesignerEmptyStateHandle {
  const ownerDocument = parent.ownerDocument;
  const empty = ownerDocument.createElement('div');
  empty.className = designerClassNames('designer-empty', options.className);
  if (options.tone === 'success') empty.dataset.tone = 'success';
  if (options.role !== undefined) empty.setAttribute('role', options.role);
  if (options.live !== undefined) empty.ariaLive = options.live;
  if (options.icon !== undefined) {
    const icon = ownerDocument.createElement('span');
    icon.className = 'designer-empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = designerIcon(options.icon);
    empty.appendChild(icon);
  }
  const title = ownerDocument.createElement('p');
  title.className = 'designer-empty-title';
  title.textContent = options.title;
  empty.appendChild(title);
  if (options.hint !== undefined) {
    const hint = ownerDocument.createElement('p');
    hint.className = 'designer-empty-hint';
    hint.textContent = options.hint;
    empty.appendChild(hint);
  }
  const actionButtons: HTMLButtonElement[] = [];
  if (options.actions !== undefined && options.actions.length > 0) {
    const actions = ownerDocument.createElement('div');
    actions.className = 'designer-empty-actions';
    for (const action of options.actions) {
      const button = createDesignerButton(ownerDocument, {
        className: 'designer-empty-action',
        text: action.label,
        ...(action.ariaLabel === undefined ? {} : { ariaLabel: action.ariaLabel }),
        ...(action.variant === undefined ? {} : { variant: action.variant }),
      });
      for (const [key, value] of Object.entries(action.dataset ?? {})) {
        button.dataset[key] = value;
      }
      actions.appendChild(button);
      actionButtons.push(button);
    }
    empty.appendChild(actions);
  }
  parent.appendChild(empty);
  return { element: empty, actionButtons };
}

export interface CreateDesignerSectionOptions {
  readonly title: string;
  /** 高级区：命中 `[data-inspector-advanced]` 的密度过滤。 */
  readonly advanced?: boolean;
  /** 可折叠（默认 true）：原生 `<details>`，指针与键盘都能收起。 */
  readonly collapsible?: boolean;
  readonly open?: boolean;
  readonly actions?: readonly HTMLElement[];
  readonly className?: string;
}

export interface DesignerSection {
  readonly element: HTMLElement;
  readonly title: HTMLElement;
  readonly actions: HTMLElement | null;
}

/**
 * 分区：标题行 + 内容区。返回的 `element` 就是内容容器，调用方直接往里追加字段。
 * 面板不得再自建 `<section><header><h3>` 或 `details/summary` 骨架。
 */
export function createDesignerSection(
  parent: HTMLElement,
  options: CreateDesignerSectionOptions,
): DesignerSection {
  const ownerDocument = parent.ownerDocument;
  const collapsible = options.collapsible ?? true;
  const element = ownerDocument.createElement(collapsible ? 'details' : 'section');
  element.className = designerClassNames(
    'designer-panel-section designer-inspector-section',
    options.className,
  );
  if (collapsible) {
    (element as HTMLDetailsElement).open = options.open ?? true;
    element.classList.add('designer-inspector-disclosure');
  }
  if (options.advanced === true) element.dataset.inspectorAdvanced = 'true';

  const title = ownerDocument.createElement(collapsible ? 'summary' : 'h3');
  title.className = 'designer-panel-section-title designer-inspector-section-title';
  if (collapsible)
    title.classList.add('designer-inspector-section-summary', 'designer-panel-section-summary');
  title.textContent = options.title;
  if (collapsible) {
    const disclosure = ownerDocument.createElement('span');
    disclosure.className =
      'designer-panel-section-disclosure designer-inspector-section-disclosure';
    disclosure.setAttribute('aria-hidden', 'true');
    disclosure.innerHTML = designerIcon('chevron-down');
    title.appendChild(disclosure);
  }
  element.appendChild(title);

  let actions: HTMLElement | null = null;
  if (options.actions !== undefined && options.actions.length > 0) {
    actions = ownerDocument.createElement('div');
    actions.className = 'designer-panel-section-actions';
    for (const action of options.actions) actions.appendChild(action);
    if (collapsible) {
      actions.addEventListener('click', (event) => event.stopPropagation());
    }
    element.appendChild(actions);
  }
  parent.appendChild(element);
  return { element, title, actions };
}
