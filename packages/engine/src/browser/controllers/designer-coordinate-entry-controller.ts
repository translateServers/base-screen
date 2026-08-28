import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createDesignerCoordinateEntryTransaction,
  type DesignerCoordinateAxis,
  getDesignerCoordinateEntryTarget,
  parseDesignerCoordinateEntry,
} from '../../common/operations/designer-coordinate-entry.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export interface DesignerCoordinateEntryControllerCallbacks {
  readonly getRoot: () => ShadowRoot | null;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly focusViewport: () => void;
}

export interface DesignerCoordinateEntryPlacement {
  readonly left: number;
  readonly top: number;
  readonly placement: 'above-left' | 'below-left' | 'left-top' | 'right-top' | 'clamped';
}

interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

const ENTRY_INSET = 8;
const ENTRY_GAP = 8;

export function placeDesignerCoordinateEntry(
  viewport: RectLike,
  selection: RectLike,
  entry: Pick<RectLike, 'width' | 'height'>,
): DesignerCoordinateEntryPlacement {
  const maxLeft = Math.max(ENTRY_INSET, viewport.width - entry.width - ENTRY_INSET);
  const maxTop = Math.max(ENTRY_INSET, viewport.height - entry.height - ENTRY_INSET);
  const alignedLeft = clamp(selection.left - viewport.left, ENTRY_INSET, maxLeft);
  const alignedTop = clamp(selection.top - viewport.top, ENTRY_INSET, maxTop);
  const above = selection.top - viewport.top - entry.height - ENTRY_GAP;
  if (above >= ENTRY_INSET) {
    return { left: alignedLeft, top: above, placement: 'above-left' };
  }
  const below = selection.bottom - viewport.top + ENTRY_GAP;
  if (below + entry.height <= viewport.height - ENTRY_INSET) {
    return { left: alignedLeft, top: below, placement: 'below-left' };
  }
  const left = selection.left - viewport.left - entry.width - ENTRY_GAP;
  if (left >= ENTRY_INSET) {
    return { left, top: alignedTop, placement: 'left-top' };
  }
  const right = selection.right - viewport.left + ENTRY_GAP;
  if (right + entry.width <= viewport.width - ENTRY_INSET) {
    return { left: right, top: alignedTop, placement: 'right-top' };
  }
  return {
    left: alignedLeft,
    top: above < ENTRY_INSET ? ENTRY_INSET : maxTop,
    placement: 'clamped',
  };
}

export class DesignerCoordinateEntryController {
  #form: HTMLElement | undefined;
  #target:
    | {
        readonly id: string;
        readonly position: { readonly x: number; readonly y: number };
      }
    | undefined;
  readonly #stopPointerPropagation = (event: Event): void => event.stopPropagation();

  constructor(private readonly callbacks: DesignerCoordinateEntryControllerCallbacks) {}

