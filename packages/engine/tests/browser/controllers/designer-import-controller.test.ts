import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import { DesignerImportController } from '../../../src/browser/controllers/designer-import-controller.js';

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'text-1',
      type: 'base.text',
      name: '文本',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: { type: 'static', value: '导入' },
    },
  ],
  dataSources: [],
  variables: [],
  blueprint: { rules: [] },
};

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly tagName: string;
  className = '';
  textContent = '';
  type = '';
  hidden = false;
  ariaLabel = '';

  constructor(
    readonly ownerDocument: FakeDocument,
    tagName: string,
  ) {
    this.tagName = tagName;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelector(selector: string): FakeElement | null {
    return (
      this.children.find(
        (child) =>
          (selector === '[data-import-title]' && child.dataset.importTitle !== undefined) ||
          (selector === '[data-import-body]' && child.dataset.importBody !== undefined),
      ) ?? null
    );
  }

  closest<T extends FakeElement>(selector: string): T | null {
    if (selector === '[data-action]' && this.dataset.action !== undefined) {
      return this as unknown as T;
    }
    return null;
  }

  remove(): void {
    const index = this.children.indexOf(this);
    if (index !== -1) this.children.splice(index, 1);
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

function createHarness() {
  const ownerDocument = new FakeDocument();
  const dialog = new FakeElement(ownerDocument, 'section');
  const title = new FakeElement(ownerDocument, 'span');
  title.dataset.importTitle = 'true';
  const body = new FakeElement(ownerDocument, 'div');
  body.dataset.importBody = 'true';
  dialog.append(title, body);

  const replaceDocument = vi.fn(
    (candidate: ScreenDocument): ScreenParseResult<ScreenDocument> => ({
      ok: true,
      value: candidate,
      diagnostics: [],
    }),
  );
  const report = vi.fn();
  const notify = vi.fn();
  const controller = new DesignerImportController({
    replaceDocument,
    report,
    notify,
  });
  controller.connect(dialog as unknown as HTMLElement);
  return { controller, dialog, title, body, replaceDocument, report, notify, ownerDocument };
}

function action(name: string): FakeElement {
  const element = new FakeElement(new FakeDocument(), 'button');
  element.dataset.action = name;
  return element;
}

function importFile(contents: string): File {
  return new File([contents], 'screen.json', { type: 'application/json' });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('DesignerImportController', () => {
  it('R2 请求有效文件进入确认视图，确认后替换文档并通知成功', async () => {
    const harness = createHarness();

    harness.controller.request(importFile(JSON.stringify(document)));
    await flush();

    expect(harness.dialog.hidden).toBe(false);
    expect(harness.dialog.ariaLabel).toBe('确认导入');
    expect(harness.title.textContent).toBe('导入将替换当前文档。');
    expect(harness.body.children.some((child) => child.textContent.includes('是否继续'))).toBe(
      true,
    );

    expect(harness.controller.onClick(action('import-confirm') as unknown as Element)).toBe(true);
    expect(harness.replaceDocument).toHaveBeenCalledOnce();
    expect(harness.replaceDocument).toHaveBeenCalledWith(document);
    expect(harness.notify).toHaveBeenCalledWith('文档已导入。');
    expect(harness.dialog.hidden).toBe(true);
    expect(harness.body.children).toEqual([]);
  });

  it('R2 确认时替换失败保留确认视图并上报诊断', async () => {
    const harness = createHarness();
    harness.replaceDocument.mockReturnValueOnce({
      ok: false,
      diagnostics: [diagnostic('CORE_COMMAND_TARGET_LOCKED', ['components.0'])],
    });

    harness.controller.request(importFile(JSON.stringify(document)));
    await flush();
    harness.controller.onClick(action('import-confirm') as unknown as Element);

    expect(harness.report).toHaveBeenCalledOnce();
    expect(harness.report).toHaveBeenCalledWith([
      expect.objectContaining({ code: 'CORE_COMMAND_TARGET_LOCKED' }),
    ]);
    expect(harness.dialog.hidden).toBe(false);
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it('R2 取消清空确认视图且不替换文档', async () => {
    const harness = createHarness();

    harness.controller.request(importFile(JSON.stringify(document)));
    await flush();
    expect(harness.controller.onClick(action('import-cancel') as unknown as Element)).toBe(true);

    expect(harness.replaceDocument).not.toHaveBeenCalled();
    expect(harness.dialog.hidden).toBe(true);
  });

  it('R2 无效 JSON 展示错误视图与解析诊断，不替换文档', async () => {
    const harness = createHarness();

    harness.controller.request(importFile('{not json'));
    await flush();

    expect(harness.dialog.hidden).toBe(false);
    expect(harness.dialog.ariaLabel).toBe('导入失败');
    expect(harness.title.textContent).toBe('导入失败');
    expect(harness.replaceDocument).not.toHaveBeenCalled();
    expect(harness.report).toHaveBeenCalledOnce();
    const list = harness.body.children[0]!;
    expect(list.tagName).toBe('ul');
    expect(list.children[0]!.children.map((item) => item.textContent)).toEqual([
      'DOCUMENT_FIELD_INVALID',
      '导入文件无法解析。',
    ]);
  });

  it('R2 非规范文档展示解析诊断明细，关闭按钮清空错误视图', async () => {
    const harness = createHarness();

    harness.controller.request(importFile(JSON.stringify({ canvas: { width: 'x' } })));
    await flush();

    expect(harness.dialog.hidden).toBe(false);
    expect(harness.dialog.ariaLabel).toBe('导入失败');
    const list = harness.body.children[0]!;
    expect(list.children.length).toBeGreaterThan(0);
    const firstItem = list.children[0]!;
    expect(firstItem.children[0]!.textContent).toMatch(/^[A-Z_]+$/);
    expect(
      firstItem.children.some(
        (item) =>
          item.tagName === 'code' && item.textContent !== undefined && item.textContent !== '',
      ),
    ).toBe(true);
    expect(harness.replaceDocument).not.toHaveBeenCalled();

    expect(harness.controller.onClick(action('import-close') as unknown as Element)).toBe(true);
    expect(harness.dialog.hidden).toBe(true);
    expect(harness.body.children).toEqual([]);
  });

  it('R2 错误视图下确认动作不生效', async () => {
    const harness = createHarness();

    harness.controller.request(importFile('{not json'));
    await flush();

    expect(harness.controller.onClick(action('import-confirm') as unknown as Element)).toBe(false);
    expect(harness.replaceDocument).not.toHaveBeenCalled();
  });
});

function diagnostic(code: ScreenDiagnostic['code'], path: readonly string[]): ScreenDiagnostic {
  return { severity: 'error', code, path, message: 'diagnostic message' };
}
