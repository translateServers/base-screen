import { disposeDatasetSection } from './designer-dataset-config-dom.js';
import { createDatasetSection, type DesignerDataSectionKey } from './designer-dataset-sections.js';

/**
 * 段标识。`mode` 是唯一一个由外层流程渲染器拥有的段（它总是存在，且不在工厂里创建），
 * 其余段都由 `createDatasetSection` 构造。
 */
export type DesignerDataSectionId = DesignerDataSectionKey | 'mode';

import type { DesignerDataSourcePanelOptions } from './designer-dataset-types.js';

/** 面板模型：一段内容的全部输入都在这里，diff 只读它。 */
export type DesignerDataPanelModel = DesignerDataSourcePanelOptions;

/**
 * 当前状态下应当出现的段，顺序即 DOM 顺序。
 *
 * 本轮**完全沿用现有出现规则**（`host-link` 恒显示、`config` 需要 descriptor、
 * `catalog` 与 `config` 互斥）；出现规则的调整单独一轮做，避免和 diff 机制一起改。
 */
export function requiredDataSections(
  model: DesignerDataPanelModel,
): readonly DesignerDataSectionId[] {
  const keys: DesignerDataSectionId[] = ['mode'];
  if (model.mode !== 'dataset') return keys;
  keys.push('host-link');
  if (model.catalogOpen || model.descriptor === undefined) keys.push('catalog');
  else keys.push('config', 'preview', 'authoring');
  return keys;
}

/**
 * 每段的**内容键**：只有键变了才替换这一段。
 *
 * 粒度取舍（保住上一轮「输入框节点身份」的成果）：
 * - `catalog` 只含 shell 的结构状态（分组、分组选择、开合），**不含 items/cursor，也不含
 *   查询词**：目录结果是另一个 patch 通道；查询词由输入框自己持有（浏览器探针已证明把它
 *   写进键会让搜索框每次按键都被重建、丢焦点与 IME 组合态）；
 * - `preview` 只含状态/页签/开合与结果摘要，不塞完整 rows（大结果集会让键比较变贵）；
 * - `config` 含 descriptor id、草稿、展开的绑定角色与角色声明：这些任何一项变化都必须重建。
 */
export function sectionContentKey(
  key: DesignerDataSectionId,
  model: DesignerDataPanelModel,
): string {
  switch (key) {
    case 'mode':
      return stableKey([
        model.mode,
        model.availableModes,
        model.resourceAvailable,
        model.catalogAvailable,
      ]);
    case 'catalog':
      return stableKey([
        (model.groups ?? []).map((group) => [group.id, group.name]),
        model.groupId ?? null,
        model.catalogOpen,
        model.catalogAvailable,
      ]);
    case 'config':
      return stableKey([
        model.descriptor?.datasetId ?? null,
        model.draft ?? null,
        model.bindingOpenRoleId ?? null,
        model.roles.map((role) => [role.id, role.minFields, role.maxFields, role.valueTypes]),
        model.variables.map((variable) => [variable.id, variable.name]),
      ]);
    case 'preview':
      return stableKey([
        model.preview.status,
        model.preview.tab,
        model.preview.open,
        model.preview.message,
        previewSummary(model),
      ]);
    case 'authoring':
      return stableKey([model.authoring, model.dirty]);
    default:
      return stableKey([
        model.link.catalog.status,
        model.link.query.status,
        model.link.variables.status,
        model.link.catalog.detail ?? null,
        model.link.query.detail ?? null,
        model.link.variables.detail ?? null,
      ]);
  }
}

/**
 * 按段集合 diff 同步面板。
 *
 * 三条规则：
 * 1. 段集合与顺序以 `requiredDataSections` 为准：缺的建、多的删；
 * 2. 两端都有的段**只在内容键变化时**替换——键没变就完全不碰，节点身份、光标、IME 组合态都靠它；
 * 3. 焦点按逻辑地址四级回落（同段同控件 → 同段首个可聚焦 → 同段容器 → 面板根），绝不落到 body。
 */
