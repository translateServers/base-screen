import { disposeDatasetSection } from './designer-dataset-config-dom.js';
import { createDatasetSection, type DesignerDataSectionKey } from './designer-dataset-sections.js';

/**
 * 段标识 = 冻结的 5 个段 key。
 *
 * `value` 段**由外层流程渲染器拥有**（它总是存在，且不在工厂里创建），其余段都由
 * `createDatasetSection` 构造。这条所有权差异在 `syncDatasetSections` 里有对应特例分支，
 * 见那里的注释——它保护的是「切换取值方式时不丢焦点」。
 */
export type DesignerDataSectionId = DesignerDataSectionKey;

import type { DesignerDataSourcePanelOptions } from './designer-dataset-types.js';

/** 面板模型：一段内容的全部输入都在这里，diff 只读它。 */
export type DesignerDataPanelModel = DesignerDataSourcePanelOptions;

/**
 * 当前状态下应当出现的段，顺序即 DOM 顺序。
 *
 * `source` 段承担两种互斥内容：未选数据集/目录展开时是**目录列表**，选完之后是**参数与映射
 * 配置**。它们共用一个段 key，因为二者不会同时出现；拆成两个 key 会让段总数超出冻结的 5 个。
 */
export function requiredDataSections(
  model: DesignerDataPanelModel,
): readonly DesignerDataSectionId[] {
  const value = model.dataValue;
  // 「未配置」是一票否决：取值引用为空时只留取值段。首屏的唯一任务是「选数据来源」，
  // 物料数据编辑属于「已选之后」的编辑态——两套结构混在一起，用户分不清现在该干嘛。
  if (value === null) return ['value'];
  // 固定值 / 变量：值本身就是全部内容（编辑区由流程渲染器直接摆，不是段）。
  if (value.kind !== 'data-source-field') return ['value'];

  const keys: DesignerDataSectionId[] = ['value', 'source'];
  // `host-link` **有意分叉**：检查器只在通道异常时出现（正常时通道状态是噪声），
  // 工作台恒出现（右列承担通道诊断）。改动前先确认两个分支都被同步修改。
  if (model.surface === 'workbench' || channelDegraded(model)) keys.push('host-link');
  // `preview` 恒存在（引用实例时）：它的可见性由取值形态决定，不由「用户是否展开过」决定，
  // 否则一次折叠就会变成段的增删，焦点与节点身份全部失效。
  keys.push('preview', 'authoring');
  return keys;
}

/** 三条通道里任意一条不是 `ready` 就算降级（`loading` 也算：此时状态灯正要被看见）。 */
function channelDegraded(model: DesignerDataPanelModel): boolean {
  const channels = [model.link.catalog, model.link.query, model.link.variables];
  return channels.some((channel) => channel.status !== 'ready');
}

/**
 * 每段的**内容键**：只有键变了才替换这一段。
 *
 * 粒度取舍（保住上一轮「输入框节点身份」的成果）：
 * - `value` 只含取值方式的可见面（模式、可用模式、端口能力）：它与入口的禁用/选中同源；
 * - `source` 同时含**目录壳**与**配置**两侧的输入（两者互斥，同一段替换）：目录侧不含
 *   items/cursor 与查询词（查询词由输入框自己持有，写进键会让搜索框每次按键都被重建、
 *   丢焦点与 IME 组合态）；配置侧含 descriptor id、草稿、展开的绑定角色与角色声明；
 * - `preview` 只含状态/页签/开合与结果摘要，不塞完整 rows（大结果集会让键比较变贵）；
 * - `authoring` 含 `surface`：两个表面授权模型不同、渲染结果不同（检查器只读 / 工作台可
 *   编辑）。**这不是冗余维度**——不计入的话两个挂载点会互相判定「内容没变」并拒绝重建，
 *   症状是「切到工作台看到的还是只读摘要」，而没有任何断言会红。
 */
export function sectionContentKey(
  key: DesignerDataSectionId,
  model: DesignerDataPanelModel,
): string {
  switch (key) {
    case 'value':
      return stableKey([
        model.mode,
        model.availableModes,
        model.resourceAvailable,
        model.catalogAvailable,
      ]);
    case 'source':
      return stableKey([
        (model.groups ?? []).map((group) => [group.id, group.name]),
        model.groupId ?? null,
        model.catalogOpen,
        model.catalogAvailable,
        model.descriptor?.datasetId ?? null,
        model.draft ?? null,
        model.bindingOpenRoleId ?? null,
        model.roles.map((role) => [role.id, role.minFields, role.maxFields, role.valueTypes]),
        model.variables.map((variable) => [variable.id, variable.name]),
        // 检查器把三颗通道灯画在来源卡里：状态变了而键不变，灯就会停在旧状态上。
        // **目录态必须排除**：目录搜索本身就会让 `catalog` 在 loading/ready 之间跳，
        // 计入键 = 每次按键都整段重建 = 搜索框丢焦点与 IME 组合态（实测见
        // `BROWSER_HARNESS_DATASET_SEARCH_CONTINUITY_FAILED`）。目录态里卡片不可见，
        // 灯也不需要跟着变。
        model.catalogOpen
          ? 'catalog'
          : [model.link.catalog.status, model.link.query.status, model.link.variables.status],
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
      return stableKey([model.authoring, model.dirty, model.surface]);
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
    if (key === 'value') {
      // `value` 段的节点由外层流程渲染器持有：**只补内容键，永不重建**。
      // 并进工厂（`createDatasetSection`）会让 diff 开始 replaceWith 它，症状是「方向键/点击
      // 切换取值方式后焦点丢失、输入法组合态断掉」——而且没有任何断言覆盖这一点，
      // 只有手写 focus 探针能发现。改这条之前先把那条探针变成断言。
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
  return root.querySelector<HTMLElement>('.designer-inspector-data-flow-content') ?? root;
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
