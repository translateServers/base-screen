import { describe, expect, it } from 'vitest';
import { renderDesignerSelection } from '../../../src/browser/dom/designer-selection-dom.js';

describe('renderDesignerSelection', () => {
  it('hides and clears a stale overlay when its document is unavailable', () => {
    let cleared = false;
    const selection = {
      style: { display: 'block' },
      replaceChildren: () => {
        cleared = true;
      },
    } as unknown as HTMLDivElement;

    renderDesignerSelection(
      selection,
      undefined as unknown as Document,
      undefined,
      ['text-1'],
      undefined,
    );

    expect(selection.style.display).toBe('none');
    expect(cleared).toBe(true);
  });

  it('appends a grab layer whose clip-path carves out every selected component', () => {
    const appended: Array<{
      className: string;
      dataset: Record<string, string>;
      style: Record<string, string>;
      textContent?: string;
    }> = [];
    const ownerDocument = {
      createElement: () => {
        const element = {
          className: '',
          dataset: {} as Record<string, string>,
          style: {} as Record<string, string>,
          textContent: '',
          setAttribute: () => undefined,
        };
        appended.push(element);
        return element;
      },
    } as unknown as Document;
    const selection = {
      appendChild: (element: unknown) => {
        appended.push(element as never);
      },
      ownerDocument,
      replaceChildren: () => undefined,
      style: {} as Record<string, string>,
    } as unknown as HTMLDivElement;
    const document = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [
        {
          id: 'rectangle-1',
          type: 'base.rectangle',
          name: 'Rectangle',
          parentId: null,
          position: { x: 10, y: 20 },
          size: { width: 100, height: 80 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: {},
          style: {},
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { relations: [] },
    };
    const catalog = {
      get: () =>
        ({
          manifest: {
            designCapabilities: { resize: true, rotate: true },
          },
        }) as unknown,
    } as never;

    renderDesignerSelection(selection, ownerDocument, document as never, ['rectangle-1'], catalog);

    const grab = appended.find((element) => element.className === 'selection-grab');
    expect(grab?.dataset.selectionGrab).toBe('true');
    expect(grab?.style.clipPath).toContain(
      'polygon(evenodd, 0px 0px, 100px 0px, 100px 80px, 0px 80px',
    );
    expect(grab?.style.clipPath).toContain('0px 0px, 100px 0px, 100px 80px, 0px 80px');
  });

  it('labels the selection with the component name and material type', () => {
    const appended: Array<{
      className: string;
      dataset: Record<string, string>;
      textContent?: string;
    }> = [];
    const ownerDocument = {
      createElement: () => {
        const element = {
          className: '',
          dataset: {} as Record<string, string>,
          style: {} as Record<string, string>,
          textContent: '',
          setAttribute: () => undefined,
        };
        appended.push(element);
        return element;
      },
    } as unknown as Document;
    const selection = {
      appendChild: (element: unknown) => {
        appended.push(element as never);
      },
      ownerDocument,
      replaceChildren: () => undefined,
      style: {} as Record<string, string>,
    } as unknown as HTMLDivElement;
    const document = {
      canvas: { width: 960, height: 540, backgroundColor: '#000000' },
      components: [
        {
          id: 'rectangle-1',
          type: 'base.rectangle',
          name: 'Rectangle',
          parentId: null,
          position: { x: 10, y: 20 },
          size: { width: 100, height: 80 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: {},
          style: {},
          dataSource: null,
        },
        {
          id: 'rectangle-2',
          type: 'base.rectangle',
          name: 'Second',
          parentId: null,
          position: { x: 200, y: 20 },
          size: { width: 100, height: 80 },
          rotation: 0,
          zIndex: 1,
          status: { locked: false, hidden: false },
          props: {},
          style: {},
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { relations: [] },
    };
    const catalog = {
      get: () =>
        ({
          manifest: {
            designCapabilities: { resize: true, rotate: true },
          },
        }) as unknown,
    } as never;

    renderDesignerSelection(selection, ownerDocument, document as never, ['rectangle-1'], catalog);
    const single = appended.find((element) => element.className === 'selection-tag');
    expect(single?.dataset.selectionTag).toBe('true');
    expect(single?.textContent).toBe('Rectangle · base.rectangle');

    appended.length = 0;
    renderDesignerSelection(
      selection,
      ownerDocument,
      document as never,
      ['rectangle-1', 'rectangle-2'],
      catalog,
    );
    expect(appended.find((element) => element.className === 'selection-tag')?.textContent).toBe(
      '已选中 2 个组件',
    );
  });
});
