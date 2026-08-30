import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';
import {
  type BaseScreenMaterialLibraryGrouping,
  materialLibraryGroupMaterialTypes,
} from '../../../common/operations/material-library/material-library-grouping.js';
import type { BaseScreenResolvedMaterialLibraryItem } from '../../../common/operations/material-library/material-library-items.js';
import {
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryState,
} from '../../../common/operations/material-library/material-library-state.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';

// 物料目录中未显式声明 libraryVisible 的条目默认可见（ADR-0021 语义）。
type MaterialLibraryRenderable =
  | BaseScreenMaterialCatalogEntry
  | BaseScreenResolvedMaterialLibraryItem;

export function visibleLibraryMaterials(
  materials: readonly MaterialLibraryRenderable[],
): readonly BaseScreenResolvedMaterialLibraryItem[] {
  return materials
    .map(normalizeLibraryItem)
    .filter((entry) => entry.manifest.libraryVisible !== false);
}

// 分类稳定排序：去重后按 localeCompare 排序，保证每次渲染顺序一致。
export function materialLibraryCategories(
  materials: readonly MaterialLibraryRenderable[],
): readonly string[] {
  return [...new Set(materials.map((entry) => entry.manifest.category))].sort((left, right) =>
    left.localeCompare(right),
  );
}

// 目录状态到有界宿主动作的映射（ADR-0031）：面板只发事件，不做联网。
export function materialLibraryActions(
  status: BaseScreenMaterialLibraryState['status'],
): readonly BaseScreenMaterialLibraryAction[] {
  switch (status) {
    case 'loading':
    case 'ready':
      return [];
    case 'offline':
    case 'error':
      return ['retry'];
    case 'partial':
      return ['retry', 'details'];
    case 'update-available':
      return ['reload'];
  }
}

// 缩略图图标：从分类名按关键词确定性派生；无匹配时回退通用网格图标。
// 分类名是宿主定义的任意字符串，规则仅作展示优化，不进入任何契约。
// 调用方可传入「分类 + type」组合串，让 base.chart 之类的 type 也能命中关键词。
const MATERIAL_CATEGORY_ICON_RULES: readonly {
  readonly test: RegExp;
  readonly icon: DesignerIconName;
}[] = [
  // 中文关键词以 Unicode 转义书写：browser 树禁止内联 CJK 字面量（check-designer-ui）。
  { test: /\u56fe[\u8868\u7b7e]|chart|echarts|graph/i, icon: 'chart' },
  { test: /\u8868[\u683c\u5355]|table/i, icon: 'table' },
  { test: /\u5730[\u56fe\u7406]|map/i, icon: 'map' },
  { test: /\u5a92[\u4f53\u8d44]|\u56fe[\u7247\u50cf]|image|video|media|audio/i, icon: 'image' },
  { test: /\u6587[\u5b57\u672c]|text/i, icon: 'text' },
  { test: /\u5bb9\u5668|\u7ec4|contain|group/i, icon: 'container' },
  { test: /\u88c5\u9970|decor|sparkle/i, icon: 'sparkle' },
  {
    test: /\u77e9\u5f62|\u692d\u5706|\u56fe\u5f62|\u57fa\u7840|rect|ellipse|shape|basic/i,
    icon: 'shapes',
  },
];

export function materialCategoryIcon(category: string): DesignerIconName {
  for (const rule of MATERIAL_CATEGORY_ICON_RULES) {
    if (rule.test.test(category)) return rule.icon;
  }
  return 'grid';
}

