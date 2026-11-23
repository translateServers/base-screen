import {
  MAX_POPUP_OFFSET,
  resolveScreenStartPageId,
  SCREEN_POPUP_ANCHORS,
  type ScreenComponentNode,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenPageCanvas,
  type ScreenParseResult,
  type ScreenPopupAnchor,
  type ScreenPopupCanvas,
  type ScreenPopupPlacement,
  type ScreenSubCanvas,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand, ScreenDocumentTransaction } from '@base-screen/core';
import { pruneDesignerBlueprintEntities } from '../../common/operations/blueprint/designer-blueprint-graph.js';
import {
  type DesignerArtboardId,
  listDesignerCanvasComponentIds,
} from '../../common/session/designer-artboard.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { readDesignerColorPaletteValue } from '../dom/color/designer-color-palette-dom.js';
import { adoptDesignerFormControls } from '../dom/designer-form-controls-dom.js';
import { escapeHtml } from '../dom/designer-html-escape.js';
import { type DesignerIconName, designerIcon } from '../dom/designer-icons.js';

const TEXT = DESIGNER_UI_TEXT.artboard;

export interface DesignerArtboardContext {
  /** 完整文档（含全部从画布），不是当前画板视图。 */
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getArtboard: () => DesignerArtboardId;
  readonly setArtboard: (artboard: DesignerArtboardId) => ScreenParseResult<null>;
  /** 在完整文档上提交一次可撤销事务。 */
  readonly execute: (transaction: ScreenDocumentTransaction) => ScreenParseResult<ScreenDocument>;
  readonly reportDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly notify: (message: string) => void;
  /** 切换画板后让视口适应新画板。 */
  readonly fit: () => void;
  /** 参照底图开关变化（画布据此显示 / 隐藏参照层）。 */
  readonly onReferenceChange?: (visible: boolean) => void;
}

/** 新建弹框的默认外观：深色面板 + 半透明黑遮罩，点遮罩可关。 */
const DEFAULT_POPUP = {
  width: 640,
  height: 400,
  backgroundColor: '#141c2b',
  borderRadius: 8,
  maskColor: 'rgba(0, 0, 0, 0.6)',
  closeOnMaskClick: true,
  closeOnEscape: true,
} as const;

const ICON: Record<'main' | 'page' | 'popup', DesignerIconName> = {
  main: 'grid',
  page: 'rect',
  popup: 'copy',
};

/**
 * 画布标签条（ADR-0109 §2.5）：画布底部「主画布 | 页面… | 弹框…」，点击切换编辑画板，
 * 「+」新建页面 / 弹框，末尾是参照底图开关。检查器「从画布」段（名称、显示方式、页面背景、起始页、
 * 弹框遮罩 / 圆角 / 位置 / 关闭方式、复制与删除）的提交也在这里，统一作用于完整文档。
 */
export class DesignerArtboardController {
  #strip: HTMLElement | undefined;
  #menu: HTMLElement | undefined;
  #host: HTMLElement | undefined;
  #context: DesignerArtboardContext | undefined;
  #open = false;
  #reference = true;
  /** 最近编辑的页面：编辑主画布时作参照底图。 */
  #lastPage: string | null = null;

  connect(strip: HTMLElement, menu: HTMLElement, host: HTMLElement): void {
    this.#strip = strip;
    this.#menu = menu;
    this.#host = host;
    this.render();
  }

  release(): void {
    this.#strip = undefined;
    this.#menu = undefined;
    this.#host = undefined;
    this.#open = false;
  }

  setContext(context: DesignerArtboardContext): void {
    this.#context = context;
  }

  get menuOpen(): boolean {
    return this.#open;
  }

  /** 参照底图是否打开。 */
  get referenceVisible(): boolean {
    return this.#reference;
  }

