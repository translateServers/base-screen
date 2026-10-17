import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerPanelController } from '../../../../src/browser/controllers/panel/designer-panel-controller.js';
import {
  catalog,
  FakeDocument,
  FakeElement,
  FakeInput,
  document as fixtureDocument,
} from './designer-panel-controller-fixture.js';

class FakeSelectElement extends FakeElement {}
class FakeTextAreaElement extends FakeElement {}

afterEach(() => vi.unstubAllGlobals());

function stubEditableGlobals(): void {
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLSelectElement', FakeSelectElement);
  vi.stubGlobal('HTMLTextAreaElement', FakeTextAreaElement);
  vi.stubGlobal('HTMLElement', FakeElement);
}

function controller(hasTextSelection?: () => boolean): DesignerPanelController {
  return new DesignerPanelController({
    emitDiagnostics: () => undefined,
    executeCommand: () => ({ ok: true, value: fixtureDocument(), diagnostics: [] }),
    executeTransaction: () => ({ ok: true, value: fixtureDocument(), diagnostics: [] }),
    getCatalog: catalog,
    getDocument: fixtureDocument,
    getGroupMaterialType: () => undefined,
    getInteraction: () => ({ selectedComponentIds: ['label-1'], focusedComponentId: 'label-1' }),
    getResourcePort: () => undefined,
    getRuntimeContributions: () => undefined,
    getZoom: () => 1,
    redo: () => ({ ok: true, value: fixtureDocument(), diagnostics: [] }),
    reduceSelection: () => undefined,
    setZoom: () => undefined,
    undo: () => ({ ok: true, value: fixtureDocument(), diagnostics: [] }),
    ...(hasTextSelection === undefined ? {} : { hasTextSelection }),
  });
}

function copyKey(): KeyboardEvent & { readonly preventDefault: () => void } {
  const ownerDocument = new FakeDocument();
  return {
    altKey: false,
    ctrlKey: true,
    isComposing: false,
    key: 'c',
    metaKey: false,
    preventDefault: vi.fn(),
    target: new FakeElement('div', ownerDocument),
  } as unknown as KeyboardEvent & { readonly preventDefault: () => void };
}

describe('DesignerPanelController copy shortcut', () => {
  it('copies the selected components when no text is selected', () => {
    stubEditableGlobals();
    const event = copyKey();

    expect(controller().onKeyDown(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('defers to native text copy when the surface holds a text selection', () => {
    stubEditableGlobals();
    const event = copyKey();

    // 面板/只读文本被选中时 Ctrl+C 必须落到浏览器原生复制，不能再被组件复制抢占。
    expect(controller(() => true).onKeyDown(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