// 缩略图色相：FNV-1a 哈希到 0-359，短分类名（含 CJK）也能拉开色相差异；
// 深浅主题共用同一色相（CSS hsl 消费）。
export function materialCategoryHue(category: string): number {
  let hash = 0x811c9dc5;
  for (const char of category) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

// 未配置宿主分组时保留 catalog 顺序；分组模式按宿主树和 materialTypes 声明顺序输出卡片。
export function orderedMaterialLibraryMaterials(
  materials: readonly MaterialLibraryRenderable[],
  grouping: BaseScreenMaterialLibraryGrouping | undefined,
): readonly BaseScreenResolvedMaterialLibraryItem[] {
  const visible = visibleLibraryMaterials(materials);
  if (grouping === undefined) return visible;
  const byType = new Map<string, BaseScreenResolvedMaterialLibraryItem[]>();
  for (const item of visible) {
    const bucket = byType.get(item.materialType) ?? [];
    bucket.push(item);
    byType.set(item.materialType, bucket);
  }
  return materialLibraryGroupMaterialTypes(grouping).flatMap((type) => byType.get(type) ?? []);
}

// 填充物料库：卡片网格、兼容分类 chips、宿主分组导航、面板数量徽标与目录状态投影一次完成。
export function populateMaterialLibrary(
  layout: ParentNode,
  materials: readonly MaterialLibraryRenderable[],
  materialLibraryState?: BaseScreenMaterialLibraryState,
  materialLibraryGrouping?: BaseScreenMaterialLibraryGrouping,
): void {
  const visible = visibleLibraryMaterials(materials);
  const ordered = orderedMaterialLibraryMaterials(materials, materialLibraryGrouping);
  const grid = layout.querySelector<HTMLElement>('[data-material-grid]');
  if (grid !== null) {
    grid.replaceChildren();
    for (const entry of ordered) {
      grid.appendChild(createMaterialCard(grid.ownerDocument, entry));
    }
  }
  const categories = materialLibraryCategories(visible);
  const categoryRail = layout.querySelector<HTMLElement>('[data-material-categories]');
  if (categoryRail !== null) {
    categoryRail.replaceChildren();
    if (materialLibraryGrouping === undefined) {
      for (const category of categories) {
        const button = categoryRail.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'designer-control designer-button material-category-chip';
        button.dataset.materialCategoryFilter = category;
        button.ariaPressed = 'false';
        // 图标 + 文字分段：图标装饰性 aria-hidden，可访问名称仍由文字标签提供。
        const glyph = categoryRail.ownerDocument.createElement('span');
        glyph.className = 'material-category-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.innerHTML = designerIcon(materialCategoryIcon(category));
        const label = categoryRail.ownerDocument.createElement('span');
        label.className = 'material-category-label';
        label.textContent = category;
        button.append(glyph, label);
        categoryRail.appendChild(button);
      }
    }
    categoryRail.hidden = materialLibraryGrouping !== undefined || categories.length < 2;
  }
  const count = layout.querySelector<HTMLElement>('[data-material-count]');
  if (count !== null) {
    count.textContent = String(visible.length);
    count.ariaLabel = DESIGNER_UI_TEXT.leftPanelCount(DESIGNER_UI_TEXT.materials, visible.length);
    count.dataset.materialTotal = String(visible.length);
  }
  renderMaterialLibraryState(layout, materialLibraryState);
}

export function renderMaterialLibraryState(
  layout: ParentNode,
  state: BaseScreenMaterialLibraryState | undefined,
): void {
  for (const card of layout.querySelectorAll<HTMLElement>('[data-material-card]')) {
    card.removeAttribute('data-material-draft');
    card.removeAttribute('data-material-unavailable');
    const button = card.querySelector<HTMLButtonElement>('[data-material-type]');
    if (button !== null) {
      button.disabled = false;
      button.draggable = true;
    }
    renderMaterialBadge(card, 'draft', false, DESIGNER_UI_TEXT.materialDraft);
    renderMaterialBadge(card, 'unavailable', false, DESIGNER_UI_TEXT.materialUnavailable);
  }
  if (state === undefined) return;

  const draftTypes = new Set(state.draftTypes ?? []);
  const unavailableTypes = new Set(state.unavailableTypes ?? []);
  for (const card of layout.querySelectorAll<HTMLElement>('[data-material-card]')) {
    const type = card.dataset.materialType ?? '';
    const draft = draftTypes.has(type);
    const unavailable = unavailableTypes.has(type);
    card.toggleAttribute('data-material-draft', draft);
    card.toggleAttribute('data-material-unavailable', unavailable);
    const button = card.querySelector<HTMLButtonElement>('[data-material-type]');
    if (button !== null) {
      button.disabled = unavailable;
      button.draggable = !unavailable;
    }
    renderMaterialBadge(card, 'draft', draft, DESIGNER_UI_TEXT.materialDraft);
    renderMaterialBadge(card, 'unavailable', unavailable, DESIGNER_UI_TEXT.materialUnavailable);
  }
}

// 缩略图网格卡片：预览缩略图（分类图标 + 确定性色相）+ 名称 + type + 悬浮收藏星标。
// 卡片可点击与拖拽添加（dragstart 由 DesignerPanelController 写入 dataTransfer）。
function createMaterialCard(
  ownerDocument: Document,
  entry: BaseScreenResolvedMaterialLibraryItem,
): HTMLElement {
  const wrap = ownerDocument.createElement('div');
  wrap.className = 'material-card-wrap';
  wrap.dataset.materialCard = entry.id;
  wrap.dataset.materialType = entry.materialType;
  wrap.dataset.materialCategory = entry.manifest.category;
  const card = ownerDocument.createElement('button');
  card.type = 'button';
  card.className = 'designer-control designer-button material-card';
  card.dataset.materialType = entry.materialType;
  card.dataset.materialItemId = entry.id;
  card.draggable = true;
  // 可访问名称用 aria-label（名称与 type 已可见，不重复加 title，避免与工具按钮的 title 命中冲突）。
  card.ariaLabel = DESIGNER_UI_TEXT.addMaterial(entry.manifest.name);
  const thumb = ownerDocument.createElement('span');
  thumb.className = 'material-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  thumb.style.setProperty('--material-hue', String(materialCategoryHue(entry.manifest.category)));
  thumb.innerHTML = designerIcon(
    materialCategoryIcon(`${entry.manifest.category} ${entry.materialType}`),
  );
  const cover = entry.manifest.cover;
  if (cover !== undefined) {
    thumb.appendChild(createMaterialCoverImage(thumb.ownerDocument, cover, thumb));
  }
  // 名称与类型分层呈现；类型的 title 为窄面板中的完整标识入口，名称沿用卡片可访问名称。
  const meta = ownerDocument.createElement('span');
  meta.className = 'material-card-meta';
  const name = ownerDocument.createElement('span');
  name.className = 'material-name';
  name.textContent = entry.manifest.name;
  const type = ownerDocument.createElement('span');
  type.className = 'material-type';
  type.textContent = entry.materialType;
  type.setAttribute('title', entry.materialType);
  meta.append(name, type);
  card.append(thumb, meta);
  const favorite = ownerDocument.createElement('button');
  favorite.type = 'button';
  favorite.className = 'designer-control designer-button material-favorite';
  favorite.dataset.materialFavorite = entry.id;
  favorite.ariaLabel = DESIGNER_UI_TEXT.favoriteMaterial(entry.manifest.name);
  favorite.ariaPressed = 'false';
  favorite.innerHTML = designerIcon('star');
  wrap.append(card, favorite);
  return wrap;
}

function normalizeLibraryItem(
  entry: MaterialLibraryRenderable,
): BaseScreenResolvedMaterialLibraryItem {
  if ('id' in entry && 'materialType' in entry) return entry;
  return {
    id: entry.manifest.type,
    materialType: entry.manifest.type,
    manifest: entry.manifest,
  };
}

// 宿主封面（ADR-0040）：校验后的 URL 以属性赋值写入 img.src，不 fetch、不预取、不代理；
// load 后由 CSS 以 opacity 过渡显现，error 时移除图片、恢复确定性占位图标。
// 加载标记同时写到图片自身与缩略图容器：前者驱动封面显现，后者驱动占位图标淡出
// （后代选择器，与 DOM 顺序无关）。
//
// 自适应适配（ADR-0041）：load 后按「容器 vs 图片自然尺寸」做一次性决策。小图（放大 >1.5×）与
// 异形图（宽高比偏差 >0.35）改 contain，避免模糊铺满或只剩局部；照片类保持 cover。决策通过缩略图
// 容器的 data-material-cover-fit="contain" 标记 + CSS 后代选择器生效，不写内联样式；cover 是缺省。
const COVER_MAX_UPSCALE = 1.5;
const COVER_MAX_ASPECT_MISMATCH = 0.35;

export function materialCoverFit(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
): 'cover' | 'contain' {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    !Number.isFinite(boxWidth) ||
    !Number.isFinite(boxHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    boxWidth <= 0 ||
    boxHeight <= 0
  ) {
    return 'cover';
  }
  const upscale = Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);
  if (upscale > COVER_MAX_UPSCALE) {
    return 'contain';
  }
  const aspectMismatch =
    Math.abs(naturalWidth / naturalHeight - boxWidth / boxHeight) / (boxWidth / boxHeight);
  return aspectMismatch > COVER_MAX_ASPECT_MISMATCH ? 'contain' : 'cover';
}

