// Kept in sync with the material-library container query; tested at both sides of the boundary.
export const MATERIAL_GROUP_INLINE_MIN_WIDTH = 264;

interface MaterialGroupPopoverSurface {
  readonly layout: HTMLElement;
  readonly navigation: HTMLElement;
  readonly inline: HTMLElement;
  readonly content: HTMLElement;
  readonly panel: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly overlay: HTMLElement;
  readonly popover: HTMLElement;
  readonly mount: HTMLElement;
}

/** Instance-scoped, bounded overlay; never owns or persists directory selection. */
export class DesignerMaterialGroupPopoverController {
  #surface: MaterialGroupPopoverSurface | undefined;
  #compact = false;
  #open = false;
  #resizeObserver: ResizeObserver | undefined;
  #visibilityObserver: MutationObserver | undefined;

  bind(layout: HTMLElement, navigation: HTMLElement): void {
    if (this.#surface?.layout === layout && this.#surface.navigation === navigation) {
      this.sync();
      return;
    }
    this.dispose();
    const surface = findSurface(layout, navigation);
    if (surface === undefined) return;
    this.#surface = surface;
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(this.sync);
      this.#resizeObserver.observe(surface.content);
      this.#resizeObserver.observe(layout);
    }
    if (typeof MutationObserver !== 'undefined') {
      this.#visibilityObserver = new MutationObserver(this.sync);
      this.#visibilityObserver.observe(layout, {
        attributes: true,
        attributeFilter: [
          'data-left-collapsed',
          'data-authoring-mode',
          'data-workbench-mode',
          'data-data-workbench-open',
        ],
      });
      this.#visibilityObserver.observe(surface.panel, {
        attributes: true,
        attributeFilter: ['hidden'],
      });
    }
    layout.addEventListener('keydown', this.onEscape, true);
    // Focus transitions within one ShadowRoot are retargeted away before reaching document.
    layout.addEventListener('focusin', this.onOutsideFocus, true);
    layout.ownerDocument.addEventListener('pointerdown', this.onOutsidePointer, true);
    layout.ownerDocument.addEventListener('focusin', this.onOutsideFocus, true);
    layout.ownerDocument.addEventListener('scroll', this.onScroll, true);
    layout.ownerDocument.defaultView?.addEventListener('resize', this.sync);
    this.sync();
  }

  dispose(): void {
    this.close(false);
    this.#resizeObserver?.disconnect();
    this.#visibilityObserver?.disconnect();
    this.#resizeObserver = undefined;
    this.#visibilityObserver = undefined;
    const layout = this.#surface?.layout;
    layout?.removeEventListener('keydown', this.onEscape, true);
    layout?.removeEventListener('focusin', this.onOutsideFocus, true);
    layout?.ownerDocument.removeEventListener('pointerdown', this.onOutsidePointer, true);
    layout?.ownerDocument.removeEventListener('focusin', this.onOutsideFocus, true);
    layout?.ownerDocument.removeEventListener('scroll', this.onScroll, true);
    layout?.ownerDocument.defaultView?.removeEventListener('resize', this.sync);
    this.#surface = undefined;
    this.#compact = false;
  }

  toggle(): void {
    this.sync();
    const surface = this.#surface;
    if (surface === undefined || !this.#compact || !this.available()) return;
    if (this.#open) {
      this.close(true);
      return;
    }
    if (!positionPopover(surface)) return;
    this.#open = true;
    surface.mount.appendChild(surface.navigation);
    surface.overlay.hidden = false;
    surface.trigger.setAttribute('aria-expanded', 'true');
    const selected = surface.navigation.querySelector<HTMLButtonElement>(
      '[data-material-group-list="children"] [aria-pressed="true"]',
    );
    const fallback = surface.navigation.querySelector<HTMLButtonElement>(
      '[data-material-group-all]',
    );
    const focused = selected ?? fallback;
    const list = focused?.closest('[data-material-group-list]');
    for (const button of list?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
      button.tabIndex = button === focused ? 0 : -1;
    }
    focused?.focus({ preventScroll: true });
  }

  close(returnFocus: boolean): void {
    const surface = this.#surface;
    if (!this.#open || surface === undefined) return;
    const focused = (surface.navigation.getRootNode() as Document | ShadowRoot).activeElement;
    const restoreInlineFocus =
      focused instanceof HTMLElement && surface.navigation.contains(focused);
    this.#open = false;
    surface.inline.appendChild(surface.navigation);
    surface.overlay.hidden = true;
    surface.trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus && this.#compact && this.available()) surface.trigger.focus();
    else if (restoreInlineFocus && !this.#compact && this.available()) focused.focus();
  }

  private readonly sync = (): void => {
    const surface = this.#surface;
    if (surface === undefined) return;
    const wasCompact = this.#compact;
    const width = surface.content.getBoundingClientRect().width;
    this.#compact = width > 0 && width < MATERIAL_GROUP_INLINE_MIN_WIDTH;
    if (!this.#open) {
      if (wasCompact !== this.#compact && this.available()) {
        const focused = (surface.navigation.getRootNode() as Document | ShadowRoot).activeElement;
        if (this.#compact && focused !== null && surface.navigation.contains(focused)) {
          surface.trigger.focus({ preventScroll: true });
        } else if (!this.#compact && focused === surface.trigger) {
          surface.navigation
            .querySelector<HTMLButtonElement>('[data-material-group-list="roots"] [tabindex="0"]')
            ?.focus({ preventScroll: true });
        }
      }
      return;
    }
    if (!this.#compact || !this.available() || !positionPopover(surface)) this.close(false);
  };

  private available(): boolean {
    const surface = this.#surface;
    return (
      surface !== undefined &&
      !surface.panel.hidden &&
      !surface.navigation.hidden &&
      surface.content.getBoundingClientRect().width > 0 &&
      surface.layout.dataset.leftCollapsed !== 'true' &&
      surface.layout.dataset.authoringMode !== 'blueprint' &&
      surface.layout.dataset.dataWorkbenchOpen !== 'true' &&
      !['with-menu', 'fullscreen'].includes(surface.layout.dataset.workbenchMode ?? '')
    );
  }

  private readonly onEscape = (event: KeyboardEvent): void => {
    if (!this.#open || event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    this.close(true);
  };

  private readonly onOutsidePointer = (event: Event): void => {
    const surface = this.#surface;
    if (!this.#open || surface === undefined) return;
    const path = event.composedPath();
    if (!path.includes(surface.overlay) && !path.includes(surface.trigger)) this.close(false);
  };

  private readonly onOutsideFocus = (event: Event): void => {
    const surface = this.#surface;
    if (!this.#open || surface === undefined) return;
    const path = event.composedPath();
    if (!path.includes(surface.popover) && !path.includes(surface.trigger)) this.close(false);
  };

  private readonly onScroll = (event: Event): void => {
    if (!this.#open || this.#surface === undefined) return;
    if (!event.composedPath().includes(this.#surface.navigation)) this.sync();
  };
}

function findSurface(
  layout: HTMLElement,
  navigation: HTMLElement,
): MaterialGroupPopoverSurface | undefined {
  const inline = layout.querySelector<HTMLElement>('[data-material-group-inline]');
  const content = layout.querySelector<HTMLElement>('[data-material-library-content]');
  const panel = layout.querySelector<HTMLElement>('[data-materials]');
  const trigger = layout.querySelector<HTMLButtonElement>('[data-material-group-toggle]');
  const overlay = layout.querySelector<HTMLElement>('[data-material-group-overlay]');
  const popover = layout.querySelector<HTMLElement>('[data-material-group-popover]');
  const mount = layout.querySelector<HTMLElement>('[data-material-group-popover-content]');
  if (
    inline === null ||
    content === null ||
    panel === null ||
    trigger === null ||
    overlay === null ||
    popover === null ||
    mount === null
  )
    return undefined;
  return { layout, navigation, inline, content, panel, trigger, overlay, popover, mount };
}

function positionPopover(surface: MaterialGroupPopoverSurface): boolean {
  const root = surface.layout.getBoundingClientRect();
  const anchor = surface.trigger.getBoundingClientRect();
  const window = surface.layout.ownerDocument.defaultView;
  if (window === null) return false;
  const leftEdge = Math.max(root.left + 8, 8);
  const rightEdge = Math.min(root.right - 8, window.innerWidth - 8);
  const topEdge = Math.max(root.top + 8, 8);
  const bottomEdge = Math.min(root.bottom - 8, window.innerHeight - 8);
  const width = Math.min(288, rightEdge - leftEdge);
  const below = bottomEdge - anchor.bottom - 4;
  const above = anchor.top - topEdge - 4;
  const placeAbove = below < 360 && above > below;
  const height = Math.min(360, placeAbove ? above : below);
  if (width <= 0 || height < 64) return false;
  const left = Math.max(leftEdge, Math.min(anchor.left, rightEdge - width));
  const top = placeAbove ? anchor.top - 4 - height : anchor.bottom + 4;
  const style = surface.popover.style;
  style.left = `${left - root.left - surface.layout.clientLeft}px`;
  style.top = `${top - root.top - surface.layout.clientTop}px`;
  style.width = `${width}px`;
  style.height = `${height}px`;
  return true;
}
