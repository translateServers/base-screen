import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';
import { clickTarget, createWorkbench } from './designer-workbench-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('DesignerWorkbenchController instance state', () => {
  it('keeps canvas aids, guides, and panel state local to each workbench', () => {
    const first = createWorkbench();
    const second = createWorkbench();
    first.controller.initialize();
    second.controller.initialize();

    first.controller.toggleCanvasAid('gridEnabled');
    first.controller.onClick(clickTarget({ panelTab: 'layers' }));
    first.controller.onClick(clickTarget({ panelCollapse: 'left' }));
    first.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;
    first.controller.onPointerDown({
      target: ruler,
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    first.controller.onPointerUp({ pointerId: 1, clientX: 50, clientY: 0 } as PointerEvent);

    expect(first.grid.ariaPressed).toBe('false');
    expect(second.grid.ariaPressed).toBe('true');
    expect(first.layout.dataset.leftCollapsed).toBe('true');
    expect(second.layout.dataset.leftCollapsed).toBe('false');
    expect(first.leftTabs[1]?.ariaSelected).toBe('true');
    expect(second.leftTabs[0]?.ariaSelected).toBe('true');
    expect(first.rightTabs[1]?.ariaSelected).toBe('true');
    expect(second.rightTabs[0]?.ariaSelected).toBe('true');
    expect(first.guides.children).toHaveLength(1);
    expect(first.controller.snapPoint({ x: 47, y: 47 })).toEqual({
      x: 50,
      y: 47,
      snappedX: 50,
    });
    expect(second.controller.snapPoint({ x: 47, y: 47 })).toEqual({ x: 47, y: 47 });
  });

  it('R4 expands the collapsed rail when an icon tab is clicked and switches the tab', () => {
    const { controller, layout, leftTabs } = createWorkbench();
    controller.initialize();
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');

    controller.onClick(clickTarget({ panelTab: 'layers' }));

    expect(layout.dataset.leftCollapsed).toBe('false');
    expect(leftTabs[1]?.ariaSelected).toBe('true');
    expect(leftTabs[0]?.ariaSelected).toBe('false');
  });

  it('selects host groups, updates the panel header, and falls back when a group disappears', () => {
    const changes: (string | undefined)[] = [];
    const workbench = createWorkbench({
      hostLeftPanelGroup: { id: 'assets', label: 'Assets' },
      onLeftPanelGroupChange: (groupId) => changes.push(groupId),
    });
    workbench.controller.initialize();
    workbench.controller.onClick(clickTarget({ panelCollapse: 'left' }));

    expect(workbench.controller.selectLeftPanelGroup('assets')).toBe(true);
    expect(workbench.layout.dataset.leftCollapsed).toBe('false');
    expect(workbench.leftTabs[2]?.ariaSelected).toBe('true');
    expect(workbench.hostLeftPanelPanes[0]?.hidden).toBe(false);
    expect(workbench.materials.hidden).toBe(true);
    expect(workbench.leftTitle.textContent).toBe('Assets');
    expect(workbench.leftCount.hidden).toBe(true);
    expect(changes).toEqual(['assets']);
    expect(workbench.controller.selectLeftPanelGroup('missing')).toBe(false);

    workbench.leftTabs.pop();
    workbench.hostLeftPanelPanes.pop();
    workbench.controller.refreshLeftPanelGroups();

    expect(workbench.leftTabs[0]?.ariaSelected).toBe('true');
    expect(workbench.materials.hidden).toBe(false);
    expect(workbench.leftCount.hidden).toBe(false);
    expect(changes).toEqual(['assets', undefined]);
  });

  it('keeps the panel highlight line centered under the pointer while resizing', () => {
    const workbench = createWorkbench();
    // .designer 边框 1px + 分隔列 5px（1px 高亮线居中）：面板宽度 = 指针到内容原点距离 - 列中线，
    // 使拖拽中高亮线始终与指针精确重合（历史 -48 偏移已移除）。
    workbench.layout.clientLeft = 1;
    workbench.layout.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 100,
      right: 1300,
      top: 0,
      width: 1200,
    });
    const panelHandle = (side: string) =>
      ({
        closest: (selector: string) =>
          selector === '[data-panel-handle]' ? { dataset: { panelHandle: side } } : null,
      }) as unknown as HTMLElement;
    const style = workbench.layout.style as unknown as Record<string, string>;

    workbench.controller.onPointerDown({
      target: panelHandle('left'),
      pointerId: 1,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    // 指针位于高亮线（列中线 = 100 + 1 + 300 + 2.5）时，面板宽度恰好为 300px。
    workbench.controller.onPointerMove({ pointerId: 1, clientX: 403.5 } as unknown as PointerEvent);
    expect(style['--left-panel-width']).toBe('300px');
    // 拖出上限后仍按列中线跟随指针，仅受钳制约束。
    workbench.controller.onPointerMove({ pointerId: 1, clientX: 903.5 } as unknown as PointerEvent);
    expect(style['--left-panel-width']).toBe('480px');
    workbench.controller.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);
    expect(workbench.layout.captures.has(1)).toBe(false);

    workbench.controller.onPointerDown({
      target: panelHandle('right'),
      pointerId: 2,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 996.5 } as unknown as PointerEvent);
    expect(style['--right-panel-width']).toBe('300px');
    workbench.controller.onPointerUp({ pointerId: 2 } as unknown as PointerEvent);
    expect(workbench.layout.captures.has(2)).toBe(false);
  });

  it('R1 collapses to the 48px rail after a width drag and restores the dragged width', () => {
    const workbench = createWorkbench();
    const { controller, layout } = workbench;
    layout.clientLeft = 1;
    layout.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 100,
      right: 1300,
      top: 0,
      width: 1200,
    });
    const style = layout.style as unknown as Record<string, string>;
    const drag = (side: string, clientX: number, pointerId: number) => {
      controller.onPointerDown({
        target: {
          closest: (selector: string) =>
            selector === '[data-panel-handle]' ? { dataset: { panelHandle: side } } : null,
        } as unknown as HTMLElement,
        pointerId,
        preventDefault: () => undefined,
      } as unknown as PointerEvent);
      controller.onPointerMove({ pointerId, clientX } as unknown as PointerEvent);
      controller.onPointerUp({ pointerId } as unknown as PointerEvent);
    };

    // 左面板：拖到 380px 后折叠必须收敛到 48px，展开恢复拖拽宽度。
    drag('left', 100 + 1 + 380 + 2.5, 1);
    expect(style['--left-panel-width']).toBe('380px');
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');
    expect(style['--left-panel-width']).toBe('48px');
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('false');
    expect(style['--left-panel-width']).toBe('380px');

    // 右面板：拖到 340px 后同样折叠收敛、展开恢复。
    drag('right', 1300 - 340 - 1 - 2.5, 2);
    expect(style['--right-panel-width']).toBe('340px');
    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(layout.dataset.rightCollapsed).toBe('true');
    expect(style['--right-panel-width']).toBe('48px');
    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(style['--right-panel-width']).toBe('340px');
  });

  it('restores the persisted inspector width when the host initializes while hidden', () => {
    const storage = new Map<string, string>([['base-screen.designer.inspector-width', '420']]);
    const workbench = createWorkbench({ storage });
    const style = workbench.layout.style as unknown as Record<string, string>;

    // XJ Data Hub 使用 v-show：自定义元素 connected 时宿主仍为 display:none，
    // getBoundingClientRect().width 为 0。持久化宽度不得因此被压成 288px。
    expect(workbench.layout.getBoundingClientRect().width).toBe(0);
    workbench.controller.initialize();

    expect(style['--right-panel-width']).toBe('420px');
    expect(storage.get('base-screen.designer.inspector-width')).toBe('420');
  });

  it('R1 keeps the host default width when collapsing without a prior drag', () => {
    const workbench = createWorkbench();
    const { controller, layout } = workbench;
    const style = layout.style as unknown as Record<string, string>;
    controller.initialize();

    // 从未拖拽：不写内联宽度变量，宿主 CSS 默认生效。
    expect(style['--left-panel-width']).toBeUndefined();
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');
    expect(style['--left-panel-width']).toBe('48px');
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(style['--left-panel-width']).toBeUndefined();
  });

  it('R2 expands a collapsed panel only after dragging past the expand threshold', () => {
    const workbench = createWorkbench();
    const { controller, layout } = workbench;
    layout.clientLeft = 1;
    layout.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 100,
      right: 1300,
      top: 0,
      width: 1200,
    });
    controller.initialize();
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(layout.dataset.leftCollapsed).toBe('true');
    const style = layout.style as unknown as Record<string, string>;
    const handle = {
      closest: (selector: string) =>
        selector === '[data-panel-handle]' ? { dataset: { panelHandle: 'left' } } : null,
    } as unknown as HTMLElement;

    controller.onPointerDown({
      target: handle,
      pointerId: 1,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    // 阈值内拖拽（宽度 58 < 48+24）：保持折叠，宽度变量不变。
    controller.onPointerMove({
      pointerId: 1,
      clientX: 100 + 1 + 58 + 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.leftCollapsed).toBe('true');
    expect(style['--left-panel-width']).toBe('48px');
    // 越过阈值（宽度 300 ≥ 48+24）：展开并应用拖拽宽度。
    controller.onPointerMove({
      pointerId: 1,
      clientX: 100 + 1 + 300 + 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.leftCollapsed).toBe('false');
    expect(style['--left-panel-width']).toBe('300px');
    controller.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);

    // 右面板同阈值语义：先折叠，阈值内保持折叠，越过阈值展开。
    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(layout.dataset.rightCollapsed).toBe('true');
    controller.onPointerDown({
      target: {
        closest: (selector: string) =>
          selector === '[data-panel-handle]' ? { dataset: { panelHandle: 'right' } } : null,
      } as unknown as HTMLElement,
      pointerId: 2,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    controller.onPointerMove({
      pointerId: 2,
      clientX: 1300 - 58 - 1 - 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.rightCollapsed).toBe('true');
    expect(style['--right-panel-width']).toBe('48px');
    controller.onPointerMove({
      pointerId: 2,
      clientX: 1300 - 300 - 1 - 2.5,
    } as unknown as PointerEvent);
    expect(layout.dataset.rightCollapsed).toBe('false');
    expect(style['--right-panel-width']).toBe('300px');
    controller.onPointerUp({ pointerId: 2 } as unknown as PointerEvent);
  });

  it('R3 switches collapse control labels between collapse and expand', () => {
    const workbench = createWorkbench();
    const { controller } = workbench;
    controller.initialize();
    expect(workbench.leftCollapseControl.title).toBe(DESIGNER_UI_TEXT.collapseMaterials);
    expect(workbench.rightCollapseControl.title).toBe(DESIGNER_UI_TEXT.collapseInspector);
    expect(workbench.leftCollapseControl.attributes['aria-expanded']).toBe('true');
    expect(workbench.rightCollapseControl.attributes['aria-expanded']).toBe('true');

    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(workbench.leftCollapseControl.title).toBe(DESIGNER_UI_TEXT.expandMaterials);
    expect(workbench.leftCollapseControl.attributes['aria-label']).toBe(
      DESIGNER_UI_TEXT.expandMaterials,
    );
    expect(workbench.leftCollapseControl.attributes['aria-expanded']).toBe('false');
    controller.onClick(clickTarget({ panelCollapse: 'left' }));
    expect(workbench.leftCollapseControl.title).toBe(DESIGNER_UI_TEXT.collapseMaterials);
    expect(workbench.leftCollapseControl.attributes['aria-expanded']).toBe('true');

    controller.onClick(clickTarget({ panelCollapse: 'right' }));
    expect(workbench.rightCollapseControl.title).toBe(DESIGNER_UI_TEXT.expandInspector);
    expect(workbench.rightCollapseControl.attributes['aria-label']).toBe(
      DESIGNER_UI_TEXT.expandInspector,
    );
    expect(workbench.rightCollapseControl.attributes['aria-expanded']).toBe('false');
  });

  it('R4 snap toggle gates snapping while keeping raw coordinates', () => {
    const { controller } = createWorkbench();
    expect(controller.snapEnabled).toBe(true);
    expect(controller.snapPoint({ x: 3, y: 3 }).snappedX).toBe(0);
    controller.toggleSnap();
    expect(controller.snapEnabled).toBe(false);
    expect(controller.snapPoint({ x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
    expect(
      controller.snapSelectionOffset({ left: 0, right: 50, top: 0, bottom: 40 }, { x: 3, y: 3 }),
    ).toEqual({ x: 3, y: 3 });
    controller.toggleSnap();
    expect(controller.snapEnabled).toBe(true);
  });

  it('exposes canvas aid toggle states for menu checkmarks', () => {
    const { controller } = createWorkbench();
    expect(controller.isCanvasAidEnabled('gridEnabled')).toBe(true);
    expect(controller.guidesVisible).toBe(true);
    expect(controller.borderGuidesEnabled).toBe(true);

    controller.toggleCanvasAid('gridEnabled');
    expect(controller.isCanvasAidEnabled('gridEnabled')).toBe(false);
    controller.toggleCanvasAid('gridEnabled');
    expect(controller.isCanvasAidEnabled('gridEnabled')).toBe(true);

    controller.toggleGuides();
    expect(controller.guidesVisible).toBe(false);
    controller.toggleGuides();
    expect(controller.guidesVisible).toBe(true);

    controller.toggleBorderGuides();
    expect(controller.borderGuidesEnabled).toBe(false);
    controller.toggleBorderGuides();
    expect(controller.borderGuidesEnabled).toBe(true);
  });

  it('routes the bottom status snap switch through the workbench click handler', () => {
    const { controller } = createWorkbench();

    expect(controller.onClick(clickTarget({ statusToggle: 'snap' }))).toBe(true);
    expect(controller.snapEnabled).toBe(false);
  });

  it('routes the bottom status native events switch through the workbench click handler', () => {
    const changed: boolean[] = [];
    const { controller } = createWorkbench({
      onNativeEventsChange: (enabled) => changed.push(enabled),
    });

    expect(controller.nativeEventsEnabled).toBe(false);
    expect(controller.onClick(clickTarget({ statusToggle: 'native-events' }))).toBe(true);
    expect(controller.nativeEventsEnabled).toBe(true);
    expect(changed).toEqual([true]);

    expect(controller.onClick(clickTarget({ statusToggle: 'native-events' }))).toBe(true);
    expect(controller.nativeEventsEnabled).toBe(false);
    expect(changed).toEqual([true, false]);
  });

  it('keeps the native events switch functional without a change callback', () => {
    const { controller } = createWorkbench();
    expect(() => controller.toggleNativeEvents()).not.toThrow();
    expect(controller.nativeEventsEnabled).toBe(true);
    expect(() => controller.toggleNativeEvents()).not.toThrow();
    expect(controller.nativeEventsEnabled).toBe(false);
  });

  it('syncs the native events status toggle aria state with the controller state', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    expect(workbench.nativeEventsToggle.attributes['aria-checked']).toBe('false');

    workbench.controller.toggleNativeEvents();
    expect(workbench.nativeEventsToggle.attributes['aria-checked']).toBe('true');
  });

  it('keeps native events state local to each workbench instance', () => {
    const first = createWorkbench();
    const second = createWorkbench();
    first.controller.toggleNativeEvents();
    expect(first.controller.nativeEventsEnabled).toBe(true);
    expect(second.controller.nativeEventsEnabled).toBe(false);
  });

  it('R7 moves, double-click deletes, and discards out-of-bounds guides without touching the document', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const originalDocument = structuredClone(workbench.document);
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;

    workbench.controller.onPointerDown({
      target: ruler,
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 1, clientX: 50, clientY: 0 } as PointerEvent);
    const guide = workbench.guides.children[0]!;
    workbench.canvas.dispatch('pointerdown', {
      target: guide,
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 100, clientY: 0 } as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 2, clientX: 100, clientY: 0 } as PointerEvent);

    expect(workbench.guides.children).toHaveLength(1);
    // 参考线以对齐坐标定位，CSS translate(-50%) 使线中心与坐标精确重合。
    expect((workbench.guides.children[0]!.style as unknown as Record<string, string>).left).toBe(
      '100px',
    );
    // 真实浏览器中 dblclick 的 target 是捕获元素（画布）而非参考线：以坐标命中参考线。
    workbench.canvas.dispatch('dblclick', {
      target: workbench.canvas,
      clientX: 100,
      clientY: 0,
      stopImmediatePropagation: () => undefined,
    } as unknown as MouseEvent);
    expect(workbench.guides.children).toHaveLength(0);

    workbench.controller.onPointerDown({
      target: ruler,
      pointerId: 3,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 3, clientX: -1, clientY: 0 } as PointerEvent);

    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('R7 removes a guide on a second pointerdown within the double-click window', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const originalDocument = structuredClone(workbench.document);
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;
    workbench.controller.onPointerDown({
      target: ruler,
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 1, clientX: 50, clientY: 0 } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);

    // 第一次 pointerdown 落在参考线上，进入拖拽并原地 commit（无位移，双击判定保持武装）。
    const preventDefault = vi.fn();
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      timeStamp: 1000,
      preventDefault,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 51, clientY: 0 } as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 2, clientX: 51, clientY: 0 } as PointerEvent);
    workbench.canvas.dispatch('lostpointercapture', {
      type: 'lostpointercapture',
      pointerId: 2,
    } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);

    // 500ms 窗口内同一参考线的第二次 pointerdown = 双击：直接移除，不再进入拖拽。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 3,
      clientX: 51,
      clientY: 0,
      timeStamp: 1400,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    expect(workbench.guides.children).toHaveLength(0);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('R7 keeps a guide when the second pointerdown is a drag or falls outside the double-click window', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const originalDocument = structuredClone(workbench.document);
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;
    workbench.controller.onPointerDown({
      target: ruler,
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 1, clientX: 50, clientY: 0 } as PointerEvent);

    // 第一次点击后拖拽位移：判定失效（拖拽不等于双击点击），参考线移动而不是被移除。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      timeStamp: 1000,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerMove({ pointerId: 2, clientX: 120, clientY: 0 } as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 2, clientX: 120, clientY: 0 } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);

    // 窗口内（500ms 内）的第二次 pointerdown 不触发移除（拖拽已使判定失效），照常进入拖拽。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 3,
      clientX: 120,
      clientY: 0,
      timeStamp: 1300,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 3, clientX: 120, clientY: 0 } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);

    // 窗口外（>500ms）的第二次 pointerdown 同样不触发移除。
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 4,
      clientX: 120,
      clientY: 0,
      timeStamp: 2500,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 4, clientX: 120, clientY: 0 } as PointerEvent);
    expect(workbench.guides.children).toHaveLength(1);
    expect(workbench.document).toEqual(originalDocument);
  });

  it('R7 does not treat a click after cancelled guide capture as a double click', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    const ruler = {
      classList: { contains: (name: string) => name === 'ruler-vertical' },
      closest: (selector: string) => (selector === '.ruler' ? ruler : null),
    } as unknown as HTMLElement;
    workbench.controller.onPointerDown({
      target: ruler,
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      preventDefault: () => undefined,
    } as unknown as PointerEvent);
    workbench.controller.onPointerUp({ pointerId: 1, clientX: 50, clientY: 0 } as PointerEvent);

    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 2,
      clientX: 50,
      clientY: 0,
      timeStamp: 1000,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);
    workbench.canvas.dispatch('lostpointercapture', {
      type: 'lostpointercapture',
      pointerId: 2,
    } as PointerEvent);
    workbench.canvas.dispatch('pointerdown', {
      target: workbench.guides.children[0],
      pointerId: 3,
      clientX: 50,
      clientY: 0,
      timeStamp: 1200,
      stopImmediatePropagation: () => undefined,
    } as unknown as PointerEvent);

    expect(workbench.guides.children).toHaveLength(1);
    expect(workbench.canvas.hasPointerCapture(3)).toBe(true);
    workbench.controller.onPointerUp({ pointerId: 3, clientX: 50, clientY: 0 } as PointerEvent);
  });

  it('hides inspector tabs and falls back to appearance when no component is focused', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    expect(workbench.inspectorTabs.hidden).toBe(false);
    expect(workbench.panes[0]?.attributes.role).toBe('tabpanel');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBe('designer-appearance-tab');

    workbench.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    expect(workbench.rightTabs[1]?.ariaSelected).toBe('true');
    expect(workbench.panes[1]?.hidden).toBe(false);

    workbench.interaction.focusedComponentId = null;
    workbench.interaction.selectedComponentIds = [];
    workbench.controller.renderInspectorTabs();
    expect(workbench.inspectorTabs.hidden).toBe(true);
    expect(workbench.rightTabs[0]?.ariaSelected).toBe('true');
    expect(workbench.panes[0]?.hidden).toBe(false);
    expect(workbench.panes[1]?.hidden).toBe(true);
    expect(workbench.panes[2]?.hidden).toBe(true);
    expect(workbench.panes[0]?.attributes.role).toBe('region');
    expect(workbench.panes[0]?.attributes['aria-label']).toBe('画布');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBeUndefined();

    workbench.interaction.focusedComponentId = 'c1';
    workbench.interaction.selectedComponentIds = ['c1'];
    workbench.controller.renderInspectorTabs();
    expect(workbench.inspectorTabs.hidden).toBe(false);
    expect(workbench.rightTabs[0]?.ariaSelected).toBe('true');
    expect(workbench.panes[0]?.attributes.role).toBe('tabpanel');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBe('designer-appearance-tab');
    expect(workbench.panes[0]?.attributes['aria-label']).toBeUndefined();
  });

  it('hides inspector tabs and falls back to appearance for multi-selection', () => {
    const workbench = createWorkbench();
    workbench.controller.initialize();
    workbench.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    expect(workbench.inspectorTabs.hidden).toBe(false);
    expect(workbench.panes[1]?.hidden).toBe(false);

    workbench.interaction.focusedComponentId = 'c2';
    workbench.interaction.selectedComponentIds = ['c1', 'c2'];
    workbench.controller.renderInspectorTabs();

    expect(workbench.inspectorTabs.hidden).toBe(true);
    expect(workbench.rightTabs[0]?.ariaSelected).toBe('true');
    expect(workbench.panes[0]?.hidden).toBe(false);
    expect(workbench.panes[1]?.hidden).toBe(true);
    expect(workbench.panes[2]?.hidden).toBe(true);
    expect(workbench.panes[0]?.attributes.role).toBe('region');
    expect(workbench.panes[0]?.attributes['aria-label']).toBe('选择概览');
    expect(workbench.panes[0]?.attributes['aria-labelledby']).toBeUndefined();
  });

  it('hides the data tab when the focused material declares no data capability', () => {
    const withoutData = createWorkbench({ dataCapabilities: [] });
    withoutData.controller.initialize();

    expect(withoutData.rightTabs[1]?.hidden).toBe(true);
    withoutData.controller.onClick(clickTarget({ inspectorTab: 'data' }));
    expect(withoutData.rightTabs[0]?.ariaSelected).toBe('true');
    expect(withoutData.panes[0]?.hidden).toBe(false);

    const withData = createWorkbench({ dataCapabilities: ['static'] });
    withData.controller.initialize();
    expect(withData.rightTabs[1]?.hidden).toBe(false);
  });
});