function createMaterialCoverImage(
  ownerDocument: Document,
  src: string,
  thumb: HTMLElement,
): HTMLImageElement {
  const image = ownerDocument.createElement('img');
  image.className = 'material-cover';
  image.src = src;
  image.alt = '';
  image.draggable = false;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('load', () => {
    image.dataset.materialCoverLoaded = 'true';
    thumb.dataset.materialCoverLoaded = 'true';
    if (
      materialCoverFit(
        image.naturalWidth,
        image.naturalHeight,
        image.clientWidth,
        image.clientHeight,
      ) === 'contain'
    ) {
      thumb.dataset.materialCoverFit = 'contain';
    }
  });
  image.addEventListener('error', () => {
    image.remove();
  });
  return image;
}

function renderMaterialBadge(
  card: HTMLElement,
  kind: 'draft' | 'unavailable',
  visible: boolean,
  label: string,
): void {
  const selector = '[data-material-badge="' + kind + '"]';
  const existing = card.querySelector<HTMLElement>(selector);
  if (!visible) {
    existing?.remove();
    return;
  }
  if (existing !== null) return;
  const badge = card.ownerDocument.createElement('span');
  badge.className = 'material-badge';
  badge.dataset.materialBadge = kind;
  badge.textContent = label;
  // 徽章叠加在缩略图内下角（thumb 为定位上下文且视觉隔离），卡片无需为状态预留空白。
  const thumb = card.querySelector<HTMLElement>('.material-thumb');
  (thumb ?? card).appendChild(badge);
}
