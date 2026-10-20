import type { ScreenDatasetDefinition, ScreenValueRef } from '@base-screen/contracts';
import type { ScreenDataBindingRole } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  datasetParameterPickerInput,
  mountValueRefPicker,
} from '../../controllers/value-ref/designer-value-ref-picker-controller.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import { createDesignerSelect } from '../designer-ui-primitives.js';
import { isDesignerDatasetBindingValid } from './designer-dataset-binding.js';
import {
  configSection,
  parameterControl,
  renderActions,
} from './designer-dataset-config-controls.js';
import type {
  DesignerDatasetConfigurationOptions,
  DesignerDatasetDraftView,
} from './designer-dataset-types.js';

/**
 * 段内挂载的取值选择器清理函数，按段元素登记。
 *
 * 选择器把浮层挂在段**之外**的 overlay 宿主上：段被替换或整块重绘时浮层不会跟着走，
 * 于是必须显式销毁，否则「段重建 + 浮层还开着」会留下一层没人能关掉的浮层。
 * 用 WeakMap 而不是往元素上挂属性：段元素一被丢弃，登记表自己就回收了。
 */
const sectionPickerDisposers = new WeakMap<HTMLElement, (() => void)[]>();

/** 销毁某段内挂载的取值选择器（段被替换 / 面板重绘前调用；无登记时是空操作）。 */
export function disposeDatasetSection(section: HTMLElement): void {
  const disposers = sectionPickerDisposers.get(section);
  if (disposers === undefined) return;
  for (const dispose of disposers) dispose();
  sectionPickerDisposers.delete(section);
}

/** 销毁 root 子树内所有已登记的取值选择器。 */
export function disposeDatasetSections(root: HTMLElement): void {
  for (const section of root.querySelectorAll<HTMLElement>('[data-ds-section]')) {
    disposeDatasetSection(section);
  }
}

function registerSectionDisposer(section: HTMLElement, dispose: () => void): void {
  const existing = sectionPickerDisposers.get(section);
  if (existing === undefined) sectionPickerDisposers.set(section, [dispose]);
  else existing.push(dispose);
}

export function renderDesignerDatasetConfiguration(
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const details = options.panel.ownerDocument.createElement('div');
  details.dataset.datasetDescriptor = 'true';
  details.dataset.dsSection = 'config';
  details.className = 'designer-dataset-descriptor';
  details.appendChild(
    renderDatasetSummary(details.ownerDocument, options.descriptor, options.roles, options.draft),
  );
  details.appendChild(renderParameters(details.ownerDocument, options));
  details.appendChild(renderBindings(details.ownerDocument, options));
  if (options.includeActions !== false) {
    details.appendChild(
      renderActions(
        details.ownerDocument,
        !options.resourceAvailable,
        isDesignerDatasetBindingValid(options.descriptor, options.draft, options.roles),
      ),
    );
  }
  return details;
}

function renderDatasetSummary(
  ownerDocument: Document,
  descriptor: ScreenDatasetDefinition,
  roles: readonly ScreenDataBindingRole[],
  draft: DesignerDatasetDraftView | undefined,
): HTMLElement {
  const summary = ownerDocument.createElement('section');
  summary.className = 'designer-dataset-summary';
  summary.dataset.workbenchSection = 'source';
  summary.dataset.inspectorSearchSection = 'true';
  summary.tabIndex = -1;
  const header = ownerDocument.createElement('div');
  header.className = 'designer-dataset-summary-header';
  const title = ownerDocument.createElement('span');
  title.className = 'designer-dataset-summary-title';
  const eyebrow = ownerDocument.createElement('small');
  eyebrow.textContent = DESIGNER_UI_TEXT.dataset.currentDataset;
  const name = ownerDocument.createElement('strong');
  name.textContent = descriptor.name;
  title.append(eyebrow, name);
  const change = ownerDocument.createElement('button');
  change.type = 'button';
  change.className = 'designer-control designer-button';
  change.dataset.datasetChange = 'true';
  change.textContent = DESIGNER_UI_TEXT.dataset.change;
  header.append(title, change);
  summary.appendChild(header);
  if (descriptor.description !== null && descriptor.description.length > 0) {
    const description = ownerDocument.createElement('p');
    description.className = 'designer-dataset-description';
    description.textContent = descriptor.description;
    summary.appendChild(description);
  }
  // 「对象数组」常量 chip 已删除：tabular 数据集恒为对象数组，零信息量却占 20px + 一条边框。
  const bindingSummary = ownerDocument.createElement('div');
  bindingSummary.className = 'designer-dataset-binding-summary';
  const bindingHeader = ownerDocument.createElement('div');
  bindingHeader.className = 'designer-dataset-binding-summary-header';
  const bindingTitle = ownerDocument.createElement('strong');
  bindingTitle.textContent = DESIGNER_UI_TEXT.dataset.bindingSummaryTitle;
  const bindings = roles.flatMap((role) => {
    const selected = draft?.fields[role.id] ?? [];
    if (selected.length === 0) return [];
    return [
      {
        role: DESIGNER_UI_TEXT.dataset.bindingRole(role.id),
        fields: selected.map(
          (id) => descriptor.fields.find((field) => field.id === id)?.label ?? id,
        ),
      },
    ];
  });
  const bindingCount = ownerDocument.createElement('span');
  bindingCount.textContent = DESIGNER_UI_TEXT.dataset.selectedFields(
    bindings.reduce((count, binding) => count + binding.fields.length, 0),
  );
  bindingHeader.append(bindingTitle, bindingCount);
  bindingSummary.appendChild(bindingHeader);
  if (bindings.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-dataset-binding-summary-empty';
    empty.textContent = DESIGNER_UI_TEXT.dataset.bindingNone;
    bindingSummary.appendChild(empty);
  }
  for (const binding of bindings) {
    bindingSummary.appendChild(renderBindingSummaryItem(ownerDocument, binding));
  }
  summary.appendChild(bindingSummary);
  // 字段清单不再平铺成 chips：字段映射段里的选择器已经表达同一件事，
  // 同屏两处重复值会让人以为 chips 是可编辑的第三个入口。
  return summary;
}

