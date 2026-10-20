/**
 * 折叠分组的**唯一构造入口**（架构 §5.2.2）。
 *
 * 覆盖表（`groupOpenOverrides`）的存在理由：`syncDatasetSections` 用 `replaceWith` 换整段，
 * `<details open>` 的用户选择会随节点一起丢。**重放就在本文件里**——构造时读表写 `open`，
 * 不是"事后 restore*"（那正是本项目要消灭的模式）。
 *
 * 两条硬约束：
 * 1. `open` **绝不进** `sectionContentKey`：否则展开/收起会改内容键 → 段重建 → 节点身份与
 *    光标一起丢，段 diff 等于被自己废掉；
 * 2. `onToggle` 是**必填**字段：每个调用点都必须把它接上，漏传的表现是"表永远不写 →
 *    手动展开在段重建后丢失"，而它在单测里不会红、只会在浏览器里超时。
 */

/** 6 个 DOM 组（视觉上「数据源 + 宿主连接」合成 1 组 = 5 个视觉组）。 */
export type DesignerDataGroupKey =
  | 'source'
  | 'host-link'
  | 'mapping'
  | 'parameters'
  | 'preview'
  | 'refresh';

export type DesignerDataGroupSection = 'value' | 'source' | 'host-link' | 'preview' | 'authoring';

export interface DesignerDataGroupOptions {
  readonly ownerDocument: Document;
  readonly section: DesignerDataGroupSection;
  readonly group: DesignerDataGroupKey;
  /** 组头标题（数据源 / 字段映射 / 请求参数 / 结果预览 / 更新策略 / 宿主连接）。 */
  readonly title: string;
  /** 组头摘要：只取文档或宿主回包的既有值，不得取会话态。 */
  readonly summary: string;
  readonly defaultOpen: boolean;
  /** 覆盖表：`<section>:<group>` → open。 */
  readonly overrides: ReadonlyMap<string, boolean>;
  /**
   * 用户手动开合（写覆盖表，不重绘）。**必填**：漏传 = 表永不写入 = 手动展开必丢，
   * 且没有任何单测会红。
   */
  readonly onToggle: ((section: string, group: string, open: boolean) => void) | undefined;
}

/** 覆盖表键：段与组共同定位，避免两个段里同名的组互相串味。 */
export function groupOpenKey(
  section: DesignerDataGroupSection,
  group: DesignerDataGroupKey,
): string {
  return `${section}:${group}`;
}

/** `overrides` 命中就用用户的，否则用默认规则。 */
export function resolveGroupOpen(
  overrides: ReadonlyMap<string, boolean>,
  section: DesignerDataGroupSection,
  group: DesignerDataGroupKey,
  fallback: boolean,
): boolean {
  return overrides.get(groupOpenKey(section, group)) ?? fallback;
}

export function createDataGroup(
  options: DesignerDataGroupOptions,
  children: readonly (Node | string)[],
): HTMLDetailsElement {
  const document = options.ownerDocument;
  const details = document.createElement('details');
  details.className = 'designer-data-group';
  details.dataset.detailsGroup = options.group;
  details.dataset.dsGroupSection = options.section;
  const resolved = resolveGroupOpen(
    options.overrides,
    options.section,
    options.group,
    options.defaultOpen,
  );
  details.open = resolved;
  // `toggle` 不冒泡（不能事件委托），且**程序化改 `open` 也会触发一次**。判据是「与上一次
  // 已知状态不同」而不是「与构造时的默认值不同」：后者是快照，用户来回切两次之后就会过期
  // ——实际后果是第二次 toggle 不写表，段一重建就把用户刚展开的组收回（浏览器实测：
  // `open:false` after edit）。`last` 跟着每次真实变化走，才既有「忽略程序化赋值」，
  // 又不会漏记用户的第二次操作。
  let last = resolved;
  details.addEventListener('toggle', () => {
    if (details.open === last) return;
    last = details.open;
    options.onToggle?.(options.section, options.group, details.open);
  });

  const summary = document.createElement('summary');
  summary.className = 'designer-data-group-summary';
  const title = document.createElement('span');
  title.className = 'designer-data-group-title';
  title.textContent = options.title;
  const text = document.createElement('span');
  text.className = 'designer-data-group-summary-text';
  text.dataset.detailsGroupSummary = options.group;
  text.textContent = options.summary;
  summary.append(title, text);
  // 类名不能叫 `*-body`：`designer-styles.mjs` 用 `css.includes('body')` 拦裸选择器，
  // 任何含该子串的类名都会让检查误报为「裸 body 选择器」。
  const content = document.createElement('div');
  content.className = 'designer-data-group-content';
  content.append(...children);
  details.append(summary, content);
  return details;
}