export function syncDatasetSections(root: HTMLElement, model: DesignerDataPanelModel): void {
  // 只对**已经渲染过**的面板做 diff：没有任何段的 root 说明这块还没画过（或不是数据面板），
  // 创建段缺少宿主上下文，交给整块渲染处理。
  if (root.querySelector('[data-ds-section]') === null) return;
  const keys = requiredDataSections(model);
  const focus = captureFocus(root, keys);
  const container = resolveContainer(root, keys);
  // 从后往前安置：这样每一步的「下一个已存在段」都已经就位，插入位置一次算对。
  let reference: Element | null = null;
  for (let index = keys.length - 1; index >= 0; index--) {
    const key = keys[index]!;
    const existing = findSection(root, key);
    const nextKey = sectionContentKey(key, model);
    if (key === 'mode') {
      // 模式段的节点由外层流程渲染器持有：只补内容键，不重建（与旧 patch 行为一致）。
      if (existing !== null) {
        existing.dataset.dsContentKey = nextKey;
        markFocusable(existing);
        reference = existing;
      }
      continue;
    }
    if (existing === null) {
      const created = createDatasetSection(key, model);
      if (created !== undefined) {
        created.dataset.dsContentKey = nextKey;
        markFocusable(created);
        container.insertBefore(created, reference);
        reference = created;
      }
      continue;
    }
    if (existing.dataset.dsContentKey !== nextKey) {
      const next = createDatasetSection(key, model);
      if (next !== undefined) {
        next.dataset.dsContentKey = nextKey;
        markFocusable(next);
        // 段内的取值选择器把浮层挂在段之外：先销毁，再换节点，否则浮层会留在 overlay 宿主上。
        disposeDatasetSection(existing);
        existing.replaceWith(next);
        reference = next;
        continue;
      }
      existing.dataset.dsContentKey = nextKey;
    }
    reference = existing;
  }
  for (const stale of [...root.querySelectorAll<HTMLElement>('[data-ds-section]')]) {
    const key = stale.dataset.dsSection;
    if (key !== undefined && (keys as readonly string[]).includes(key)) continue;
    disposeDatasetSection(stale);
    stale.remove();
  }
  restoreFocus(root, focus, keys);
}

/**
 * 首次渲染后给已存在的段补内容键。
 *
 * 不补的话，第一次 patch 会把刚渲染出来的段整体判成「内容变化」并全部重建，焦点又丢一次。
 */
export function stampDataSectionKeys(root: HTMLElement, model: DesignerDataPanelModel): void {
  for (const section of root.querySelectorAll<HTMLElement>('[data-ds-section]')) {
    const key = section.dataset.dsSection as DesignerDataSectionId | undefined;
    if (key === undefined) continue;
    section.dataset.dsContentKey = sectionContentKey(key, model);
    markFocusable(section);
  }
}

interface FocusAddress {
  readonly section: string | undefined;
  readonly control: string | undefined;
  readonly index: number;
  readonly insideRoot: boolean;
}

function captureFocus(root: HTMLElement, keys: readonly DesignerDataSectionId[]): FocusAddress {
  const ownerDocument = root.ownerDocument;
  const active = ownerDocument?.activeElement as HTMLElement | null | undefined;
  if (active == null || active === ownerDocument?.body || !root.contains(active)) {
    return { section: undefined, control: undefined, index: -1, insideRoot: false };
  }
  const sectionElement = active.closest<HTMLElement>('[data-ds-section]');
  const section = sectionElement?.dataset.dsSection;
  return {
    section,
    control: controlKeyOf(active),
    index: section === undefined ? -1 : keys.indexOf(section as DesignerDataSectionId),
    insideRoot: true,
  };
}

