import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenTransactionProvenance } from '@base-screen/core';
import {
  type DesignerSceneDescriptor,
  type DesignerSceneHandler,
  type DesignerScenePlan,
  type DesignerScenePreview,
  prepareDesignerScenePreview,
} from '../../common/operations/scene/designer-scene.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { escapeHtml } from '../dom/designer-html-escape.js';

export interface DesignerSceneGhostHandlers {
  readonly render: (document: ScreenDocument) => boolean;
  readonly clear: () => void;
}

export interface DesignerSceneContext {
  readonly getDocument: () => ScreenDocument | undefined;
  /** 有待决草案时不允许场景预览：两处「未写入」提示不能同时存在。 */
  readonly canPreview: () => boolean;
  readonly notify: (message: string, tone: 'success' | 'error') => void;
  readonly apply: (
    commands: DesignerScenePreview['commands'],
    provenance: ScreenTransactionProvenance,
  ) => boolean;
  readonly applied: (sceneId: string, label: string) => void;
  /** 预览已就绪（尚未写入）；用于发出度量事件，缺省时什么也不做。 */
  readonly previewed?: (sceneId: string) => void;
}

/**
 * 场景切换：宿主定义场景，引擎提供左栏切换与画布预览。
 *
 * 选场景只向宿主请求命令，在文档副本上整批试算后挂到幽灵层，显示「场景预览 · 未写入」；
 * 应用时才走一次普通事务（带 provenance），因此可撤销、可回退。宿主未提供处理器时
 * 场景不可用，不伪造内容；有待决草案时拒绝切换，避免两条未写入提示互相矛盾。
 */
export class DesignerSceneController {
  #block: HTMLElement | undefined;
  #list: HTMLElement | undefined;
  #count: HTMLElement | undefined;
  #note: HTMLElement | undefined;
  #bar: HTMLElement | undefined;
  #barName: HTMLElement | undefined;
  #scenes: readonly DesignerSceneDescriptor[] | undefined;
  #activeId: string | undefined;
  #handler: DesignerSceneHandler | undefined;
  #ghostHandlers: DesignerSceneGhostHandlers | undefined;
  #context: DesignerSceneContext | undefined;
  #preview: DesignerScenePreview | undefined;
  #busyId: string | undefined;
  #instanceId = '';

  connect(
    block: HTMLElement,
    list: HTMLElement,
    count: HTMLElement,
    note: HTMLElement,
    bar: HTMLElement,
    barName: HTMLElement,
  ): void {
    this.#block = block;
    this.#list = list;
    this.#count = count;
    this.#note = note;
    this.#bar = bar;
    this.#barName = barName;
    this.render();
  }

  release(): void {
    this.#block = undefined;
    this.#list = undefined;
    this.#count = undefined;
    this.#note = undefined;
    this.#bar = undefined;
    this.#barName = undefined;
    this.#ghostHandlers = undefined;
    this.#context = undefined;
    this.#handler = undefined;
    this.#scenes = undefined;
    this.#preview = undefined;
    this.#busyId = undefined;
  }

  setContext(context: DesignerSceneContext): void {
    this.#context = context;
  }

  setInstanceId(instanceId: string): void {
    this.#instanceId = instanceId;
  }

  setGhostHandlers(handlers: DesignerSceneGhostHandlers): void {
    this.#ghostHandlers = handlers;
  }

  setHandler(handler: DesignerSceneHandler | undefined): void {
    this.#handler = handler;
    this.render();
  }

