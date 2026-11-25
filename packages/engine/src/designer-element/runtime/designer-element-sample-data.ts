import type { ScreenDocument } from '@base-screen/contracts';
import { isScreenComponentId } from '@base-screen/contracts';
import { listSampleValueRefs, type ScreenDocumentCommand } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

/**
 * 示例数据的设计器呈现（ADR-0112 §2.3）：画布徽标、状态栏计数与逐个定位、「保留为常量」。
 *
 * 徽标是会话叠加层：挂在画布上、跟随内容层组件的几何帧，不改文档、不进渲染器，Viewer 与发布物
 * 里都没有。「保留为常量」是用户的显式动作，去掉标记并作为一次普通事务进入历史。
 */

/** 状态栏「下一处」的游标：按元素记，文档变了也只是从头再走一遍。 */
const sampleCursor = new WeakMap<DesignerElementHost, number>();

/** 带示例数据取值的组件 id（文档顺序）。数据源参数与变量上的示例值没有画布位置，只计数不定位。 */
export function sampleComponentIds(document: ScreenDocument): readonly string[] {
  return listSampleValueRefs(document).flatMap((ref) =>
    ref.owner.kind === 'component' ? [ref.owner.id] : [],
  );
}

/**
 * 画布徽标：在内容层组件的左上角贴一个「示例数据」标签。
 * 用刚渲染的那份文档：渲染时会话里的文档可能还是上一版。
 */
export function renderSampleMarks(
  element: DesignerElementHost,
  document: ScreenDocument | undefined,
): void {
  const elementState = getDesignerElementState(element);
  const canvas = elementState.canvas;
  if (canvas === undefined) return;
  let layer = canvas.querySelector<HTMLElement>('[data-canvas-sample-marks]');
  const ids = document === undefined ? [] : sampleComponentIds(document);
  if (ids.length === 0) {
    layer?.replaceChildren();
    return;
  }
  const doc = canvas.ownerDocument;
  if (layer === null) {
    layer = doc.createElement('div');
    layer.className = 'canvas-sample-marks';
    layer.dataset.canvasSampleMarks = '';
    layer.setAttribute('aria-hidden', 'true');
    canvas.append(layer);
  }
  const content = canvas.querySelector<HTMLElement>('[data-canvas-content]');
  layer.replaceChildren(
    ...ids.flatMap((id) => {
      if (!isScreenComponentId(id)) return [];
      const source = content?.querySelector<HTMLElement>(`[data-base-screen-component-id="${id}"]`);
      if (source === null || source === undefined || source.style.display === 'none') return [];
      const badge = doc.createElement('span');
      badge.className = 'canvas-sample-badge';
      badge.dataset.sampleComponentId = id;
      badge.style.left = source.style.left;
      badge.style.top = source.style.top;
      badge.textContent = DESIGNER_UI_TEXT.sampleData.badge;
      return [badge];
    }),
  );
}

/** 状态栏：总数、「下一处」与「保留为常量」（选中里有示例数据时才出现）。 */
export function renderSampleStatus(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);
  const root = element.shadowRoot;
  const status = root?.querySelector<HTMLElement>('[data-status-sample]');
  if (status === null || status === undefined) return;
  const document = elementState.session.document;
  const total = document === undefined ? 0 : listSampleValueRefs(document).length;
  status.hidden = total === 0;
  const next = status.querySelector<HTMLButtonElement>('[data-sample-action="next"]');
  if (next !== null) next.textContent = DESIGNER_UI_TEXT.sampleData.count(total);
  const keep = status.querySelector<HTMLButtonElement>('[data-sample-action="keep"]');
  if (keep !== null) keep.hidden = selectedSampleIds(element).length === 0;
}

export function onSampleStatusClick(element: DesignerElementHost, target: Element): boolean {
  const action = target.closest<HTMLButtonElement>('[data-sample-action]')?.dataset.sampleAction;
  if (action === 'next') {
    locateNextSample(element);
    return true;
  }
  if (action === 'keep') {
    keepSelectedSamplesAsConstants(element);
    return true;
  }
  return false;
}

function locateNextSample(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  if (document === undefined) return;
  const ids = sampleComponentIds(document);
  if (ids.length === 0) return;
  const index = ((sampleCursor.get(element) ?? -1) + 1) % ids.length;
  sampleCursor.set(element, index);
  const id = ids[index]!;
  elementState.session.reduceSelection({
    type: 'replace-selection',
    componentIds: [id],
    focusedComponentId: id,
  });
  const component = document.components.find((item) => item.id === id);
  if (component !== undefined) {
    elementState.viewportController.centerOn({
      x: component.position.x + component.size.width / 2,
      y: component.position.y + component.size.height / 2,
    });
  }
  elementState.runtime.renderInteraction(element);
}

function selectedSampleIds(element: DesignerElementHost): readonly string[] {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  if (document === undefined) return [];
  const samples = new Set(sampleComponentIds(document));
  return elementState.session.interaction.selectedComponentIds.filter((id) => samples.has(id));
}

/** 「保留为常量」：去掉选中组件取值上的示例标记，值不变；一次事务、进历史、可撤销。 */
export function keepSelectedSamplesAsConstants(element: DesignerElementHost): boolean {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  const ids = selectedSampleIds(element);
  if (document === undefined || ids.length === 0) return false;
  const commands: ScreenDocumentCommand[] = ids.flatMap((id) => {
    const value = document.components.find((item) => item.id === id)?.dataValue;
    if (value?.kind !== 'inline') return [];
    return [
      {
        type: 'update-components',
        componentIds: [id],
        patch: { dataValue: { kind: 'inline', value: value.value } },
      },
    ];
  });
  if (commands.length === 0) return false;
  const result = elementState.runtime.executeDesignerTransaction(element, {
    commands,
    provenance: { source: 'manual', label: DESIGNER_UI_TEXT.sampleData.keepHistory },
  });
  if (!result.ok) elementState.runtime.emitDiagnostics(element, result.diagnostics);
  return result.ok;
}