function renderBindingSummaryItem(
  ownerDocument: Document,
  binding: { readonly role: string; readonly fields: readonly string[] },
): HTMLDetailsElement {
  const details = ownerDocument.createElement('details');
  details.className = 'designer-dataset-binding-summary-item';
  const disclosure = ownerDocument.createElement('summary');
  disclosure.className = 'designer-dataset-binding-summary-disclosure';
  const preview = ownerDocument.createElement('span');
  preview.className = 'designer-dataset-binding-summary-preview';
  const role = ownerDocument.createElement('span');
  role.className = 'designer-dataset-binding-summary-role';
  role.textContent = binding.role;
  role.setAttribute('data-tip', binding.role);
  const fields = ownerDocument.createElement('span');
  fields.className = 'designer-dataset-binding-summary-value';
  fields.textContent = binding.fields.join('、');
  fields.setAttribute('data-tip', binding.fields.join('、'));
  preview.append(role, fields);
  disclosure.appendChild(preview);
  disclosure.setAttribute('aria-label', `${binding.role}：${binding.fields.join('、')}`);

  const expanded = ownerDocument.createElement('div');
  expanded.className = 'designer-dataset-binding-summary-expanded';
  const fieldList = ownerDocument.createElement('ul');
  fieldList.className = 'designer-dataset-binding-summary-fields';
  for (const field of binding.fields) {
    const label = ownerDocument.createElement('li');
    label.textContent = field;
    fieldList.appendChild(label);
  }
  expanded.appendChild(fieldList);
  details.append(disclosure, expanded);
  return details;
}

/**
 * 参数段：每行 = 取值选择器触发器 + （仅当取值是常量时）内联值编辑器。
 *
 * 形态与值分开表达，是这次重构的核心：以前「固定值 / 变量」是一个下拉，选完再把值控件整块换掉，
 * 于是变量下拉一改值就把引用覆盖成字面量；现在触发器只回答「这个参数取什么」，
 * 常量形态下才把值编辑器并排放出来，引用与值不会互相踩。
 */
function renderParameters(
  ownerDocument: Document,
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const section = configSection(
    ownerDocument,
    DESIGNER_UI_TEXT.dataSource.requestTitle,
    'parameters',
  );
  if (options.descriptor.parameters.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataset.noParameters;
    section.appendChild(empty);
  }
  for (const parameter of options.descriptor.parameters) {
    const current = currentParameterRef(options.draft, parameter);
    const label = ownerDocument.createElement('label');
    label.className = 'designer-field designer-dataset-parameter';
    const labelText = ownerDocument.createElement('span');
    labelText.className = 'designer-field-label';
    labelText.textContent = parameter.label;
    const controls = ownerDocument.createElement('span');
    controls.className = 'designer-dataset-parameter-controls';
    const picker = mountValueRefPicker({
      ownerDocument,
      text: DESIGNER_UI_TEXT.data.ref,
      input: datasetParameterPickerInput(current, options.variables),
      controlKey: `parameter:${parameter.name}`,
      ariaLabel: DESIGNER_UI_TEXT.dataset.parameterModeLabel(parameter.label),
      popoverHost: options.overlayHost,
      onSelect: (ref) => options.onSelectParameter?.(parameter.name, ref),
    });
    registerSectionDisposer(section, picker.dispose);
    controls.appendChild(picker.element);
    if (current.kind === 'inline') {
      controls.appendChild(
        parameterControl(ownerDocument, options.descriptor, parameter.name, current),
      );
    }
    label.append(labelText, controls);
    section.appendChild(label);
  }
  return section;
}

