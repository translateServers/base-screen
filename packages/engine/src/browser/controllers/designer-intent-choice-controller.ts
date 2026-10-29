import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { isEditableTarget } from '../dom/designer-editable-target.js';
import { adoptDesignerFormControls } from '../dom/designer-form-controls-dom.js';
import { escapeHtml } from '../dom/designer-html-escape.js';

/**
 * 指代歧义时的点选会话：候选由平台判定，引擎只负责把候选摆到画布上、把选择结果交回去。
 *
 * 「高亮全部候选」不另造浮层，而是复用既有选区——候选一起进画布多选，就一起被高亮；
 * 用户点选其中一个，选区收敛到一个，本控制器据此收束会话。所以这里没有新的视觉层，
 * 也没有新的键盘/指针语义：高亮、点选、取消都用设计器已有的那套。
 *
 * 退出路径只有三条，且都必然结算：点选候选（resolve 该 id）、取消（resolve null 并恢复
 * 提问前的选区）、元素拆卸（release 结算所有悬挂 Promise）。
 */
export interface DesignerIntentChoiceHost {
  readonly getSelectedComponentIds: () => readonly string[];
  readonly replaceSelection: (componentIds: readonly string[]) => void;
}

interface PendingChoice {
  readonly candidateIds: readonly string[];
  /** 提问前的选区：用户取消时原样放回，不留「问了但画布被改了」。 */
  readonly restoreIds: readonly string[];
  /** 平台给的问句；空串时用引擎的默认问句。 */
  readonly prompt: string;
  readonly resolve: (value: string | null) => void;
}

const CANVAS_COMPONENT_SELECTOR = '[data-base-screen-component-id]';
const CANCEL_SELECTOR = '[data-intent-choice-cancel]';
const CANDIDATE_KEY = /^[1-9]$/;

export class DesignerIntentChoiceController {
  readonly #host: DesignerIntentChoiceHost;
  #status: HTMLElement | undefined;
  #pending: PendingChoice | undefined;
  /** 选区由本控制器代写时置位：那次同步不是用户动作，不能当成「已经选好」。 */
  #applying = false;
  /** 状态行是否由本控制器占用：退出时只清自己的内容，不覆盖意图区自己的提示。 */
  #ownsStatus = false;

  constructor(host: DesignerIntentChoiceHost) {
    this.#host = host;
  }

  get pending(): boolean {
    return this.#pending !== undefined;
  }

  /** 状态行与意图输入区共用一个挂载点：问句出在这里，取消按钮也在这里。 */
  connect(status: HTMLElement): void {
    this.#status = status;
    this.render();
  }

  /** 元素被拆卸时不能留下永不结算的 Promise，否则平台会一直等一个不会再来的答案。 */
  release(): void {
    const choice = this.#pending;
    this.#pending = undefined;
    this.#status = undefined;
    this.#ownsStatus = false;
    // 拆卸时不再回写选区：此刻画布与面板正在逐层释放，动它只会撞上半拆的控制器。
    choice?.resolve(null);
  }

  /**
   * 摆出候选并等用户点选。候选少于两个时没有歧义，直接结算那一个（没有候选则 null）。
   * 重复调用会取代上一次提问：上一次拿到 null，不会悬挂。
   */
  begin(candidateIds: readonly string[], prompt: string): Promise<string | null> {
    const ids = normalizeCandidateIds(candidateIds);
    if (ids.length < 2) {
      // 少于两个候选没有歧义，直接结算；但上一次提问仍要收掉，否则旧问句会留在状态行上，
      // 而且它对应那个 Promise 会永远悬挂。
      this.#settle(null);
      return Promise.resolve(ids[0] ?? null);
    }
    // 连问两次时，取消仍回到最初那次提问前的选区，而不是回到上一次的候选集。
    const restoreIds = this.#pending?.restoreIds ?? [...this.#host.getSelectedComponentIds()];
    this.#settle(null);
    let settle: (value: string | null) => void = () => undefined;
    const choice = new Promise<string | null>((resolve) => {
      settle = resolve;
    });
    this.#pending = { candidateIds: ids, restoreIds, prompt: prompt.trim(), resolve: settle };
    // 候选一起进选区：多选即多高亮，用户点选任一候选后选区自然收敛到一个。
    this.#applySelection(ids);
    this.render();
    return choice;
  }