  /**
   * 参照底图画哪块画布：编辑页面 / 弹框之外的从画布时垫主画布；编辑主画布时垫最近编辑的页面
   * （没有就第一个页面）。弹框画板尺寸与主画布不同，不垫参照。`undefined` = 不画。
   */
  referenceCanvas(): DesignerArtboardId | undefined {
    const document = this.#context?.getDocument();
    if (document === undefined || !this.#reference) return undefined;
    const artboard = this.#context?.getArtboard() ?? null;
    if (artboard === null) {
      const pages = (document.subCanvases ?? []).filter((canvas) => canvas.display === 'page');
      return (pages.find((page) => page.id === this.#lastPage) ?? pages[0])?.id;
    }
    const current = findSubCanvas(document, artboard);
    return current?.display === 'page' ? null : undefined;
  }

  closeMenu(focusTrigger = true): boolean {
    if (!this.#open) return false;
    this.#open = false;
    this.render();
    if (focusTrigger) this.#strip?.querySelector<HTMLElement>('[data-artboard-create]')?.focus();
    return true;
  }

  render(): void {
    const document = this.#context?.getDocument();
    const artboard = this.#context?.getArtboard() ?? null;
    if (artboard !== null && findSubCanvas(document, artboard)?.display === 'page') {
      this.#lastPage = artboard;
    }
    const strip = this.#strip;
    if (strip !== undefined) this.#renderStrip(strip, document, artboard);
    const menu = this.#menu;
    if (menu === undefined) return;
    menu.hidden = !this.#open;
    if (!this.#open) {
      menu.replaceChildren();
      return;
    }
    const item = (action: string, label: string, icon: DesignerIconName): string =>
      `<button type="button" class="designer-control designer-button designer-menu-item" role="menuitem" data-artboard-create-kind="${action}"><span class="menu-item-icon" aria-hidden="true">${designerIcon(icon)}</span><span class="menu-item-label">${escapeHtml(label)}</span></button>`;
    menu.innerHTML = `<div class="designer-context-menu-heading"><span class="designer-context-menu-heading-icon" aria-hidden="true">${designerIcon('layers')}</span><span class="designer-context-menu-heading-label">${TEXT.createMenu}</span></div>
      ${item('page', TEXT.createPage, ICON.page)}
      ${item('popup', TEXT.createPopup, ICON.popup)}`;
    adoptDesignerFormControls(menu);
    this.#position(menu);
  }

  onClick(target: Element): boolean {
    if (target.closest('[data-artboard-create]') !== null) {
      this.#open = !this.#open;
      this.render();
      if (this.#open) this.#menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      return true;
    }
    const kind = target.closest<HTMLElement>('[data-artboard-create-kind]');
    if (kind !== null) {
      this.closeMenu(false);
      this.createSubCanvas(kind.dataset.artboardCreateKind === 'page' ? 'page' : 'popup');
      return true;
    }
    const select = target.closest<HTMLElement>('[data-artboard-select]');
    if (select !== null) {
      const id = select.dataset.artboardSelect ?? '';
      this.closeMenu(false);
      this.#switch(id === '' ? null : id);
      return true;
    }
    if (target.closest('[data-artboard-reference]') !== null) {
      this.#reference = !this.#reference;
      this.render();
      this.#context?.onReferenceChange?.(this.#reference);
      return true;
    }
    const display = target.closest<HTMLElement>('[data-sub-canvas-display]');
    if (display !== null) {
      const value = display.dataset.subCanvasDisplay;
      if (value === 'page' || value === 'popup') this.#changeDisplay(value);
      return true;
    }
    const anchor = target.closest<HTMLElement>('[data-popup-anchor]');
    if (anchor !== null) {
      const popup = this.#currentPopup();
      const value = anchor.dataset.popupAnchor as ScreenPopupAnchor | undefined;
      if (popup !== undefined && value !== undefined && SCREEN_POPUP_ANCHORS.includes(value)) {
        // 换锚点时偏移归零：保留旧偏移会让面板跳到作者预料之外的位置。
        this.#replace(withPlacement(popup, { anchor: value, offsetX: 0, offsetY: 0 }));
      }
      return true;
    }
    const action = target.closest<HTMLElement>('[data-sub-canvas-action]');
    if (action !== null) {
      const name = action.dataset.subCanvasAction;
      if (name === 'delete') this.deleteCurrentSubCanvas();
      else if (name === 'duplicate') this.duplicateCurrentSubCanvas();
      else if (name === 'set-start') this.#setStartPage();
      return true;
    }
    // 菜单外的点击：收起菜单但不吞掉这次点击。
    if (this.#open && target.closest('[data-artboard-menu]') === null) this.closeMenu(false);
    return false;
  }

  onChange(target: Element): boolean {
    const field = target.closest<HTMLElement>('[data-sub-canvas-property], [data-popup-property]');
    if (field === null) return false;
    const current = this.#current();
    if (current === undefined) return true;
    const property = field.dataset.subCanvasProperty ?? field.dataset.popupProperty;
    let next: ScreenSubCanvas | undefined;
    if (property === 'name' && target instanceof HTMLInputElement) {
      const name = target.value.trim();
      next = name.length === 0 ? undefined : { ...current, name };
      if (next === undefined) target.value = current.name;
    } else if (
      property === 'customBackground' &&
      target instanceof HTMLInputElement &&
      current.display === 'page'
    ) {
      next = target.checked
        ? {
            ...current,
            backgroundColor: this.#context?.getDocument()?.canvas.backgroundColor ?? '#000000',
          }
        : withoutPageBackground(current);
    } else if (current.display === 'popup') {
      next = this.#popupChange(current, property, target);
    }
    if (next !== undefined) this.#replace(next);
    return true;
  }

  /** 新建页面 / 弹框并切到它；名称按「页面 n」「弹框 n」递增。 */
  createSubCanvas(display: 'page' | 'popup'): boolean {
    const context = this.#context;
    const document = context?.getDocument();
    if (context === undefined || document === undefined) return false;
    const subCanvases = document.subCanvases ?? [];
    const ids = new Set(subCanvases.map((canvas) => canvas.id));
    const names = new Set(subCanvases.map((canvas) => canvas.name));
    const nameOf = display === 'page' ? TEXT.defaultPageName : TEXT.defaultPopupName;
    let index = 1;
    while (ids.has(`${display}-${index}`) || names.has(nameOf(index))) index++;
    const id = `${display}-${index}`;
    const subCanvas: ScreenSubCanvas =
      display === 'page'
        ? { id, name: nameOf(index), display: 'page' }
        : defaultPopup(id, nameOf(index), document);
    const result = context.execute({
      commands: [{ type: 'replace-sub-canvases', subCanvases: [...subCanvases, subCanvas] }],
    });
    if (!result.ok) {
      context.reportDiagnostics(result.diagnostics);
      return false;
    }
    this.#switch(subCanvas.id);
    context.notify(TEXT.created(subCanvas.name));
    return true;
  }

  /** 复制当前从画布（连同其中的组件，新 id），插在它后面并切过去。 */
  duplicateCurrentSubCanvas(): boolean {
    const context = this.#context;
    const document = context?.getDocument();
    const current = this.#current();
    if (context === undefined || document === undefined || current === undefined) return false;
    const subCanvases = document.subCanvases ?? [];
    const ids = new Set(subCanvases.map((canvas) => canvas.id));
    let index = 1;
    while (ids.has(`${current.display}-${index}`)) index++;
    const copy: ScreenSubCanvas = {
      ...current,
      id: `${current.display}-${index}`,
      name: TEXT.copyName(current.name),
    };
    const position = subCanvases.indexOf(current);
    const nextCanvases = [
      ...subCanvases.slice(0, position + 1),
      copy,
      ...subCanvases.slice(position + 1),
    ];
    const componentIds = new Set(document.components.map((component) => component.id));
    const inside = listDesignerCanvasComponentIds(document, current.id);
    const idMap = new Map<string, string>();
    for (const component of document.components) {
      if (!inside.has(component.id)) continue;
      let n = 1;
      while (componentIds.has(`${component.id}-copy-${n}`)) n++;
      const next = `${component.id}-copy-${n}`;
      componentIds.add(next);
      idMap.set(component.id, next);
    }
    // 父组件先于子组件加入：按祖先深度排序。
    const depthOf = (id: string): number => {
      let depth = 0;
      let current = document.components.find((component) => component.id === id);
      while (current?.parentId != null && depth < 256) {
        depth++;
        const parentId: string = current.parentId;
        current = document.components.find((component) => component.id === parentId);
      }
      return depth;
    };
    const copies = document.components
      .filter((component) => inside.has(component.id))
      .sort((left, right) => depthOf(left.id) - depthOf(right.id))
      .map((component) => ({
        ...component,
        id: idMap.get(component.id)!,
        parentId: component.parentId === null ? null : (idMap.get(component.parentId) ?? null),
        ...(component.parentId === null ? { canvasId: copy.id } : {}),
      }));
    const commands: ScreenDocumentCommand[] = [
      { type: 'replace-sub-canvases', subCanvases: nextCanvases },
      ...copies.map((component) => ({ type: 'add-component' as const, component })),
    ];
    const result = context.execute({ commands });
    if (!result.ok) {
      context.reportDiagnostics(result.diagnostics);
      return false;
    }
    this.#switch(copy.id);
    context.notify(TEXT.created(copy.name));
    return true;
  }

  /** 删除当前从画布：连同其中的组件、蓝图里引用它们的节点一起移除，一次可撤销事务。 */
  deleteCurrentSubCanvas(): boolean {
    const context = this.#context;
    const document = context?.getDocument();
    const current = this.#current();
    if (context === undefined || document === undefined || current === undefined) return false;
    const roots = document.components.filter(
      (component) => component.parentId === null && component.canvasId === current.id,
    );
    const removed = listDesignerCanvasComponentIds(document, current.id);
    const blueprint = pruneDesignerBlueprintEntities(document.blueprint, {
      componentIds: removed,
      subCanvasIds: new Set([current.id]),
    });
    const commands: ScreenDocumentCommand[] = [];
    if (blueprint !== document.blueprint) commands.push({ type: 'replace-blueprint', blueprint });
    if (roots.length > 0) {
      commands.push({
        type: 'remove-components',
        componentIds: roots.map((component) => component.id),
      });
    }
    commands.push({
      type: 'replace-sub-canvases',
      subCanvases: (document.subCanvases ?? []).filter((candidate) => candidate.id !== current.id),
      ...(document.startCanvasId === current.id ? { startCanvasId: null } : {}),
    });
    const result = context.execute({ commands });
    if (!result.ok) {
      context.reportDiagnostics(result.diagnostics);
      return false;
    }
    context.notify(TEXT.deleted(current.name));
    context.fit();
    return true;
  }

  /** 右键「移到…」：把根组件移到另一块画布（`null` = 主画布）。 */
  moveComponents(componentIds: readonly string[], canvasId: DesignerArtboardId): boolean {
    const context = this.#context;
    const document = context?.getDocument();
    if (context === undefined || document === undefined || componentIds.length === 0) return false;
    const result = context.execute({
      commands: [{ type: 'move-components', componentIds: [...componentIds], canvasId }],
    });
    if (!result.ok) {
      context.reportDiagnostics(result.diagnostics);
      return false;
    }
    const name =
      canvasId === null ? TEXT.mainCanvas : (findSubCanvas(document, canvasId)?.name ?? canvasId);
    context.notify(TEXT.moved(name));
    return true;
  }

  /**
   * 组件右键菜单的画布段：「移到…」子菜单列出除当前画布外的全部画布；编辑主画布且文档有页面时，
   * 再给「置于从画布下方」勾选项。只作用于选区里的根组件（子组件随根组件）。
   */
  contextMenuSection(selectedIds: readonly string[]): string {
    const document = this.#context?.getDocument();
    if (document === undefined) return '';
    const roots = rootSelection(document, selectedIds);
    if (roots.length === 0) return '';
    const subCanvases = document.subCanvases ?? [];
    if (subCanvases.length === 0) return '';
    const artboard = this.#context?.getArtboard() ?? null;
    const targets: {
      readonly id: string;
      readonly name: string;
      readonly icon: DesignerIconName;
    }[] = [
      ...(artboard === null ? [] : [{ id: '', name: TEXT.mainCanvas, icon: ICON.main }]),
      ...subCanvases
        .filter((canvas) => canvas.id !== artboard)
        .map((canvas) => ({ id: canvas.id, name: canvas.name, icon: ICON[canvas.display] })),
    ];
    const items = targets
      .map(
        (target) =>
          `<button type="button" class="designer-control designer-button designer-menu-item" role="menuitem" data-move-to-canvas="${escapeHtml(target.id)}"><span class="menu-item-icon" aria-hidden="true"><span class="menu-item-glyph">${designerIcon(target.icon)}</span></span><span class="menu-item-label">${escapeHtml(target.name)}</span></button>`,
      )
      .join('');
    const move =
      targets.length === 0
        ? ''
        : `<div class="designer-menu-submenu-wrap">
    <button type="button" class="designer-control designer-button designer-menu-item designer-menu-submenu-trigger" data-submenu-toggle aria-haspopup="menu" aria-expanded="false" role="menuitem"><span class="menu-item-icon" aria-hidden="true">${designerIcon('layers')}</span><span class="menu-item-label">${TEXT.moveTo}</span><span class="designer-menu-submenu-arrow" aria-hidden="true">${designerIcon('chevron-right')}</span></button>
    <div class="designer-menu designer-submenu" data-submenu hidden role="menu">${items}</div>
  </div>`;
    const hasPages = subCanvases.some((canvas) => canvas.display === 'page');
    const below =
      artboard === null && hasPages
        ? `<button type="button" class="designer-control designer-button designer-menu-item" role="menuitemcheckbox" aria-checked="${String(roots.every((component) => component.belowSubCanvas === true))}" data-below-sub-canvas><span class="menu-item-icon" aria-hidden="true"><span class="menu-item-glyph">${designerIcon('send-to-back')}</span><span class="menu-item-check">${designerIcon('check')}</span></span><span class="menu-item-label">${TEXT.belowSubCanvas}</span></button>`
        : '';
    if (move === '' && below === '') return '';
    return `<div class="designer-menu-separator" data-menu-separator role="separator"></div>${move}${below}`;
  }

  /** 右键画布段的点击：移到别的画布，或切换「置于从画布下方」。 */
  onContextMenuClick(target: Element, selectedIds: readonly string[]): boolean {
    const move = target.closest<HTMLElement>('[data-move-to-canvas]');
    const below = target.closest<HTMLElement>('[data-below-sub-canvas]');
    if (move === null && below === null) return false;
    const context = this.#context;
    const document = context?.getDocument();
    if (context === undefined || document === undefined) return true;
    const roots = rootSelection(document, selectedIds);
    if (roots.length === 0) return true;
    if (move !== null) {
      const id = move.dataset.moveToCanvas ?? '';
      this.moveComponents(
        roots.map((component) => component.id),
        id === '' ? null : id,
      );
      return true;
    }
    const next = !roots.every((component) => component.belowSubCanvas === true);
    const result = context.execute({
      commands: [
        {
          type: 'update-components',
          componentIds: roots.map((component) => component.id),
          patch: { belowSubCanvas: next ? true : null },
        },
      ],
    });
    if (!result.ok) context.reportDiagnostics(result.diagnostics);
    return true;
  }

  #renderStrip(
    strip: HTMLElement,
    document: ScreenDocument | undefined,
    artboard: DesignerArtboardId,
  ): void {
    const subCanvases = document?.subCanvases ?? [];
    const start = document === undefined ? null : resolveScreenStartPageId(document);
    const tab = (
      id: string,
      display: 'main' | 'page' | 'popup',
      name: string,
      selected: boolean,
    ): string => {
      const star =
        display === 'page' && id === start
          ? `<span class="designer-canvas-tab-start" aria-label="${TEXT.startPage}" data-tip="${TEXT.startPage}">${designerIcon('star')}</span>`
          : '';
      return `<button type="button" class="designer-control designer-button designer-canvas-tab" data-variant="ghost" role="tab" aria-selected="${String(selected)}" data-artboard-select="${escapeHtml(id)}" data-canvas-display="${display}"><span class="designer-canvas-tab-icon" aria-hidden="true">${designerIcon(ICON[display])}</span><span class="designer-canvas-tab-name">${escapeHtml(name)}</span>${star}</button>`;
    };
    const referenceAvailable = subCanvases.some((canvas) => canvas.display === 'page');
    const referenceLabel = this.#reference ? TEXT.referenceOnAria : TEXT.referenceOffAria;
    const markup = `<div class="designer-canvas-tabs-list" role="tablist" aria-label="${TEXT.tabsAria}">
      ${tab('', 'main', TEXT.mainCanvas, artboard === null)}
      ${subCanvases.map((canvas) => tab(canvas.id, canvas.display, canvas.name, canvas.id === artboard)).join('')}
    </div>
    <button type="button" class="designer-control designer-button designer-icon-button designer-canvas-tabs-add" data-variant="ghost" data-artboard-create aria-haspopup="menu" aria-expanded="${String(this.#open)}" aria-label="${TEXT.createAria}" data-tip="${TEXT.createAria}">${designerIcon('plus')}</button>
    ${
      referenceAvailable
        ? `<span class="designer-canvas-tabs-divider" aria-hidden="true"></span><button type="button" class="designer-control designer-button designer-canvas-tabs-reference" data-variant="ghost" data-artboard-reference aria-pressed="${String(this.#reference)}" aria-label="${referenceLabel}" data-tip="${referenceLabel}"><span aria-hidden="true">${designerIcon('layers')}</span><span>${TEXT.reference}</span></button>`
        : ''
    }`;
    if (strip.dataset.markup !== markup) {
      strip.dataset.markup = markup;
      strip.innerHTML = markup;
      adoptDesignerFormControls(strip);
    }
  }

  #popupChange(
    popup: ScreenPopupCanvas,
    property: string | undefined,
    target: Element,
  ): ScreenSubCanvas | undefined {
    if (property === 'maskColor') {
      const value = readDesignerColorPaletteValue(target);
      return value !== undefined && value.length > 0 ? { ...popup, maskColor: value } : undefined;
    }
    if (!(target instanceof HTMLInputElement)) return undefined;
    if (property === 'borderRadius') {
      const value = Math.round(Number(target.value));
      return Number.isFinite(value) && value >= 0 && value <= 200
        ? { ...popup, borderRadius: value }
        : undefined;
    }
    if (property === 'closeOnMaskClick') return { ...popup, closeOnMaskClick: target.checked };
    if (property === 'closeOnEscape') return { ...popup, closeOnEscape: target.checked };
    if (property === 'offsetX' || property === 'offsetY') {
      const value = Math.round(Number(target.value));
      if (Number.isFinite(value) && Math.abs(value) <= MAX_POPUP_OFFSET) {
        const placement = popup.placement ?? { anchor: 'center' as const, offsetX: 0, offsetY: 0 };
        return withPlacement(popup, { ...placement, [property]: value });
      }
      target.value = String(popup.placement?.[property] ?? 0);
    }
    return undefined;
  }

  /**
   * 切换显示方式（D2：锚点与显示方式无关，蓝图连线不变）。页面 → 弹框按默认面板尺寸，
   * 并提示超出面板的组件数；弹框 → 页面去掉弹框专属字段与面板背景（透出主画布背景）。
   */
  #changeDisplay(display: 'page' | 'popup'): void {
    const context = this.#context;
    const document = context?.getDocument();
    const current = this.#current();
    if (context === undefined || document === undefined || current === undefined) return;
    if (current.display === display) return;
    const next: ScreenSubCanvas =
      display === 'page'
        ? { id: current.id, name: current.name, display: 'page' }
        : defaultPopup(current.id, current.name, document);
    if (!this.#replace(next)) return;
    let overflow = 0;
    if (next.display === 'popup') {
      for (const component of document.components) {
        if (component.parentId !== null || component.canvasId !== current.id) continue;
        if (
          component.position.x + component.size.width > next.width ||
          component.position.y + component.size.height > next.height
        ) {
          overflow++;
        }
      }
    }
    context.notify(
      TEXT.displayChanged(display === 'page' ? TEXT.displayPage : TEXT.displayPopup, overflow),
    );
  }

  #setStartPage(): void {
    const context = this.#context;
    const document = context?.getDocument();
    const current = this.#current();
    if (context === undefined || document === undefined || current?.display !== 'page') return;
    const result = context.execute({
      commands: [
        {
          type: 'replace-sub-canvases',
          subCanvases: document.subCanvases ?? [],
          startCanvasId: current.id,
        },
      ],
    });
    if (!result.ok) {
      context.reportDiagnostics(result.diagnostics);
      return;
    }
    context.notify(TEXT.startPageSet(current.name));
  }

  #switch(artboard: DesignerArtboardId): void {
    const context = this.#context;
    if (context === undefined) return;
    if (artboard === context.getArtboard()) return;
    const result = context.setArtboard(artboard);
    if (!result.ok) {
      context.reportDiagnostics(result.diagnostics);
      return;
    }
    context.fit();
  }

  #current(): ScreenSubCanvas | undefined {
    return findSubCanvas(this.#context?.getDocument(), this.#context?.getArtboard() ?? null);
  }

  #currentPopup(): ScreenPopupCanvas | undefined {
    const current = this.#current();
    return current?.display === 'popup' ? current : undefined;
  }

  #replace(next: ScreenSubCanvas): boolean {
    const context = this.#context;
    const document = context?.getDocument();
    if (context === undefined || document === undefined) return false;
    const result = context.execute({
      commands: [
        {
          type: 'replace-sub-canvases',
          subCanvases: (document.subCanvases ?? []).map((canvas) =>
            canvas.id === next.id ? next : canvas,
          ),
        },
      ],
    });
    if (!result.ok) {
      context.reportDiagnostics(result.diagnostics);
      return false;
    }
    return true;
  }