/**
 * 参数当前生效的取值引用。
 *
 * 草稿里没有这个参数时（刚选中数据集、参数还没被写过）按「常量 + 定义默认值」呈现：
 * 内联编辑器必须有值可编辑，而空着会让用户以为参数缺失。
 */
function currentParameterRef(
  draft: DesignerDatasetDraftView | undefined,
  parameter: ScreenDatasetDefinition['parameters'][number],
): ScreenValueRef {
  return draft?.params[parameter.name] ?? { kind: 'inline', value: parameter.defaultValue ?? null };
}

function renderBindings(
  ownerDocument: Document,
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const section = configSection(ownerDocument, DESIGNER_UI_TEXT.dataset.binding, 'mapping');
  if (options.roles.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataset.noBinding;
    section.appendChild(empty);
  }
  for (const role of options.roles) {
    section.appendChild(
      renderBindingRole(
        ownerDocument,
        options.descriptor,
        role,
        options.draft,
        options.bindingOpenRoleId ?? null,
      ),
    );
  }
  return section;
}

function renderBindingRole(
  ownerDocument: Document,
  descriptor: ScreenDatasetDefinition,
  role: ScreenDataBindingRole,
  draft: DesignerDatasetDraftView | undefined,
  openRoleId: string | null,
): HTMLElement {
  const roleSection = ownerDocument.createElement('div');
  roleSection.className = 'designer-dataset-binding-role';
  roleSection.dataset.datasetBindingRole = role.id;
  const roleHeading = ownerDocument.createElement('div');
  roleHeading.className = 'designer-dataset-binding-heading';
  const roleName = ownerDocument.createElement('strong');
  roleName.textContent = DESIGNER_UI_TEXT.dataset.bindingRole(role.id);
  const selected = draft?.fields[role.id] ?? [];
  const roleCount = ownerDocument.createElement('span');
  roleCount.textContent = DESIGNER_UI_TEXT.dataset.selectedFields(selected.length);
  roleHeading.append(roleName, roleCount);
  const fieldList = ownerDocument.createElement('div');
  fieldList.className = 'designer-dataset-field-list';
  fieldList.setAttribute('role', 'group');
  fieldList.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.bindingRole(role.id));
  const compatibleFields = descriptor.fields.filter((field) =>
    role.valueTypes.includes(field.valueType),
  );
  if (role.maxFields === 1) {
    const select = createDesignerSelect(ownerDocument, {
      ariaLabel: DESIGNER_UI_TEXT.dataset.bindingRole(role.id),
      className: 'designer-dataset-binding-select',
      options: [
        {
          label: DESIGNER_UI_TEXT.dataset.selectField,
          selected: selected.length === 0,
          value: '',
        },
        ...compatibleFields.map((field) => ({
          label: `${field.label} · ${field.valueType}`,
          selected: selected.includes(field.id),
          value: field.id,
        })),
      ],
      value: selected[0] ?? '',
    });
    select.dataset.datasetBindingRole = role.id;
    fieldList.appendChild(enhanceDesignerSelect(select).element);
  } else {
    const actions = ownerDocument.createElement('div');
    actions.className = 'designer-dataset-binding-role-actions';
    actions.append(
      bindingRoleAction(
        ownerDocument,
        role.id,
        'select-all',
        compatibleFields.length > role.maxFields
          ? DESIGNER_UI_TEXT.dataset.bindingSelectMaximum
          : DESIGNER_UI_TEXT.dataset.bindingSelectAll,
        selected.length === Math.min(compatibleFields.length, role.maxFields),
      ),
      bindingRoleAction(
        ownerDocument,
        role.id,
        'clear',
        DESIGNER_UI_TEXT.dataset.bindingClear,
        selected.length === 0,
      ),
    );
    roleHeading.appendChild(actions);
    fieldList.appendChild(
      bindingFieldSelect(
        ownerDocument,
        role.id,
        compatibleFields,
        selected,
        role.maxFields,
        openRoleId === role.id,
      ),
    );
  }
  if (compatibleFields.length === 0) {
    const empty = ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = DESIGNER_UI_TEXT.dataset.noCompatibleFields;
    fieldList.appendChild(empty);
  }
  roleSection.append(roleHeading, fieldList);
  return roleSection;
}

