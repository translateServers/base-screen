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
import { createDataGroup } from './designer-data-group-dom.js';
import { isDesignerDatasetBindingValid } from './designer-dataset-binding.js';
import {
  configSection,
  parameterControl,
  renderActions,
} from './designer-dataset-config-controls.js';
import {
  countUnfilledRequiredParameters,
  type DesignerDatasetConfigurationOptions,
  type DesignerDatasetDraftView,
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

/** 组内不再重复标题：组头已写「字段映射 / 请求参数」。容器保留（`data-workbench-section` 是锚点）。 */
function withoutSectionHeading(section: HTMLElement): HTMLElement {
  section.querySelector('.designer-inspector-section-title')?.remove();
  return section;
}

/** 字段映射组头摘要：已映射字段总数。 */
/**
 * 「输出字段」的**唯一**文案来源：`维度 分类 · 指标 金额`。组头与组内那一行都读它。
 * 两处各自拼字符串就会出现旧问题：组头只有裸数字（与组名「字段映射」重复），
 * 组内又列一遍同样的角色与字段名。一个函数同时解决这两件事。
 */
function mappingSummary(options: DesignerDatasetConfigurationOptions): string {
  const parts = options.roles.flatMap((role) => {
    const selected = options.draft?.fields[role.id] ?? [];
    if (selected.length === 0) return [];
    const labels = selected.map(
      (id) => options.descriptor.fields.find((field) => field.id === id)?.label ?? id,
    );
    return [`${DESIGNER_UI_TEXT.dataset.bindingRole(role.id)} ${labels.join('\u3001')}`];
  });
  return parts.length === 0 ? DESIGNER_UI_TEXT.data.groups.mappingEmpty : parts.join(' \u00b7 ');
}

/** 参数位的取值文案用设计稿的「固定值」，与数据集/变量术语区分。 */
const PARAMETER_REF_TEXT = {
  ...DESIGNER_UI_TEXT.data.ref,
  tab: { ...DESIGNER_UI_TEXT.data.ref.tab, inline: DESIGNER_UI_TEXT.dataset.literal },
};

export function renderDesignerDatasetConfiguration(
  options: DesignerDatasetConfigurationOptions,
): HTMLElement {
  const ownerDocument = options.panel.ownerDocument;
  const details = ownerDocument.createElement('div');
  details.dataset.datasetDescriptor = 'true';
  details.dataset.dsSection = 'source';
  details.className = 'designer-dataset-descriptor';
  // `source` 段内是 3 个折叠组（数据源 / 字段映射 / 请求参数）。组头摘要只取文档与草稿里的
  // 既有值；目录态不走这里（目录不是折叠组）。
  const overrides = options.groupOpenOverrides ?? new Map<string, boolean>();
  const unfilledParameters = countUnfilledRequiredParameters(options.descriptor, options.draft);
  details.append(
    createDataGroup(
      {
        ownerDocument,
        section: 'source',
        group: 'source',
        title: DESIGNER_UI_TEXT.data.groups.source,
        summary: options.descriptor.name,
        defaultOpen: true,
        overrides,
        onToggle: options.onToggleGroup,
      },
      [renderDatasetSummary(ownerDocument, options.descriptor)],
    ),
    createDataGroup(
      {
        ownerDocument,
        section: 'source',
        group: 'mapping',
        title: DESIGNER_UI_TEXT.data.groups.mapping,
        summary: mappingSummary(options),
        defaultOpen: true,
        overrides,
        onToggle: options.onToggleGroup,
      },
      [withoutSectionHeading(renderBindings(ownerDocument, options))],
    ),
    createDataGroup(
      {
        ownerDocument,
        section: 'source',
        group: 'parameters',
        title: DESIGNER_UI_TEXT.data.groups.parameters,
        summary:
          unfilledParameters > 0
            ? DESIGNER_UI_TEXT.dataSource.parametersSummary(
                options.descriptor.parameters.length,
                unfilledParameters,
              )
            : DESIGNER_UI_TEXT.dataSource.parametersFilled(options.descriptor.parameters.length),
        defaultOpen: unfilledParameters > 0,
        overrides,
        onToggle: options.onToggleGroup,
      },
      [withoutSectionHeading(renderParameters(ownerDocument, options))],
    ),
  );
  // 没有参数时整组不渲染（不出空标题）。
  if (options.descriptor.parameters.length === 0) {
    details.querySelector('[data-details-group="parameters"]')?.remove();
  }
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
  const name = ownerDocument.createElement('strong');
  name.textContent = descriptor.name;
  title.append(name);
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
  // 绑定摘要已搬到 `mapping` 组内的「输出字段」一行：它原先嵌在这张卡片里，既与
  // 「字段映射」组内容重复（同义），又形成"卡片套卡片"。信息等价，只是换了位置。
  return summary;
}

/**
 * 参数段：每行 = 标签 + 取值方式两段开关 + 一整行取值控件。
 *
 * 形态只由开关表达（固定值 / 变量），picker 不再兼任形态下拉：固定值时行内是值编辑器，
 * 右侧 `{ }` 是「改绑变量」的入口；变量时整行是一枚可点击的变量芯片 + 清除。这样
 * 「这个参数是常量还是变量」和「常量是多少 / 变量叫什么」各自只有一个可见答案。
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
    const current = currentParameterRef(options.draft, parameter.name);
    const mode = current !== null && current.kind === 'variable' ? 'variable' : 'inline';
    const errorText =
      parameter.required && current === null
        ? DESIGNER_UI_TEXT.dataSource.parameterRequired(parameter.label)
        : '';
    const field = ownerDocument.createElement('div');
    field.className = 'designer-field designer-dataset-parameter';
    field.dataset.datasetParameterRow = parameter.name;

    const head = ownerDocument.createElement('div');
    head.className = 'designer-dataset-parameter-head';
    const labelText = ownerDocument.createElement('span');
    labelText.className = 'designer-field-label designer-dataset-parameter-label';
    labelText.textContent = parameter.label;
    if (parameter.required) {
      const required = ownerDocument.createElement('span');
      required.className = 'designer-field-required';
      required.setAttribute('aria-hidden', 'true');
      required.textContent = '*';
      labelText.appendChild(required);
    }
    const modeGroup = ownerDocument.createElement('div');
    modeGroup.className = 'designer-segmented designer-dataset-parameter-mode';
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute(
      'aria-label',
      DESIGNER_UI_TEXT.dataset.parameterModeLabel(parameter.label),
    );
    const fixedButton = parameterModeButton(
      ownerDocument,
      'inline',
      DESIGNER_UI_TEXT.dataset.literal,
      mode === 'inline',
    );
    const variableButton = parameterModeButton(
      ownerDocument,
      'variable',
      DESIGNER_UI_TEXT.dataset.variable,
      mode === 'variable',
    );
    modeGroup.append(fixedButton, variableButton);
    head.append(labelText, modeGroup);

    const control = ownerDocument.createElement('div');
    control.className = 'designer-dataset-parameter-control';
    control.dataset.datasetParameterControl = parameter.name;
    control.dataset.mode = mode;
    if (errorText !== '') control.dataset.invalid = 'true';

    const picker = mountValueRefPicker({
      ownerDocument,
      text: PARAMETER_REF_TEXT,
      input: datasetParameterPickerInput(current, options.variables),
      controlKey: `parameter:${parameter.name}`,
      ariaLabel: DESIGNER_UI_TEXT.dataset.parameterVariableLabel(parameter.label),
      anchor: control,
      popoverHost: options.overlayHost,
      onSelect: (ref) => options.onSelectParameter?.(parameter.name, ref),
    });
    registerSectionDisposer(section, picker.dispose);

    if (mode === 'inline') {
      const editor = parameterControl(
        ownerDocument,
        options.descriptor,
        parameter.name,
        current ?? undefined,
      );
      if (parameter.required) {
        editor
          .querySelector<HTMLElement>('input, select, textarea')
          ?.setAttribute('aria-required', 'true');
      }
      control.appendChild(editor);
    }
    control.appendChild(picker.element);
    if (mode === 'variable') {
      const clear = ownerDocument.createElement('button');
      clear.type = 'button';
      clear.className = 'designer-dataset-parameter-clear';
      clear.dataset.datasetParameterClear = parameter.name;
      clear.setAttribute(
        'aria-label',
        DESIGNER_UI_TEXT.dataset.parameterClearVariable(parameter.label),
      );
      clear.innerHTML = designerIcon('close');
      clear.addEventListener('click', () => {
        options.onSelectParameter?.(parameter.name, { kind: 'inline', value: null });
      });
      control.appendChild(clear);
    }
    field.append(head, control);

    if (errorText !== '') {
      const error = ownerDocument.createElement('span');
      error.className = 'designer-field-message designer-dataset-parameter-error';
      error.id = `designer-dataset-parameter-error-${parameter.name.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      error.dataset.datasetParameterError = 'true';
      error.setAttribute('role', 'alert');
      error.textContent = errorText;
      const editorControl = control.querySelector<HTMLElement>('input, select, textarea');
      if (editorControl !== null) {
        editorControl.setAttribute('aria-invalid', 'true');
        editorControl.setAttribute('aria-describedby', error.id);
      }
      field.appendChild(error);
    }

    fixedButton.addEventListener('click', () => {
      if (mode === 'inline') return;
      options.onSelectParameter?.(parameter.name, { kind: 'inline', value: null });
    });
    // 变量方式只有「选中一个变量」这一种落地：按钮与行内 `{ }` 打开的是同一个只列变量的浮层。
    // 走真实点击（而不是直接 picker.open）是为了让面板事件层照常取消未触发的自动应用。
    variableButton.addEventListener('click', () => {
      picker.element.querySelector<HTMLButtonElement>('[data-value-ref-trigger]')?.click();
    });

    section.appendChild(field);
  }
  return section;
}

function parameterModeButton(
  ownerDocument: Document,
  mode: 'inline' | 'variable',
  label: string,
  pressed: boolean,
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-segmented-option designer-dataset-parameter-mode-option';
  button.dataset.datasetParameterMode = mode;
  button.setAttribute('aria-pressed', String(pressed));
  button.textContent = label;
  return button;
}

/**
 * 参数当前生效的取值引用；`null` = 这个参数还没有任何取值。
 *
 * 什么时候会是 `null`：参数既没有旧文档值、也没有 `defaultValue`（`createDesignerDatasetDraft`
 * 只给有默认值的参数建条目）。这时**不能**替用户编一个内联值：
 * - 触发器显示「选择取值」（picker 的空态文案），提示这里还没选；
 * - 内联编辑器不渲染（没有值可编辑）；
 * - 必填参数会被事务的必填校验拦下并报 `HOST_DATASET_PARAMETER_INVALID`，所以「应用」按不动。
 *
 * 这是既有行为，不是缺陷：把空值悄悄补成默认值/空串，会让「必填参数没填」这件事从界面上消失。
 */
function currentParameterRef(
  draft: DesignerDatasetDraftView | undefined,
  name: string,
): ScreenValueRef | null {
  return draft?.params[name] ?? null;
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
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-bind-actions';
  actions.append(
    bindingRoleAction(
      ownerDocument,
      roleId,
      'select-all',
      fields.length > maxFields
        ? DESIGNER_UI_TEXT.dataset.bindingSelectMaximum
        : DESIGNER_UI_TEXT.dataset.bindingSelectAll,
      selected.length === Math.min(fields.length, maxFields),
    ),
    bindingRoleAction(
      ownerDocument,
      roleId,
      'clear',
      DESIGNER_UI_TEXT.dataset.bindingClear,
      selected.length === 0,
    ),
  );
  menu.append(options, actions, foot);
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
