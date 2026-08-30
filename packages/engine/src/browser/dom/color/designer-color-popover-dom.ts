const POPOVER_GAP = 6;
const POPOVER_MARGIN = 8;
const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 560;
const POPOVER_MIN_HEIGHT = 120;

const openColorPalette = new WeakMap<Document, HTMLElement>();
const openColorPaletteKey = new WeakMap<Document, string>();
const colorPaletteDismissBound = new WeakSet<Document>();
const colorPalettePositionScheduled = new WeakSet<HTMLElement>();
const colorPaletteDismissSequence = new WeakMap<
  Document,
  { readonly pointerId: number; released: boolean; clearTimer?: number }
>();
const colorPaletteScrollBinding = new WeakMap<
  Document,
  { readonly target: HTMLElement; readonly listener: EventListener }
>();

export function setDesignerColorPaletteOpen(palette: HTMLElement, open: boolean): void {
  const ownerDocument = palette.ownerDocument;
  const fieldKey = palette.dataset.colorPaletteKey;
  if (open) {
    const previous = openColorPalette.get(ownerDocument);
    if (previous !== undefined && previous !== palette) {
      unbindColorPaletteAnchorScroll(ownerDocument);
      applyDesignerColorPaletteOpen(previous, false);
    }
    openColorPalette.set(ownerDocument, palette);
    if (fieldKey !== undefined) openColorPaletteKey.set(ownerDocument, fieldKey);
    bindColorPaletteAnchorScroll(palette);
  } else if (openColorPalette.get(ownerDocument) === palette) {
    openColorPalette.delete(ownerDocument);
    unbindColorPaletteAnchorScroll(ownerDocument);
    if (fieldKey !== undefined && openColorPaletteKey.get(ownerDocument) === fieldKey) {
      openColorPaletteKey.delete(ownerDocument);
    }
  }
  applyDesignerColorPaletteOpen(palette, open);
}

export function restoreDesignerColorPaletteOpen(palette: HTMLElement): void {
  const fieldKey = palette.dataset.colorPaletteKey;
  if (fieldKey !== undefined && openColorPaletteKey.get(palette.ownerDocument) === fieldKey) {
    setDesignerColorPaletteOpen(palette, true);
  }
}

export function focusDesignerColorPaletteDialog(palette: HTMLElement): void {
  scheduleColorPopoverWork(palette, () => {
    const checkedMode = palette.querySelector<HTMLInputElement>(
      '[data-color-palette-field="mode"]:checked',
    );
    const close = palette.querySelector<HTMLButtonElement>('[data-color-palette-action="close"]');
    (checkedMode ?? close)?.focus();
  });
}

export function bindDesignerColorPaletteDismiss(ownerDocument: Document): void {
  if (colorPaletteDismissBound.has(ownerDocument)) return;
  colorPaletteDismissBound.add(ownerDocument);
  const eventDocument = ownerDocument as Document & {
    addEventListener?: Document['addEventListener'];
  };
  eventDocument.addEventListener?.(
    'pointerdown',
    (event) => {
      clearColorPaletteDismissSequence(ownerDocument);
      const palette = openColorPalette.get(ownerDocument);
      const target = event.target as Node | null;
      const eventPath = event.composedPath?.() ?? [];
      if (
        palette !== undefined &&
        target !== null &&
        !eventPath.includes(palette) &&
        !palette.contains(target)
      ) {
        startColorPaletteDismissSequence(ownerDocument, event as PointerEvent);
        setDesignerColorPaletteOpen(palette, false);
      }
    },
    true,
  );
  eventDocument.addEventListener?.(
    'pointerup',
    (event) => finishColorPaletteDismissPointer(ownerDocument, event as PointerEvent),
    true,
  );
  eventDocument.addEventListener?.(
    'pointercancel',
    (event) => cancelColorPaletteDismissPointer(ownerDocument, event as PointerEvent),
    true,
  );
  for (const type of ['click', 'auxclick', 'contextmenu'] as const) {
    eventDocument.addEventListener?.(
      type,
      (event) => finishColorPaletteDismissActivation(ownerDocument, event),
      true,
    );
  }
  eventDocument.addEventListener?.(
    'keydown',
    (event) => {
      const keyboardEvent = event as KeyboardEvent;
      const palette = openColorPalette.get(ownerDocument);
      if (keyboardEvent.key !== 'Escape' || palette === undefined) return;
      keyboardEvent.preventDefault();
      setDesignerColorPaletteOpen(palette, false);
      palette.querySelector<HTMLButtonElement>('[data-color-palette-action="toggle"]')?.focus();
    },
    true,
  );
  eventDocument.addEventListener?.(
    'scroll',
    (event) => {
      const palette = openColorPalette.get(ownerDocument);
      if (palette === undefined) return;
      const popover = palette.querySelector<HTMLElement>('[data-color-palette-popover]');
      const path = event.composedPath?.() ?? [];
      if (popover !== null && (path.includes(popover) || popover.contains(event.target as Node))) {
        return;
      }
      const pane = palette.closest<HTMLElement>('[data-inspector-pane]');
      if (pane !== null && (path.includes(pane) || pane.contains(event.target as Node))) {
        scheduleColorPopoverPosition(palette);
        return;
      }
      setDesignerColorPaletteOpen(palette, false);
    },
    true,
  );
  ownerDocument.defaultView?.addEventListener('resize', () => {
    const palette = openColorPalette.get(ownerDocument);
    if (palette !== undefined) scheduleColorPopoverPosition(palette);
  });
}