/**
 * 焦点四级回落：同 `{段, 控件}` → 同段首个可聚焦 → 同下标段的容器 → 面板根。
 *
 * 命中即停，绝不把焦点丢给 body（否则下一次键盘操作会落到文档上）。
 */
function restoreFocus(
  root: HTMLElement,
  focus: FocusAddress,
  keys: readonly DesignerDataSectionId[],
): void {
  if (!focus.insideRoot) return;
  const sections = [...root.querySelectorAll<HTMLElement>('[data-ds-section]')];
  if (sections.length === 0) return;
  if (focus.section !== undefined && focus.control !== undefined) {
    const exact = findControl(root, focus.section, focus.control);
    if (exact !== null) {
      exact.focus();
      return;
    }
  }
  if (focus.section !== undefined) {
    const same = findSection(root, focus.section);
    if (same !== null) {
      const focusable = same.querySelector<HTMLElement>('[data-ds-focusable]');
      if (focusable !== null) {
        focusable.focus();
        return;
      }
      same.tabIndex = -1;
      same.focus();
      return;
    }
  }
  const fallbackIndex = focus.index >= 0 ? focus.index : Math.min(keys.length - 1, 0);
  const fallback = sections[Math.min(fallbackIndex, sections.length - 1)];
  if (fallback !== undefined) {
    fallback.tabIndex = -1;
    fallback.focus();
    return;
  }
  root.tabIndex = -1;
  root.focus();
}

function findSection(root: HTMLElement, key: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-ds-section="${key}"]`);
}

function findControl(root: HTMLElement, section: string, control: string): HTMLElement | null {
  const container = findSection(root, section);
  if (container === null) return null;
  // 用与采集相同的推导（显式 `data-ds-control` 或既有稳定数据属性），
  // 否则「同段同控件」这一级永远命中不了，焦点会掉到段内第一个控件上。
  for (const candidate of container.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, [tabindex]',
  )) {
    if (controlKeyOf(candidate) === control) return candidate;
  }
  return null;
}

/**
 * 控件逻辑地址：优先显式 `data-ds-control`，否则退回现有的稳定数据属性。
 *
 * 这样不必给每个工厂都加一遍属性，也能让「参数输入框 / 绑定触发器 / 预览页签 / 作者设置」
 * 这些跨重建保持焦点的控件拿到同一个键。
 */
function controlKeyOf(node: HTMLElement): string | undefined {
  const explicit = node.dataset.dsControl;
  if (explicit !== undefined) return explicit;
  return (
    node.dataset.datasetAction ??
    node.dataset.datasetPreviewTab ??
    node.dataset.datasetParameter ??
    node.dataset.datasetBindingTrigger ??
    node.dataset.datasetBindingRole ??
    node.dataset.datasetEditorMode ??
    node.dataset.datasetAuthoringAction ??
    node.dataset.dataSourceModeSelect ??
    undefined
  );
}

function markFocusable(section: HTMLElement): void {
  for (const candidate of section.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, [tabindex]',
  )) {
    candidate.dataset.dsFocusable = 'true';
  }
  section.tabIndex = -1;
}

function resolveContainer(root: HTMLElement, keys: readonly DesignerDataSectionId[]): HTMLElement {
  for (const key of keys) {
    const existing = findSection(root, key);
    if (existing?.parentElement != null) return existing.parentElement;
  }
  return root.querySelector<HTMLElement>('.designer-datav-data-flow-content') ?? root;
}

function previewSummary(model: DesignerDataPanelModel): string {
  const value = model.preview.rawValue;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value === undefined ? 'none' : 'scalar';
  }
  const rows = (value as { readonly rows?: unknown }).rows;
  const fields = (value as { readonly fields?: unknown }).fields;
  return `${Array.isArray(rows) ? rows.length : 0}:${Array.isArray(fields) ? fields.length : 0}`;
}

/** 稳定序列化：对象按 key 排序输出，数组保序，保证同一输入永远同一串。 */
function stableKey(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
