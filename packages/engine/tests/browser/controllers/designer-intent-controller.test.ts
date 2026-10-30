import { describe, expect, it, vi } from 'vitest';
import { DesignerIntentController } from '../../../src/browser/controllers/designer-intent-controller.js';
import type { DesignerIntentHandler } from '../../../src/common/operations/intent/designer-intent.js';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';

/**
 * 该套件在 node 环境运行：意图控制器只用 DOM 的一小块（输入框的 value/style/closest、
 * 状态行的 innerHTML、作用域 chip 的 textContent），这里按需给最小替身，
 * 断言的落点是**渲染出来的动作**与**发出的请求**，而不是实现细节。
 */

class FakeElement {
  readonly attributes = new Set<string>();
  textContent = '';
  innerHTML = '';
  hidden = false;
  disabled = false;
  focusCount = 0;
  readonly dataset: Record<string, string> = {};

  constructor(private readonly classes: readonly string[] = []) {}

  toggleAttribute(name: string, force?: boolean): void {
    if (force === false) this.attributes.delete(name);
    else this.attributes.add(name);
    if (name === 'data-draft') this.dataset.draft = force === true ? '' : 'undefined';
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.add(`${name}=${value}`);
  }

  closest(selector: string): FakeElement | null {
    return this.classes.some((token) => selector === `.${token}`) ? this : null;
  }

  querySelectorAll(): readonly unknown[] {
    return [];
  }

  querySelector(): FakeElement | null {
    return null;
  }

  replaceChildren(): void {
    this.innerHTML = '';
  }

  focus(): void {
    this.focusCount += 1;
    this.root.activeElement = this;
  }

  getRootNode(): FakeRoot {
    return this.root;
  }

  readonly root: FakeRoot = new FakeRoot();
}

class FakeRoot {
  activeElement: FakeElement | null = null;
}

class FakeTextArea extends FakeElement {
  value = '';
  placeholder = '';
  scrollHeight = 36;
  readonly style: Record<string, string> = {};

  constructor(private readonly composer: FakeElement | null) {
    super();
  }

  override closest(selector: string): FakeElement | null {
    if (selector === '.designer-intent') return this.composer;
    return super.closest(selector);
  }
}

function harness() {
  const composer = new FakeElement(['designer-intent']);
  const input = new FakeTextArea(composer);
  const submit = new FakeElement(['intent-submit']);
  const scope = new FakeElement(['intent-scope']);
  const scopeClear = new FakeElement(['intent-scope-clear']);
  const status = new FakeElement(['intent-status']);
  const confirm = new FakeElement(['intent-confirm']);
  const refs = new FakeElement(['intent-refs']);
  const refAdd = new FakeElement(['intent-ref-add']);
  const controller = new DesignerIntentController();
  controller.connect(
    'instance-1',
    input as unknown as HTMLTextAreaElement,
    submit as unknown as HTMLButtonElement,
    scope as unknown as HTMLElement,
    scopeClear as unknown as HTMLButtonElement,
    status as unknown as HTMLElement,
    confirm as unknown as HTMLElement,
    refs as unknown as HTMLElement,
    refAdd as unknown as HTMLButtonElement,
  );
  return { controller, input, composer, scope, status, confirm, scopeClear, refAdd };
}

function actionTarget(action: string): Element {
  const button = {
    dataset: { intentAction: action },
  };
  return {
    closest: (selector: string) =>
      selector === '[data-intent-action]'
        ? button
        : selector === '[data-intent-input]'
          ? null
          : null,
  } as unknown as Element;
}