function startColorPaletteDismissSequence(ownerDocument: Document, event: PointerEvent): void {
  const sequence = { pointerId: event.pointerId, released: false };
  colorPaletteDismissSequence.set(ownerDocument, sequence);
  consumeColorPaletteDismissEvent(event);
}

function finishColorPaletteDismissPointer(ownerDocument: Document, event: PointerEvent): void {
  const sequence = colorPaletteDismissSequence.get(ownerDocument);
  if (sequence === undefined || sequence.pointerId !== event.pointerId) return;
  sequence.released = true;
  consumeColorPaletteDismissEvent(event);
  const view = ownerDocument.defaultView;
  if (view === null || view === undefined) return;
  sequence.clearTimer = view.setTimeout(() => {
    if (colorPaletteDismissSequence.get(ownerDocument) === sequence) {
      colorPaletteDismissSequence.delete(ownerDocument);
    }
  }, 0);
}

function cancelColorPaletteDismissPointer(ownerDocument: Document, event: PointerEvent): void {
  const sequence = colorPaletteDismissSequence.get(ownerDocument);
  if (sequence === undefined || sequence.pointerId !== event.pointerId) return;
  consumeColorPaletteDismissEvent(event);
  clearColorPaletteDismissSequence(ownerDocument);
}

function finishColorPaletteDismissActivation(ownerDocument: Document, event: Event): void {
  const sequence = colorPaletteDismissSequence.get(ownerDocument);
  if (sequence === undefined || !sequence.released) return;
  consumeColorPaletteDismissEvent(event);
  clearColorPaletteDismissSequence(ownerDocument);
}

function clearColorPaletteDismissSequence(ownerDocument: Document): void {
  const sequence = colorPaletteDismissSequence.get(ownerDocument);
  if (sequence?.clearTimer !== undefined) {
    ownerDocument.defaultView?.clearTimeout(sequence.clearTimer);
  }
  colorPaletteDismissSequence.delete(ownerDocument);
}