  /** 选区收敛到某个候选即视为已点选：这是「取消/重选」之外唯一的正向出口。 */
  onSelectionChange(selectedComponentIds: readonly string[]): void {
    const choice = this.#pending;
    if (choice === undefined || this.#applying) return;
    const [only] = selectedComponentIds;
    if (selectedComponentIds.length !== 1 || only === undefined) return;
    if (!choice.candidateIds.includes(only)) return;
    this.#settle(only);
  }

  /**
   * 候选此时已在多选里，直接点它会启动整组拖拽而不是收敛——所以点选要在这里认下来：
   * capture 阶段命中候选就把这次指针交给选择会话，画布不再开始拖拽，也不会先抖一下。
   */
  onPointerDown(target: EventTarget | null, event: Event): boolean {
    const choice = this.#pending;
    if (choice === undefined) return false;
    const componentId = readComponentId(target);
    if (componentId === undefined || !choice.candidateIds.includes(componentId)) return false;
    event.preventDefault();
    event.stopPropagation();
    this.#settle(componentId);
    return true;
  }

  /** 「取消选择」出口：回到提问前的选区。 */
  onClick(target: Element): boolean {
    if (this.#pending === undefined || target.closest(CANCEL_SELECTOR) === null) return false;
    this.#settle(null);
    return true;
  }

  /** Esc 取消；数字键按候选顺序直接选中第 n 个（候选超过 9 个时只认前 9 个）。 */
  onKeyDown(event: KeyboardEvent): boolean {
    const choice = this.#pending;
    if (choice === undefined) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#settle(null);
      return true;
    }
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
    // 正在输入框里打字时数字属于内容，不属于选择。
    if (isEditableTarget(event.target)) return false;
    if (!CANDIDATE_KEY.test(event.key)) return false;
    const componentId = choice.candidateIds[Number(event.key) - 1];
    if (componentId === undefined) return false;
    event.preventDefault();
    this.#settle(componentId);
    return true;
  }

  #settle(value: string | null): void {
    const choice = this.#pending;
    if (choice === undefined) return;
    this.#pending = undefined;
    // 点选就把选区落到选中的那一个；取消则原样放回提问前的选区。
    this.#applySelection(value === null ? choice.restoreIds : [value]);
    this.render();
    choice.resolve(value);
  }

  #applySelection(componentIds: readonly string[]): void {
    this.#applying = true;
    try {
      this.#host.replaceSelection(componentIds);
    } finally {
      this.#applying = false;
    }
  }

  private render(): void {
    const status = this.#status;
    if (status === undefined) return;
    const choice = this.#pending;
    if (choice === undefined) {
      // 只清自己写进去的问句：意图区自己的提交结果不该被选择会话的收尾抹掉。
      if (!this.#ownsStatus) return;
      this.#ownsStatus = false;
      status.replaceChildren();
      return;
    }
    const text = DESIGNER_UI_TEXT.intent;
    const prompt =
      choice.prompt === '' ? text.choicePrompt(choice.candidateIds.length) : choice.prompt;
    this.#ownsStatus = true;
    status.dataset.tone = 'info';
    status.innerHTML = `<span>${escapeHtml(prompt)}</span><button type="button" class="intent-status-action designer-control designer-button" data-variant="ghost" data-intent-choice-cancel="true">${escapeHtml(text.choiceCancel)}</button>`;
    adoptDesignerFormControls(status);
  }
}

function normalizeCandidateIds(candidateIds: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of candidateIds) {
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function readComponentId(target: EventTarget | null): string | undefined {
  const element = target as Element | null;
  if (element === null || typeof element.closest !== 'function') return undefined;
  return element.closest<HTMLElement>(CANVAS_COMPONENT_SELECTOR)?.dataset.baseScreenComponentId;
}
