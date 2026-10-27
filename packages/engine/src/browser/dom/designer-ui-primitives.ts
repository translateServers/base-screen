import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';

/** Private, stateless DOM primitives for Designer chrome. Never export from the package root. */
export type DesignerButtonVariant =
  | 'primary'
  | 'danger'
  | 'ghost'
  | 'neutral'
  | 'filter'
  | 'category'
  | 'canvas-tool';
export type DesignerControlSize = 'default' | 'compact';

/** 提示条语义图标：语义色只落在图标上（原型 .toast）。 */
export function designerNotificationGlyph(tone: 'error' | 'success'): string {
  return designerIcon(tone === 'error' ? 'x-circle' : 'check-circle');
}

export interface CreateDesignerButtonOptions {
  readonly ariaLabel?: string;
  readonly busy?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly size?: DesignerControlSize;
  readonly text?: string;
  /** 悬浮提示文案（data-tip）：由 DesignerTooltipController 统一渲染，不再使用原生 title。 */
  readonly tip?: string;
  readonly variant?: DesignerButtonVariant;
}

export interface CreateDesignerIconButtonOptions extends Omit<CreateDesignerButtonOptions, 'text'> {
  readonly icon: DesignerIconName;
  readonly label: string;
}

export type DesignerInputAppearance = 'text' | 'number' | 'color' | 'range';

export interface CreateDesignerInputOptions {
  readonly appearance?: DesignerInputAppearance;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly max?: number | string;
  readonly min?: number | string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly size?: DesignerControlSize;
  readonly step?: number | string;
  readonly type?: string;
  readonly value?: string;
}

export interface CreateDesignerCheckboxOptions {
  readonly ariaLabel?: string;
  readonly checked?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly value?: string;
}

export interface CreateDesignerSwitchOptions {
  readonly ariaLabel?: string;
  readonly checked?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly value?: string;
}

export interface DesignerSelectOption {
  readonly disabled?: boolean;
  readonly label: string;
  readonly selected?: boolean;
  readonly value: string;
}

export interface CreateDesignerSelectOptions {
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly options?: readonly DesignerSelectOption[];
  readonly size?: DesignerControlSize;
  readonly value?: string;
}

export interface CreateDesignerTextareaOptions {
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly value?: string;
}

export interface DesignerSegmentedOption {
  readonly value: string;
  /** 可见文本；仅图标时作为可访问名称的兜底。 */
  readonly label: string;
  readonly ariaLabel?: string;
  readonly title?: string;
  /** 设计器统一 tooltip（data-tip）；与原生 title 分开，避免两套悬浮提示。 */
  readonly tip?: string;
  readonly className?: string;
  readonly dataset?: Readonly<Record<string, string>>;
  readonly disabled?: boolean;
  readonly icon?: DesignerIconName;
}

export interface CreateDesignerSegmentedOptions {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly options: readonly DesignerSegmentedOption[];
  readonly selected: string | undefined;
  /** `pressed`：单选按钮组（aria-pressed）；`radio`：radiogroup + 漫游 tabindex。 */
  readonly selection?: 'pressed' | 'radio';
  readonly size?: DesignerControlSize;
}

export interface DesignerSegmentedRefreshOptions {
  readonly options?: readonly DesignerSegmentedOption[];
  readonly selected?: string | undefined;
}

export interface DesignerSegmentedHandle {
  readonly element: HTMLSpanElement;
  readonly buttons: ReadonlyMap<string, HTMLButtonElement>;
  /** 选项重建或外部值变化后同步状态；不接管点击，调用方仍可使用 data-* 委托。 */
  refresh(options?: DesignerSegmentedRefreshOptions): void;
}

export type DesignerTabItem = DesignerSegmentedOption;

export interface CreateDesignerTabsOptions {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly items: readonly DesignerTabItem[];
  readonly orientation?: 'horizontal' | 'vertical';
  readonly selected: string | undefined;
}

export interface DesignerTabsRefreshOptions {
  readonly items?: readonly DesignerTabItem[];
  readonly selected?: string | undefined;
}

export interface DesignerTabsHandle {
  readonly element: HTMLDivElement;
  readonly buttons: ReadonlyMap<string, HTMLButtonElement>;
  refresh(options?: DesignerTabsRefreshOptions): void;
}

export interface CreateDesignerTabButtonOptions extends DesignerTabItem {
  readonly selected?: boolean;
  readonly tabIndex?: number;
}