/** 限额多选：触发器芯片 + 自绘弹层（设计原型 .bind-field）；芯片 ×、选项切换都走既有绑定动作。 */
function bindingFieldSelect(
  ownerDocument: Document,
  roleId: string,
  fields: readonly ScreenDatasetDefinition['fields'][number][],
  selected: readonly string[],
  maxFields: number,
  open: boolean,
): HTMLElement {
  const roleLabel = DESIGNER_UI_TEXT.dataset.bindingRole(roleId);
  const atLimit = selected.length >= maxFields;
  const bound = fields.filter((field) => selected.includes(field.id));
  const wrapper = ownerDocument.createElement('div');
  wrapper.className = 'designer-bind-field';
  const trigger = ownerDocument.createElement('button');
  trigger.type = 'button';
  trigger.className = 'designer-bind-trigger';
  trigger.dataset.datasetBindingTrigger = roleId;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', String(open));
  trigger.setAttribute('aria-label', DESIGNER_UI_TEXT.dataset.bindingToggle(roleLabel));
  const chips = ownerDocument.createElement('span');
  chips.className = 'designer-bind-chips';
  if (bound.length === 0) {
    const placeholder = ownerDocument.createElement('span');
    placeholder.className = 'designer-bind-placeholder';
    placeholder.textContent = DESIGNER_UI_TEXT.dataset.bindingPlaceholder;
    chips.appendChild(placeholder);
  } else {
    for (const field of bound) {
      const chip = ownerDocument.createElement('span');
      chip.className = 'designer-bind-chip';
      chip.append(field.label);
      // 原型同款：触发器是按钮，芯片 × 用非按钮元素并 aria-hidden——键盘移除走触发器 Backspace。
      const remove = ownerDocument.createElement('span');
      remove.className = 'designer-bind-chip-x';
      remove.dataset.datasetBindingChipRole = roleId;
      remove.dataset.datasetBindingChipField = field.id;
      remove.setAttribute('aria-hidden', 'true');
      remove.innerHTML = designerIcon('close');
      chip.appendChild(remove);
      chips.appendChild(chip);
    }
  }
  const count = ownerDocument.createElement('span');
  count.className = 'designer-bind-count';
  count.dataset.datasetBindingCount = roleId;
  count.dataset.atLimit = String(atLimit);
  count.textContent = DESIGNER_UI_TEXT.dataset.bindingCount(selected.length, maxFields);
  const caret = ownerDocument.createElement('span');
  caret.className = 'designer-bind-caret';
  caret.innerHTML = designerIcon('chevron-down');
  trigger.append(chips, count, caret);
  const menu = ownerDocument.createElement('div');
  menu.className = 'designer-bind-menu';
  menu.dataset.datasetBindingMenu = roleId;
  menu.hidden = !open;
  const options = ownerDocument.createElement('div');
  options.className = 'designer-bind-options';
  options.setAttribute('role', 'listbox');
  options.setAttribute('aria-multiselectable', 'true');
  options.setAttribute('aria-label', roleLabel);
  for (const field of fields) {
    options.appendChild(bindingField(ownerDocument, roleId, field, selected, maxFields));
  }
  const foot = ownerDocument.createElement('div');
  foot.className = 'designer-bind-foot';
  foot.dataset.datasetBindingHint = roleId;
  foot.dataset.atLimit = String(atLimit);
  foot.textContent = atLimit
    ? DESIGNER_UI_TEXT.dataset.bindingAtLimit
    : DESIGNER_UI_TEXT.dataset.bindingLimitHint(maxFields);
  menu.append(options, foot);
  wrapper.append(trigger, menu);
  return wrapper;
}

function bindingRoleAction(
  ownerDocument: Document,
  roleId: string,
  action: 'select-all' | 'clear',
  label: string,
  disabled = false,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button designer-dataset-binding-role-action';
  button.dataset.datasetBindingRoleAction = action;
  button.dataset.datasetBindingRoleId = roleId;
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

function bindingField(
  ownerDocument: Document,
  roleId: string,
  field: ScreenDatasetDefinition['fields'][number],
  selected: readonly string[],
  maxFields: number,
): HTMLButtonElement {
  const isSelected = selected.includes(field.id);
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-bind-option';
  button.dataset.datasetBindingRoleId = roleId;
  button.dataset.datasetBindingField = field.id;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', String(isSelected));
  button.disabled = !isSelected && selected.length >= maxFields;
  const check = ownerDocument.createElement('span');
  check.className = 'designer-bind-check';
  check.innerHTML = designerIcon('check');
  const label = ownerDocument.createElement('span');
  label.className = 'designer-bind-label';
  label.textContent = field.label;
  const type = ownerDocument.createElement('span');
  type.className = 'designer-bind-type';
  type.textContent = field.valueType;
  button.append(check, label, type);
  return button;
}
