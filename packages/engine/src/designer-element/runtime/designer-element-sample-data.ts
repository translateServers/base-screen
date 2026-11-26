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
  const locate = target.closest<HTMLElement>('[data-sample-locate]')?.dataset.sampleLocate;
  if (locate !== undefined) {
    closeSampleBlockedDialog(element);
    locateSample(element, locate);
    return true;
  }
  if (
    target.closest('[data-sample-blocked-close]') !== null ||
    target.classList?.contains('sample-blocked-layer') === true
  ) {
    closeSampleBlockedDialog(element);
    return true;
  }
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
  locateSample(element, ids[index]!);
}

/** 选中并居中一个组件。 */
function locateSample(element: DesignerElementHost, id: string): void {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  if (document === undefined) return;
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

/**
 * 发布被示例数据拦截时的逐项列表（ADR-0112 §2.3）：哪些组件还带着示例数据，点一项定位到画布。
 *
 * 数据源参数与变量上的示例值没有画布位置，只计数。弹层不提供「强制发布」——出路只有绑定数据集
 * 或显式保留为常量，两者都在检查器数据段与状态栏里。
 */
export function openSampleBlockedDialog(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  const root = element.shadowRoot?.querySelector<HTMLElement>('.designer');
  if (document === undefined || root === null || root === undefined) return;
  const refs = listSampleValueRefs(document);
  if (refs.length === 0) return;
  const text = DESIGNER_UI_TEXT.sampleData;
  const doc = root.ownerDocument;
  let host = root.querySelector<HTMLElement>('[data-designer-overlay-host]');
  if (host === null) {
    host = doc.createElement('div');
    host.className = 'designer-overlay-host';
    host.dataset.designerOverlayHost = 'true';
    root.appendChild(host);
  }
  host.querySelector('[data-sample-blocked]')?.remove();

  const layer = doc.createElement('div');
  layer.className = 'sample-blocked-layer';
  layer.dataset.sampleBlocked = '';
  const card = doc.createElement('section');
  card.className = 'sample-blocked-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'sample-blocked-title');
  const title = doc.createElement('h2');
  title.id = 'sample-blocked-title';
  title.className = 'sample-blocked-title';
  title.textContent = text.publishBlockedTitle(refs.length);
  const hint = doc.createElement('p');
  hint.className = 'sample-blocked-hint';
  hint.textContent = text.publishBlockedHint;
  const list = doc.createElement('ul');
  list.className = 'sample-blocked-list';
  const seen = new Set<string>();
  let others = 0;
  for (const ref of refs) {
    if (ref.owner.kind !== 'component') {
      others += 1;
      continue;
    }
    if (seen.has(ref.owner.id)) continue;
    seen.add(ref.owner.id);
    const component = document.components.find((item) => item.id === ref.owner.id);
    const item = doc.createElement('li');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'sample-blocked-item';
    button.dataset.sampleLocate = ref.owner.id;
    const name = doc.createElement('span');
    name.className = 'sample-blocked-name';
    name.textContent = component?.name ?? ref.owner.id;
    const meta = doc.createElement('span');
    meta.className = 'sample-blocked-meta';
    meta.textContent = component?.type ?? '';
    button.append(name, meta);
    item.appendChild(button);
    list.appendChild(item);
  }
  card.append(title, hint, list);
  if (others > 0) {
    const other = doc.createElement('p');
    other.className = 'sample-blocked-hint';
    other.textContent = text.publishBlockedOther(others);
    card.appendChild(other);
  }
  const footer = doc.createElement('footer');
  footer.className = 'sample-blocked-footer';
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'designer-control designer-button';
  close.dataset.variant = 'primary';
  close.dataset.sampleBlockedClose = '';
  close.textContent = text.publishBlockedClose;
  footer.appendChild(close);
  card.appendChild(footer);
  layer.appendChild(card);
  host.appendChild(layer);
  close.focus();
}

export function closeSampleBlockedDialog(element: DesignerElementHost): void {
  element.shadowRoot?.querySelector('[data-sample-blocked]')?.remove();
}