/** 单个导航 tab：供 rail 这类由多处动态拼装的 tablist 复用，避免各面板手写 tab 语义。 */
export function createDesignerTabButton(
  ownerDocument: Document,
  options: CreateDesignerTabButtonOptions,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = designerClassNames('designer-tab', options.className);
  button.setAttribute('role', 'tab');
  button.dataset.tabValue = options.value;
  if (options.icon === undefined) {
    button.textContent = options.label;
  } else {
    button.innerHTML = designerIcon(options.icon);
    button.setAttribute('aria-label', options.ariaLabel ?? options.label);
  }
  if (options.title !== undefined) button.title = options.title;
  if (options.tip !== undefined) button.setAttribute('data-tip', options.tip);
  if (options.icon === undefined && options.ariaLabel !== undefined) {
    button.setAttribute('aria-label', options.ariaLabel);
  }
  for (const [key, value] of Object.entries(options.dataset ?? {})) {
    button.dataset[key] = value;
  }
  if (options.disabled === true) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
  }
  button.setAttribute('aria-selected', String(options.selected === true));
  button.tabIndex = options.tabIndex ?? (options.selected === true ? 0 : -1);
  return button;
}

/**
 * 分段控件（原型 .segmented）：轨道 + 选项按钮，选中态用 aria 表达。
 *
 * 只负责结构与状态投影，不接管点击：调用方照旧用事件委托或按钮引用接线，
 * 因此既有 `data-*` 命令管线不受影响。radio 语义自动做 roving tabindex
 * （选中项优先，否则第一个可用项），pressed 语义保持全部可 Tab。
 */
export function createDesignerSegmented(
  ownerDocument: Document,
  options: CreateDesignerSegmentedOptions,
): DesignerSegmentedHandle {
  const selection = options.selection ?? 'pressed';
  const element = ownerDocument.createElement('span');
  element.className = designerClassNames('designer-segmented', options.className);
  element.setAttribute('role', selection === 'radio' ? 'radiogroup' : 'group');
  element.setAttribute('aria-label', options.ariaLabel);
  if (options.size !== undefined) element.dataset.size = options.size;
  const buttons = new Map<string, HTMLButtonElement>();
  let currentOptions = options.options;
  let currentSelected = options.selected;
  let rendered = false;

  const render = (): void => {
    if (rendered) element.replaceChildren();
    rendered = true;
    buttons.clear();
    const enabled = currentOptions.filter((option) => option.disabled !== true);
    const tabbable =
      selection === 'radio'
        ? (enabled.find((option) => option.value === currentSelected) ?? enabled[0])?.value
        : undefined;
    for (const option of currentOptions) {
      const button = ownerDocument.createElement('button');
      button.type = 'button';
      button.className = designerClassNames('designer-segmented-option', option.className);
      if (option.icon === undefined) {
        button.textContent = option.label;
      } else {
        button.innerHTML = designerIcon(option.icon);
        button.setAttribute('aria-label', option.ariaLabel ?? option.label);
      }
      if (option.title !== undefined) button.title = option.title;
      if (option.tip !== undefined) button.setAttribute('data-tip', option.tip);
      if (option.icon === undefined && option.ariaLabel !== undefined) {
        button.setAttribute('aria-label', option.ariaLabel);
      }
      for (const [key, value] of Object.entries(option.dataset ?? {})) {
        button.dataset[key] = value;
      }
      if (option.disabled === true) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      }
      if (selection === 'radio') {
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(option.value === currentSelected));
        button.tabIndex = option.value === tabbable ? 0 : -1;
      } else {
        button.setAttribute('aria-pressed', String(option.value === currentSelected));
      }
      element.appendChild(button);
      buttons.set(option.value, button);
    }
  };

  render();
  return {
    element,
    buttons,
    refresh(next = {}) {
      if (next.options !== undefined) currentOptions = next.options;
      if ('selected' in next) currentSelected = next.selected;
      render();
    },
  };
}

/**
 * 面板内的导航 tab（role=tablist）。与 segmented 分开：tabs 只表达「当前页签」，
 * 按下型选项组走 segmented，避免同一控件承担两种 ARIA 语义。
 */
