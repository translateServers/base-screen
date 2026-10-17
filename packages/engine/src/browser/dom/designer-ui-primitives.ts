import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';

/** Private, stateless DOM primitives for Designer chrome. Never export from the package root. */
export type DesignerButtonVariant = 'primary' | 'danger' | 'ghost';

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

export function createDesignerButton(
  ownerDocument: Document,
  options: CreateDesignerButtonOptions = {},
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = designerClassNames('designer-control designer-button', options.className);
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

function designerClassNames(base: string, extra: string | undefined): string {
  return Array.from(new Set(`${base} ${extra ?? ''}`.trim().split(/\s+/))).join(' ');
}