  connect(): void {
    const form = this.callbacks.getRoot()?.querySelector<HTMLElement>('[data-coordinate-entry]');
    if (form === null || form === undefined || form === this.#form) return;
    this.disconnect();
    this.#form = form;
    form.addEventListener('pointerdown', this.#stopPointerPropagation);
    form.addEventListener('wheel', this.#stopPointerPropagation, { passive: true });
  }

  disconnect(): void {
    this.close(false);
    this.#form?.removeEventListener('pointerdown', this.#stopPointerPropagation);
    this.#form?.removeEventListener('wheel', this.#stopPointerPropagation);
    this.#form = undefined;
  }

  get isOpen(): boolean {
    return this.#form !== undefined && !this.#form.hidden;
  }

  canOpen(): boolean {
    return (
      getDesignerCoordinateEntryTarget(
        this.callbacks.getDocument(),
        this.callbacks.getInteraction(),
        this.callbacks.getCatalog(),
      ) !== undefined
    );
  }

  open(): boolean {
    this.connect();
    const document = this.callbacks.getDocument();
    const target = getDesignerCoordinateEntryTarget(
      document,
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (target === undefined || this.#form === undefined) return false;
    this.#target = { id: target.id, position: target.position };
    this.input('x').value = finiteCoordinateDraft(target.position.x);
    this.input('y').value = finiteCoordinateDraft(target.position.y);
    this.clearValidation();
    const parsed = parseDesignerCoordinateEntry({
      x: this.input('x').value,
      y: this.input('y').value,
    });
    if (!parsed.ok) {
      for (const axis of parsed.invalidAxes) this.setAxisInvalid(axis, true);
      this.error.textContent = DESIGNER_UI_TEXT.coordinateEntry.invalid;
    }
    this.#form.hidden = false;
    this.#form.style.visibility = 'hidden';
    this.position();
    this.#form.style.removeProperty('visibility');
    const x = this.input('x');
    x.focus({ preventScroll: true });
    x.select();
    return true;
  }

  sync(): void {
    if (!this.isOpen || this.#target === undefined) return;
    const target = getDesignerCoordinateEntryTarget(
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (
      target === undefined ||
      target.id !== this.#target.id ||
      !Object.is(target.position.x, this.#target.position.x) ||
      !Object.is(target.position.y, this.#target.position.y)
    ) {
      this.close(false);
      return;
    }
    this.position();
  }

  onClick(target: EventTarget | null): boolean {
    if (!this.isOpen || this.#form === undefined) return false;
    if (contains(this.#form, target)) return true;
    this.close(false);
    return false;
  }

  onInput(target: EventTarget | null): boolean {
    const axis = coordinateAxis(target);
    if (!this.isOpen || axis === undefined) return false;
    this.input(axis).removeAttribute('aria-invalid');
    if (!this.invalidAxes().length) this.error.textContent = '';
    return true;
  }

  onChange(target: EventTarget | null): boolean {
    const axis = coordinateAxis(target);
    if (!this.isOpen || axis === undefined) return false;
    const parsed = parseDesignerCoordinateEntry({
      x: axis === 'x' ? this.input('x').value : '0',
      y: axis === 'y' ? this.input('y').value : '0',
    });
    this.setAxisInvalid(axis, !parsed.ok);
    this.error.textContent = this.invalidAxes().length
      ? DESIGNER_UI_TEXT.coordinateEntry.invalid
      : '';
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (!this.isOpen || event.isComposing) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
      return true;
    }
    if (event.key !== 'Enter' || !contains(this.#form!, event.target)) return false;
    event.preventDefault();
    this.submit();
    return true;
  }

  onFocusOut(event: FocusEvent): boolean {
    if (!this.isOpen || this.#form === undefined || !contains(this.#form, event.target)) {
      return false;
    }
    if (contains(this.#form, event.relatedTarget)) return false;
    queueMicrotask(() => {
      const active = this.callbacks.getRoot()?.activeElement ?? null;
      if (this.isOpen && !contains(this.#form!, active)) this.close(false);
    });
    return false;
  }

  close(restoreFocus = true): void {
    this.#target = undefined;
    if (this.#form !== undefined) {
      this.#form.hidden = true;
      this.#form.style.removeProperty('visibility');
      this.clearValidation();
    }
    if (restoreFocus) this.callbacks.focusViewport();
  }

  private submit(): void {
    const parsed = parseDesignerCoordinateEntry({
      x: this.input('x').value,
      y: this.input('y').value,
    });
    if (!parsed.ok) {
      for (const axis of ['x', 'y'] as const) {
        this.setAxisInvalid(axis, parsed.invalidAxes.includes(axis));
      }
      this.error.textContent = DESIGNER_UI_TEXT.coordinateEntry.invalid;
      const first = this.input(parsed.invalidAxes[0]!);
      first.focus({ preventScroll: true });
      first.select();
      return;
    }
    const document = this.callbacks.getDocument();
    if (document === undefined || this.#target === undefined) {
      this.close(true);
      return;
    }
    const transaction = createDesignerCoordinateEntryTransaction(
      document,
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
      parsed.value,
    );
    if (transaction === undefined) {
      this.close(true);
      return;
    }
    const result = this.callbacks.executeTransaction(transaction);
    this.callbacks.report(result);
    if (result.ok) this.close(true);
    else this.error.textContent = DESIGNER_UI_TEXT.coordinateEntry.submitFailed;
  }

  private position(): void {
    const root = this.callbacks.getRoot();
    const viewport = root?.querySelector<HTMLElement>('[data-viewport]');
    const selection = root?.querySelector<HTMLElement>('[data-selection]');
    if (
      viewport === null ||
      viewport === undefined ||
      selection === null ||
      selection === undefined
    ) {
      return;
    }
    const placement = placeDesignerCoordinateEntry(
      viewport.getBoundingClientRect(),
      selection.getBoundingClientRect(),
      this.#form!.getBoundingClientRect(),
    );
    this.#form!.style.left = `${placement.left}px`;
    this.#form!.style.top = `${placement.top}px`;
    this.#form!.dataset.coordinateEntryPlacement = placement.placement;
  }

  private input(axis: DesignerCoordinateAxis): HTMLInputElement {
    return this.#form!.querySelector<HTMLInputElement>(`[data-coordinate-entry-${axis}]`)!;
  }

  private get error(): HTMLElement {
    return this.#form!.querySelector<HTMLElement>('[data-coordinate-entry-error]')!;
  }

  private clearValidation(): void {
    for (const axis of ['x', 'y'] as const) this.setAxisInvalid(axis, false);
    if (this.#form !== undefined) this.error.textContent = '';
  }

  private invalidAxes(): DesignerCoordinateAxis[] {
    return (['x', 'y'] as const).filter(
      (axis) => this.input(axis).getAttribute('aria-invalid') === 'true',
    );
  }

  private setAxisInvalid(axis: DesignerCoordinateAxis, invalid: boolean): void {
    const input = this.input(axis);
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function coordinateAxis(target: EventTarget | null): DesignerCoordinateAxis | undefined {
  const axis = (target as { readonly dataset?: DOMStringMap } | null)?.dataset?.coordinateEntryAxis;
  return axis === 'x' || axis === 'y' ? axis : undefined;
}

function contains(container: HTMLElement, target: EventTarget | null): boolean {
  return target !== null && container.contains(target as Node);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteCoordinateDraft(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}