export function createDesignerTabs(
  ownerDocument: Document,
  options: CreateDesignerTabsOptions,
): DesignerTabsHandle {
  const element = ownerDocument.createElement('div');
  element.className = designerClassNames('designer-tablist', options.className);
  element.setAttribute('role', 'tablist');
  element.setAttribute('aria-label', options.ariaLabel);
  const orientation = options.orientation ?? 'horizontal';
  element.dataset.orientation = orientation;
  element.setAttribute('aria-orientation', orientation);
  const buttons = new Map<string, HTMLButtonElement>();
  let currentItems = options.items;
  let currentSelected = options.selected;
  let rendered = false;

  const render = (): void => {
    if (rendered) element.replaceChildren();
    rendered = true;
    buttons.clear();
    const enabled = currentItems.filter((item) => item.disabled !== true);
    const tabbable = (enabled.find((item) => item.value === currentSelected) ?? enabled[0])?.value;
    for (const item of currentItems) {
      const button = createDesignerTabButton(ownerDocument, {
        ...item,
        selected: item.value === currentSelected,
        tabIndex: item.value === tabbable ? 0 : -1,
      });
      element.appendChild(button);
      buttons.set(item.value, button);
    }
  };

  render();
  return {
    element,
    buttons,
    refresh(next = {}) {
      if (next.items !== undefined) currentItems = next.items;
      if ('selected' in next) currentSelected = next.selected;
      render();
    },
  };
}

export interface CreateDesignerControlShellOptions {
  readonly className?: string;
  readonly size?: DesignerControlSize;
}

/**
 * 组合控件外壳：外壳承担描边环与焦点，内部控件用 `data-flush="true"` 去掉自身漆面。
 * 数据集参数、表格单元格等「输入 + 装饰」组合共用这一层，不再各自重写 input 外观。
 */
export function createDesignerControlShell(
  ownerDocument: Document,
  options: CreateDesignerControlShellOptions = {},
): HTMLSpanElement {
  const shell = ownerDocument.createElement('span');
  shell.className = designerClassNames('designer-control-shell', options.className);
  applyDesignerSize(shell, options.size);
  return shell;
}

export function createDesignerButton(
  ownerDocument: Document,
  options: CreateDesignerButtonOptions = {},
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = designerClassNames('designer-control designer-button', options.className);
  applyDesignerSize(button, options.size);
  if (options.text !== undefined) button.textContent = options.text;
  if (options.tip !== undefined) button.setAttribute('data-tip', options.tip);
  if (options.ariaLabel !== undefined) button.ariaLabel = options.ariaLabel;
  if (options.variant !== undefined) button.dataset.variant = options.variant;
  if (options.disabled !== undefined) button.disabled = options.disabled;
  if (options.pressed !== undefined) button.ariaPressed = String(options.pressed);
  if (options.busy !== undefined) button.ariaBusy = String(options.busy);
  return button;
}

export function createDesignerIconButton(
  ownerDocument: Document,
  options: CreateDesignerIconButtonOptions,
): HTMLButtonElement {
  const { icon, label, ...buttonOptions } = options;
  const button = createDesignerButton(ownerDocument, {
    ...buttonOptions,
    ariaLabel: buttonOptions.ariaLabel ?? label,
    className: designerClassNames('designer-icon-button', buttonOptions.className),
    tip: buttonOptions.tip ?? label,
  });
  button.innerHTML = designerIcon(icon);
  return button;
}

export function createDesignerInput(
  ownerDocument: Document,
  options: CreateDesignerInputOptions = {},
): HTMLInputElement {
  const appearance = options.appearance ?? 'text';
  const input = ownerDocument.createElement('input');
  input.type = options.type ?? inputTypeForAppearance(appearance);
  input.className = designerClassNames(inputClassNameForAppearance(appearance), options.className);
  applyDesignerSize(input, options.size);
  if (options.value !== undefined) input.value = options.value;
  if (options.placeholder !== undefined) input.placeholder = options.placeholder;
  if (options.ariaLabel !== undefined) input.ariaLabel = options.ariaLabel;
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  if (options.disabled !== undefined) input.disabled = options.disabled;
  if (options.readOnly !== undefined) input.readOnly = options.readOnly;
  return input;
}

export function createDesignerCheckbox(
  ownerDocument: Document,
  options: CreateDesignerCheckboxOptions = {},
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.className = designerClassNames('designer-checkbox', options.className);
  if (options.checked !== undefined) input.checked = options.checked;
  if (options.value !== undefined) input.value = options.value;
  if (options.ariaLabel !== undefined) input.ariaLabel = options.ariaLabel;
  if (options.disabled !== undefined) input.disabled = options.disabled;
  return input;
}