  /** 菜单挂在工作区上：标签条在画布底部，所以贴「+」按钮向上展开。 */
  #position(menu: HTMLElement): void {
    const trigger = this.#strip?.querySelector<HTMLElement>('[data-artboard-create]');
    const host = this.#host;
    if (trigger == null || host === undefined) return;
    const triggerRect = trigger.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    menu.style.left = `${Math.max(8, triggerRect.left - hostRect.left)}px`;
    menu.style.top = 'auto';
    menu.style.bottom = `${hostRect.bottom - triggerRect.top + 4}px`;
  }
}

function defaultPopup(id: string, name: string, document: ScreenDocument): ScreenPopupCanvas {
  return {
    id,
    name,
    display: 'popup',
    width: Math.min(DEFAULT_POPUP.width, document.canvas.width),
    height: Math.min(DEFAULT_POPUP.height, document.canvas.height),
    backgroundColor: DEFAULT_POPUP.backgroundColor,
    borderRadius: DEFAULT_POPUP.borderRadius,
    maskColor: DEFAULT_POPUP.maskColor,
    closeOnMaskClick: DEFAULT_POPUP.closeOnMaskClick,
    closeOnEscape: DEFAULT_POPUP.closeOnEscape,
  };
}

function withoutPageBackground(page: ScreenPageCanvas): ScreenPageCanvas {
  const { backgroundColor: _color, background: _background, ...rest } = page;
  return rest;
}

/** 居中且无偏移即缺省位置：不写 `placement`，文档保持最简。 */
function withPlacement(
  popup: ScreenPopupCanvas,
  placement: ScreenPopupPlacement,
): ScreenPopupCanvas {
  const { placement: _placement, ...rest } = popup;
  return placement.anchor === 'center' && placement.offsetX === 0 && placement.offsetY === 0
    ? rest
    : { ...rest, placement };
}

function findSubCanvas(
  document: ScreenDocument | undefined,
  artboard: DesignerArtboardId,
): ScreenSubCanvas | undefined {
  return artboard === null
    ? undefined
    : document?.subCanvases?.find((canvas) => canvas.id === artboard);
}

/** 选区里的根组件（子组件不能单独换画布）。 */
function rootSelection(
  document: ScreenDocument,
  selectedIds: readonly string[],
): readonly ScreenComponentNode[] {
  const selected = new Set(selectedIds);
  return document.components.filter(
    (component) => selected.has(component.id) && component.parentId === null,
  );
}