  setScenes(scenes: readonly DesignerSceneDescriptor[] | undefined, activeId?: string): void {
    this.#scenes = scenes === undefined || scenes.length === 0 ? undefined : [...scenes];
    if (this.#scenes === undefined) this.#activeId = undefined;
    else if (activeId !== undefined) this.#activeId = activeId;
    this.#preview = undefined;
    this.#ghostHandlers?.clear();
    this.render();
  }

  setActiveScene(sceneId: string | undefined): void {
    this.#activeId = sceneId;
    this.render();
  }

  get activeSceneId(): string | undefined {
    return this.#activeId;
  }

  get previewing(): boolean {
    return this.#preview !== undefined;
  }

  /** 新的变更提案到达前调用：场景预览让位，避免两条「未写入」提示同时存在。 */
  cancelPreview(silent = false): boolean {
    if (this.#preview === undefined) return false;
    this.#ghostHandlers?.clear();
    this.#preview = undefined;
    this.render();
    if (!silent) {
      this.#context?.notify(DESIGNER_UI_TEXT.scene.canceled, 'success');
      this.focusSceneRow(this.#activeId);
    }
    return true;
  }

  async request(sceneId: string): Promise<boolean> {
    const scene = this.#scenes?.find((item) => item.id === sceneId);
    if (scene === undefined || this.#preview !== undefined || this.#busyId !== undefined) {
      return false;
    }
    if (sceneId === this.#activeId) return false;
    if (this.#context?.canPreview() === false) {
      this.#context.notify(DESIGNER_UI_TEXT.scene.blocked, 'error');
      return false;
    }
    const handler = this.#handler;
    const document = this.#context?.getDocument();
    if (handler === undefined) {
      this.#context?.notify(DESIGNER_UI_TEXT.scene.unavailable, 'error');
      return false;
    }
    if (document === undefined) return false;
    this.#busyId = sceneId;
    this.render();
    let plan: ScreenParseResult<DesignerScenePlan>;
    try {
      plan = await handler({ instanceId: this.#instanceId, sceneId, document });
    } catch {
      plan = { ok: false, diagnostics: [] };
    }
    this.#busyId = undefined;
    if (!plan.ok) {
      this.render();
      this.#context?.notify(DESIGNER_UI_TEXT.scene.failed, 'error');
      return false;
    }
    const prepared = prepareDesignerScenePreview(document, scene, plan.value);
    if (!prepared.ok) {
      this.render();
      this.#context?.notify(DESIGNER_UI_TEXT.scene.failed, 'error');
      return false;
    }
    if (this.#ghostHandlers?.render(prepared.value.candidate) !== true) {
      this.render();
      this.#context?.notify(DESIGNER_UI_TEXT.scene.failed, 'error');
      return false;
    }
    this.#preview = prepared.value;
    this.#context?.previewed?.(sceneId);
    this.render();
    // 预览条出现后把焦点放到主操作上：Escape 只在焦点位于设计器内部时才可达。
    this.#bar?.querySelector<HTMLButtonElement>('[data-scene-action="apply"]')?.focus();
    return true;
  }

  apply(): boolean {
    const preview = this.#preview;
    if (preview === undefined) return false;
    const applied = this.#context?.apply(preview.commands, preview.provenance) === true;
    this.#ghostHandlers?.clear();
    this.#preview = undefined;
    if (applied) {
      this.#activeId = preview.sceneId;
      this.render();
      this.#context?.notify(DESIGNER_UI_TEXT.scene.applied(preview.label), 'success');
      this.#context?.applied(preview.sceneId, preview.label);
      this.focusSceneRow(preview.sceneId);
      return true;
    }
    this.render();
    this.#context?.notify(DESIGNER_UI_TEXT.scene.failed, 'error');
    return false;
  }

  onClick(target: Element): boolean {
    const action = target.closest<HTMLElement>('[data-scene-action]');
    if (action !== null) {
      switch (action.dataset.sceneAction) {
        case 'apply':
          this.apply();
          return true;
        case 'cancel':
          this.cancelPreview();
          return true;
        default:
          return false;
      }
    }
    const row = target.closest<HTMLElement>('[data-scene-id]');
    if (row === null) return false;
    const sceneId = row.dataset.sceneId;
    if (sceneId !== undefined) void this.request(sceneId);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape' || this.#preview === undefined) return false;
    event.preventDefault();
    this.cancelPreview();
    return true;
  }

  private render(): void {
    const block = this.#block;
    const bar = this.#bar;
    const scenes = this.#scenes;
    const available = scenes !== undefined;
    if (block !== undefined) {
      block.hidden = !available;
      block.dataset.sceneReady = String(this.#handler !== undefined);
    }
    if (bar !== undefined) bar.hidden = this.#preview === undefined;
    if (this.#barName !== undefined && this.#preview !== undefined) {
      this.#barName.textContent = this.#preview.label;
      bar?.setAttribute('aria-label', DESIGNER_UI_TEXT.scene.previewAria(this.#preview.label));
    }
    if (!available) {
      this.#list?.replaceChildren();
      return;
    }
    if (this.#count !== undefined)
      this.#count.textContent = DESIGNER_UI_TEXT.scene.count(scenes.length);
    if (this.#note !== undefined) {
      const note =
        this.#handler === undefined
          ? DESIGNER_UI_TEXT.scene.unavailable
          : this.#preview === undefined
            ? ''
            : DESIGNER_UI_TEXT.scene.previewLabel;
      this.#note.textContent = note;
      this.#note.hidden = note === '';
    }
    this.renderRows(scenes);
  }

  private focusSceneRow(sceneId: string | undefined): void {
    if (sceneId === undefined) return;
    this.#list
      ?.querySelector<HTMLButtonElement>(`[data-scene-id="${CSS.escape(sceneId)}"]`)
      ?.focus();
  }

  private renderRows(scenes: readonly DesignerSceneDescriptor[]): void {
    const list = this.#list;
    if (list === undefined) return;
    const nodes = scenes.map((scene) => {
      const current = scene.id === this.#activeId;
      const previewing = scene.id === this.#preview?.sceneId;
      const busy = scene.id === this.#busyId;
      const state = busy
        ? DESIGNER_UI_TEXT.scene.busy
        : previewing
          ? DESIGNER_UI_TEXT.scene.previewing
          : current
            ? DESIGNER_UI_TEXT.scene.current
            : DESIGNER_UI_TEXT.scene.available;
      const row = list.ownerDocument.createElement('button');
      row.type = 'button';
      row.className = 'scene-row';
      row.dataset.sceneId = scene.id;
      row.dataset.sceneState = previewing ? 'preview' : current ? 'current' : 'available';
      row.setAttribute('aria-pressed', String(current));
      row.setAttribute('aria-label', DESIGNER_UI_TEXT.scene.rowAria(scene.label, state));
      row.disabled = this.#handler === undefined || busy || this.#busyId !== undefined;
      row.innerHTML = `<span class="scene-row-mark" aria-hidden="true"></span>
        <span class="scene-row-name">${escapeHtml(scene.label)}</span>
        <span class="scene-row-state">${escapeHtml(state)}</span>`;
      return row;
    });
    list.replaceChildren(...nodes);
  }
}