function confirmTarget(action: string): Element {
  const button = { dataset: { intentConfirmAction: action } };
  return {
    closest: (selector: string) =>
      selector === '[data-intent-confirm-action]'
        ? button
        : selector === '[data-intent-action]'
          ? null
          : null,
  } as unknown as Element;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('designer intent controller', () => {
  it('keeps a failure on the status line with the host reason and a retry action', async () => {
    const { controller, input, status } = harness();
    const handler = vi.fn(async () => ({
      ok: false as const,
      diagnostics: [],
      reason: '智能体生成失败：上游 500。',
    }));
    controller.setHandler(handler as unknown as DesignerIntentHandler);
    controller.syncScope(['title'], () => '标题');
    input.value = '把标题改成日榜';

    await controller.submit();

    expect(status.dataset.tone).toBe('error');
    expect(status.innerHTML).toContain('智能体生成失败：上游 500。');
    expect(status.innerHTML).toContain('data-intent-action="retry-intent"');
    expect(status.innerHTML).toContain(DESIGNER_UI_TEXT.intent.retry);
    // 输入没被清掉：失败之后用户还能改、还能重发。
    expect(input.value).toBe('把标题改成日榜');
  });

  it('falls back to its own sentence when the host gives no reason', async () => {
    const { controller, input, status } = harness();
    controller.setHandler((async () => ({ ok: false, diagnostics: [] })) as DesignerIntentHandler);
    controller.syncScope(['title'], () => '标题');
    input.value = '一句话';

    await controller.submit();

    expect(status.innerHTML).toContain(DESIGNER_UI_TEXT.intent.failed);
    expect(status.innerHTML).toContain('data-intent-action="retry-intent"');
  });

  it('retries the same sentence without asking the whole-screen confirmation again', async () => {
    const { controller, input, status, confirm } = harness();
    const scopes: string[] = [];
    const handler = vi.fn(async (request: { scope: { kind: string } }) => {
      scopes.push(request.scope.kind);
      return { ok: false as const, diagnostics: [], reason: '网络请求失败。' };
    });
    controller.setHandler(handler as unknown as DesignerIntentHandler);
    input.value = '再来一版概览';

    // 整屏作用域：第一次提交先过二次确认，确认之后才真的发出去。
    await controller.submit();
    expect(controller.confirmOpen).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    controller.onClick(confirmTarget('whole-screen'));
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(controller.confirmOpen).toBe(false);
    expect(status.innerHTML).toContain('data-intent-action="retry-intent"');

    // 重试：同一句话直接发，不再打开确认层——用户刚刚已经确认过整屏了。
    expect(controller.onClick(actionTarget('retry-intent'))).toBe(true);
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(controller.confirmOpen).toBe(false);
    expect(confirm.hidden).toBe(true);
    expect(scopes).toEqual(['screen', 'screen']);
  });

  it('offers "switch to whole screen and send" when the host rejects a component scope', async () => {
    const { controller, input, status, scope } = harness();
    const scopes: string[] = [];
    const handler = vi.fn(async (request: { scope: { kind: string } }) => {
      scopes.push(request.scope.kind);
      return request.scope.kind === 'screen'
        ? { ok: true as const, value: null, diagnostics: [] }
        : {
            ok: false as const,
            diagnostics: [],
            reason: '示例智能体只支持整屏生成。',
            remedy: 'whole-screen' as const,
          };
    });
    controller.setHandler(handler as unknown as DesignerIntentHandler);
    controller.syncScope(['title'], () => '标题');
    input.value = '把这块换成排行榜';

    await controller.submit();

    expect(status.innerHTML).toContain('示例智能体只支持整屏生成。');
    expect(status.innerHTML).toContain('data-intent-action="submit-whole-screen"');
    expect(status.innerHTML).toContain(DESIGNER_UI_TEXT.intent.retryWholeScreen);

    controller.onClick(actionTarget('submit-whole-screen'));
    await flush();

    expect(scopes).toEqual(['components', 'screen']);
    // 作用域真的解除了：chip 回到整屏，✕ 也跟着藏起来。
    expect(scope.textContent).toBe(DESIGNER_UI_TEXT.intent.scopeScreen);
    expect(input.value).toBe('');
  });

  it('hides the reference entry until a catalog port is bound', () => {
    const h = harness();
    h.controller.setHandler(async () => ({ ok: true, value: null, diagnostics: [] }));
    expect(h.refAdd.hidden).toBe(true);
    h.controller.setReferenceCatalog({
      catalog: async () => ({ ok: true, value: [], diagnostics: [] }),
    });
    expect(h.refAdd.hidden).toBe(false);
  });

  it('sends bound references with the request and clears them on success', async () => {
    const h = harness();
    const calls: { references?: readonly unknown[] }[] = [];
    h.controller.setHandler(async (request) => {
      calls.push({ references: request.references });
      return { ok: true, value: null, diagnostics: [] };
    });
    h.controller.addReference({ kind: 'asset', id: 'asset-1', label: '远山' });
    h.input.value = '用这张图做头图';
    // 整屏提交要先过二次确认，这条用例只关心请求体，所以走「直接按整屏发」的出口。
    h.controller.submitAsWholeScreen();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls[0]?.references).toEqual([{ kind: 'asset', assetId: 'asset-1', name: '远山' }]);
    // 提交成功后引用与文本一起清空，下一句不会带着上一轮的引用。
    expect(h.controller.references).toEqual([]);
  });

  it('marks the composer as drafting while text is present and clears the mark when empty', () => {
    const { controller, input, composer } = harness();
    input.value = '第一行\n第二行';
    controller.onInput();
    expect(composer.hasAttribute('data-draft')).toBe(true);

    input.value = '';
    controller.onInput();
    expect(composer.hasAttribute('data-draft')).toBe(false);
  });

  it('clears auto-grown height when the agent tab takes over the right pane', () => {
    const { controller, input } = harness();
    input.style.height = '84px';

    controller.setWritingMode(true);

    expect(input.style.height).toBe('');
  });
});