function consumeColorPaletteDismissEvent(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function applyDesignerColorPaletteOpen(palette: HTMLElement, open: boolean): void {
  palette.dataset.colorPaletteOpen = String(open);
  const trigger = palette.querySelector<HTMLButtonElement>('[data-color-palette-action="toggle"]');
  const popover = palette.querySelector<HTMLElement>('[data-color-palette-popover]');
  if (trigger !== null) trigger.setAttribute('aria-expanded', String(open));
  if (popover === null) return;
  popover.hidden = !open;
  if (open) {
    positionDesignerColorPopover(palette);
    scheduleColorPopoverWork(palette, () => {
      bindColorPaletteAnchorScroll(palette);
      positionDesignerColorPopover(palette);
    });
  }
}

function bindColorPaletteAnchorScroll(palette: HTMLElement): void {
  const ownerDocument = palette.ownerDocument;
  const target = palette.closest<HTMLElement>('[data-inspector-pane]');
  const current = colorPaletteScrollBinding.get(ownerDocument);
  if (current?.target === target) return;
  unbindColorPaletteAnchorScroll(ownerDocument);
  if (target === null) return;
  const listener = (): void => {
    if (openColorPalette.get(ownerDocument) === palette) {
      scheduleColorPopoverPosition(palette);
    }
  };
  target.addEventListener('scroll', listener);
  colorPaletteScrollBinding.set(ownerDocument, { target, listener });
}

function unbindColorPaletteAnchorScroll(ownerDocument: Document): void {
  const binding = colorPaletteScrollBinding.get(ownerDocument);
  if (binding === undefined) return;
  binding.target.removeEventListener('scroll', binding.listener);
  colorPaletteScrollBinding.delete(ownerDocument);
}

function positionDesignerColorPopover(palette: HTMLElement): void {
  if (palette.dataset.colorPaletteOpen !== 'true') return;
  const trigger = palette.querySelector<HTMLElement>('[data-color-palette-action="toggle"]');
  const popover = palette.querySelector<HTMLElement>('[data-color-palette-popover]');
  const triggerRect = readRect(trigger);
  const style = popover?.style;
  if (triggerRect === undefined || popover === null || style === undefined) return;

  const view = palette.ownerDocument.defaultView;
  const viewportWidth = view?.innerWidth ?? palette.ownerDocument.documentElement?.clientWidth ?? 0;
  const viewportHeight =
    view?.innerHeight ?? palette.ownerDocument.documentElement?.clientHeight ?? 0;
  if (viewportWidth <= 0 || viewportHeight <= 0) return;
  const paneRect = readRect(palette.closest<HTMLElement>('[data-inspector-pane]'));
  const boundary = {
    top: Math.max(POPOVER_MARGIN, paneRect?.top ?? POPOVER_MARGIN),
    right: Math.min(
      viewportWidth - POPOVER_MARGIN,
      paneRect?.right ?? viewportWidth - POPOVER_MARGIN,
    ),
    bottom: Math.min(
      viewportHeight - POPOVER_MARGIN,
      paneRect?.bottom ?? viewportHeight - POPOVER_MARGIN,
    ),
    left: Math.max(POPOVER_MARGIN, paneRect?.left ?? POPOVER_MARGIN),
  };
  const availableWidth = Math.max(0, boundary.right - boundary.left);
  const width = Math.min(POPOVER_WIDTH, availableWidth);
  if (width <= 0) return;
  const left = clamp(triggerRect.right - width, boundary.left, boundary.right - width);
  style.width = `${Math.round(width)}px`;
  style.left = `${Math.round(left)}px`;

  const measuredHeight = Math.min(
    POPOVER_MAX_HEIGHT,
    Math.max(popover.scrollHeight, readRect(popover)?.height ?? 0),
  );
  const spaceBelow = Math.max(0, boundary.bottom - triggerRect.bottom - POPOVER_GAP);
  const spaceAbove = Math.max(0, triggerRect.top - boundary.top - POPOVER_GAP);
  const placeAbove = spaceBelow < measuredHeight && spaceAbove > spaceBelow;
  const availableHeight = placeAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(POPOVER_MAX_HEIGHT, Math.max(POPOVER_MIN_HEIGHT, availableHeight));
  const renderedHeight = Math.min(measuredHeight, maxHeight);
  const top = placeAbove
    ? Math.max(boundary.top, triggerRect.top - POPOVER_GAP - renderedHeight)
    : Math.min(boundary.bottom - renderedHeight, triggerRect.bottom + POPOVER_GAP);
  popover.dataset.colorPalettePlacement = placeAbove ? 'top' : 'bottom';
  style.top = `${Math.round(top)}px`;
  style.maxHeight = `${Math.round(maxHeight)}px`;
}

function scheduleColorPopoverPosition(palette: HTMLElement): void {
  if (colorPalettePositionScheduled.has(palette)) return;
  colorPalettePositionScheduled.add(palette);
  const work = (): void => {
    colorPalettePositionScheduled.delete(palette);
    if (openColorPalette.get(palette.ownerDocument) === palette) {
      positionDesignerColorPopover(palette);
    }
  };
  const view = palette.ownerDocument.defaultView;
  if (view?.requestAnimationFrame !== undefined) {
    view.requestAnimationFrame(work);
    return;
  }
  if (view?.queueMicrotask !== undefined) {
    view.queueMicrotask(work);
    return;
  }
  work();
}

function readRect(element: HTMLElement | null): DOMRect | undefined {
  const getBoundingClientRect = (
    element as (HTMLElement & { getBoundingClientRect?: () => DOMRect }) | null
  )?.getBoundingClientRect;
  if (typeof getBoundingClientRect !== 'function') return undefined;
  return getBoundingClientRect.call(element);
}

function scheduleColorPopoverWork(palette: HTMLElement, work: () => void): void {
  const view = palette.ownerDocument.defaultView;
  if (view?.requestAnimationFrame !== undefined) {
    view.requestAnimationFrame(() => {
      if (palette.dataset.colorPaletteOpen === 'true') work();
    });
    return;
  }
  palette.ownerDocument.defaultView?.queueMicrotask?.(() => {
    if (palette.dataset.colorPaletteOpen === 'true') work();
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
