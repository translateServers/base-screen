import type { ScreenDatasetDefinition, ScreenValueRef } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { attachDesignerDateField } from '../designer-date-field-dom.js';
import { createDesignerInput, createDesignerSwitch } from '../designer-ui-primitives.js';

/**
 * 参数位的内联值编辑器。
 *
 * 只在参数当前形态是**常量**（`inline`）时出现：形态本身由取值选择器的触发器表达，
 * 这里只负责「这个常量的值是多少」。因此控件要带 `data-value-ref-inline`——它既是事件
 * 分发的地址，也是浏览器断言的定位点；`data-dataset-parameter` 保留为同一节点上的旧定位别名。
 */
export function parameterControl(
  ownerDocument: Document,
  descriptor: ScreenDatasetDefinition,
  name: string,
  current: ScreenValueRef | undefined,
): HTMLElement {
  const parameter = descriptor.parameters.find((item) => item.name === name)!;
  // 布尔参数用检查器同款开关，而不是把裸复选框塞进 30px 控件槽里。
  const input =
    parameter.valueType === 'boolean'
      ? createDesignerSwitch(ownerDocument, {
          ariaLabel: DESIGNER_UI_TEXT.dataset.parameterValueLabel(parameter.label),
        })
      : createDesignerInput(ownerDocument, {
          ariaLabel: DESIGNER_UI_TEXT.dataset.parameterValueLabel(parameter.label),
          appearance: parameter.valueType === 'number' ? 'number' : 'text',
          ...(parameter.valueType === 'date'
            ? { placeholder: DESIGNER_UI_TEXT.dataset.parameterDatePlaceholder }
            : {}),
          ...(parameter.minimum === undefined ? {} : { min: parameter.minimum }),
          ...(parameter.maximum === undefined ? {} : { max: parameter.maximum }),
        });
  input.dataset.valueRefInline = `parameter:${parameter.name}`;
  input.dataset.datasetParameter = parameter.name;
  setParameterControlValue(input, parameter, current);
  input.required = parameter.required;
  if (parameter.maxLength !== undefined) input.maxLength = parameter.maxLength;
  // 日期参数原样保留输入框为值载体，只把「输入 + 触发器 + 自绘日历」装进同一外壳。
  if (parameter.valueType === 'date') {
    return attachDesignerDateField(input, { label: parameter.label }).element;
  }
  return input;
}

export function configSection(ownerDocument: Document, title: string, step?: string): HTMLElement {
  const section = ownerDocument.createElement('section');
  section.tabIndex = -1;
  section.className = 'designer-dataset-config-section';
  section.dataset.inspectorSearchSection = 'true';
  if (step !== undefined) section.dataset.workbenchSection = step;
  const heading = ownerDocument.createElement('h4');
  heading.className = 'designer-inspector-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

export function renderActions(
  ownerDocument: Document,
  resourceUnavailable: boolean,
  bindingValid: boolean,
): HTMLElement {
  const actions = ownerDocument.createElement('div');
  actions.className = 'designer-dataset-actions';
  actions.append(
    actionButton(
      ownerDocument,
      'apply',
      DESIGNER_UI_TEXT.dataSource.apply('dataset'),
      resourceUnavailable || !bindingValid,
      'primary',
    ),
    actionButton(
      ownerDocument,
      'refresh',
      DESIGNER_UI_TEXT.dataset.refresh,
      resourceUnavailable,
      'ghost',
    ),
  );
  return actions;
}

function actionButton(
  ownerDocument: Document,
  action: string,
  text: string,
  disabled: boolean,
  variant: 'primary' | 'ghost',
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'designer-control designer-button';
  button.dataset.datasetAction = action;
  button.dataset.variant = variant;
  button.textContent = text;
  button.disabled = disabled;
  return button;
}

/**
 * 内联编辑器的初值。
 *
 * 草稿里有这个参数就以草稿为准（哪怕值是 `null`——那是用户显式清空的结果，不能被定义里的
 * 默认值悄悄盖回去）；草稿里没有（刚选中数据集、或该参数还没被写过）才退到定义默认值。
 */
function setParameterControlValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  parameter: ScreenDatasetDefinition['parameters'][number],
  current: ScreenValueRef | undefined,
): void {
  const value =
    current !== undefined && current.kind === 'inline' ? current.value : parameter.defaultValue;
  if (input instanceof HTMLInputElement && parameter.valueType === 'boolean') {
    input.checked = value === true;
    input.value = String(input.checked);
    return;
  }
  input.value = String(value ?? '');
}