/**
 * Boolean field switch (design prototype `.switch`): a native checkbox carries the value and the
 * `change` event, so the existing value pipeline is untouched; `.designer-switch` paints it as a
 * 36×20 pill with a 14px knob. State is projected through `role="switch"` + `aria-checked`, the
 * same ARIA contract the workbench already uses for its other switches.
 */
export function createDesignerSwitch(
  ownerDocument: Document,
  options: CreateDesignerSwitchOptions = {},
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'checkbox';
  input.className = designerClassNames('designer-switch', options.className);
  input.setAttribute('role', 'switch');
  if (options.checked !== undefined) input.checked = options.checked;
  if (options.value !== undefined) input.value = options.value;
  if (options.ariaLabel !== undefined) input.ariaLabel = options.ariaLabel;
  if (options.disabled !== undefined) input.disabled = options.disabled;
  input.setAttribute('aria-checked', String(options.checked === true));
  // Native checkedness is the single source of truth; mirror it so every consumer (AT, tests)
  // observes the same switch state without a second state source.
  input.addEventListener('change', () => {
    input.setAttribute('aria-checked', String(input.checked));
  });
  return input;
}

export function createDesignerSelect(
  ownerDocument: Document,
  options: CreateDesignerSelectOptions = {},
): HTMLSelectElement {
  const select = ownerDocument.createElement('select');
  select.className = designerClassNames('designer-control designer-select', options.className);
  applyDesignerSize(select, options.size);
  for (const optionDefinition of options.options ?? []) {
    const option = ownerDocument.createElement('option');
    option.value = optionDefinition.value;
    option.textContent = optionDefinition.label;
    if (optionDefinition.selected !== undefined) option.selected = optionDefinition.selected;
    if (optionDefinition.disabled !== undefined) option.disabled = optionDefinition.disabled;
    select.appendChild(option);
  }
  if (options.value !== undefined) select.value = options.value;
  if (options.ariaLabel !== undefined) select.ariaLabel = options.ariaLabel;
  if (options.disabled !== undefined) select.disabled = options.disabled;
  return select;
}

export function createDesignerTextarea(
  ownerDocument: Document,
  options: CreateDesignerTextareaOptions = {},
): HTMLTextAreaElement {
  const textarea = ownerDocument.createElement('textarea');
  textarea.className = designerClassNames('designer-control designer-textarea', options.className);
  if (options.value !== undefined) textarea.value = options.value;
  if (options.placeholder !== undefined) textarea.placeholder = options.placeholder;
  if (options.ariaLabel !== undefined) textarea.ariaLabel = options.ariaLabel;
  if (options.disabled !== undefined) textarea.disabled = options.disabled;
  if (options.readOnly !== undefined) textarea.readOnly = options.readOnly;
  return textarea;
}

export function appendDesignerFieldMessage(
  container: HTMLElement,
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  key: string,
): HTMLElement {
  const id = `designer-field-${key}`;
  const messageId = `${id}-message`;
  input.id = id;
  input.setAttribute('aria-describedby', messageId);
  // Span-based color fields must not activate a native color input when their text is clicked.
  if (container.tagName.toLowerCase() === 'label') {
    (container as HTMLLabelElement).htmlFor = id;
  }
  const message = container.ownerDocument.createElement('span');
  message.id = messageId;
  message.className = 'designer-field-message';
  message.dataset.fieldMessage = 'true';
  message.ariaLive = 'polite';
  container.appendChild(message);
  return message;
}

function inputTypeForAppearance(appearance: DesignerInputAppearance): string {
  return appearance === 'text' ? 'text' : appearance;
}

function inputClassNameForAppearance(appearance: DesignerInputAppearance): string {
  switch (appearance) {
    case 'number':
      return 'designer-control designer-input designer-number';
    case 'color':
      return 'designer-control designer-color';
    case 'range':
      return 'designer-control designer-range';
    case 'text':
      return 'designer-control designer-input';
  }
}

export function designerClassNames(base: string, extra: string | undefined): string {
  return Array.from(new Set(`${base} ${extra ?? ''}`.trim().split(/\s+/))).join(' ');
}

function applyDesignerSize(element: HTMLElement, size: DesignerControlSize | undefined): void {
  if (size !== undefined) element.dataset.size = size;
}
