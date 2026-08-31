import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export interface DesignerPairEntryTarget<Axis extends string> {
  readonly id: string;
  readonly values: Readonly<Record<Axis, number>>;
}

export type DesignerPairEntryParseResult<Axis extends string, Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly invalidAxes: readonly Axis[] };

export interface DesignerPairEntryControllerCallbacks<Axis extends string, Value> {
  readonly getRoot: () => ShadowRoot | null;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly focusViewport: () => void;
  readonly getTarget: (
    document: ScreenDocument | undefined,
    interaction: ScreenInteractionState,
    catalog: BaseScreenMaterialCatalog | undefined,
  ) => DesignerPairEntryTarget<Axis> | undefined;
  readonly parse: (
    draft: Readonly<Record<Axis, string>>,
  ) => DesignerPairEntryParseResult<Axis, Value>;
  readonly createTransaction: (
    document: ScreenDocument,
    interaction: ScreenInteractionState,
    catalog: BaseScreenMaterialCatalog | undefined,
    value: Value,
  ) => ScreenDocumentTransaction | undefined;
  readonly axes: readonly [Axis, Axis];
  readonly entrySelector: string;
  readonly inputSelector: (axis: Axis) => string;
  readonly errorSelector: string;
  readonly axisDataKey: string;
  readonly placementDataKey: string;
  readonly invalidText: string;
  readonly submitFailedText: string;
}

export interface DesignerPairEntryPlacement {
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

export function placeDesignerPairEntry(
  viewport: RectLike,
  selection: RectLike,
  entry: Pick<RectLike, 'width' | 'height'>,
): DesignerPairEntryPlacement {
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

export class DesignerPairEntryController<Axis extends string, Value> {
  #form: HTMLElement | undefined;
  #target: DesignerPairEntryTarget<Axis> | undefined;
  readonly #stopPointerPropagation = (event: Event): void => event.stopPropagation();

  constructor(private readonly callbacks: DesignerPairEntryControllerCallbacks<Axis, Value>) {}

  connect(): void {
    const form = this.callbacks.getRoot()?.querySelector<HTMLElement>(this.callbacks.entrySelector);
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
    return this.target() !== undefined;
  }

  open(): boolean {
    this.connect();
    const target = this.target();
    if (target === undefined || this.#form === undefined) return false;
    this.#target = target;
    for (const axis of this.callbacks.axes) {
      this.input(axis).value = finiteDraft(target.values[axis]);
    }
    this.clearValidation();
    const parsed = this.callbacks.parse(this.readDraft());
    if (!parsed.ok) {
      for (const axis of parsed.invalidAxes) this.setAxisInvalid(axis, true);
      this.error.textContent = this.callbacks.invalidText;
    }
    this.#form.hidden = false;
    this.#form.style.visibility = 'hidden';
    this.position();
    this.#form.style.removeProperty('visibility');
    const first = this.input(this.callbacks.axes[0]);
    first.focus({ preventScroll: true });
    first.select();
    return true;
  }

  sync(): void {
    if (!this.isOpen || this.#target === undefined) return;
    const target = this.target();
    if (target === undefined || !sameTarget(target, this.#target, this.callbacks.axes)) {
      this.close(false);
      return;
    }
    this.position();
  }

  refreshGeometry(): void {
    if (!this.isOpen || this.#target === undefined) return;
    const target = this.target();
    if (target === undefined || target.id !== this.#target.id) {
      this.close(false);
      return;
    }
    for (const axis of this.callbacks.axes) {
      const input = this.input(axis);
      if (input.value === finiteDraft(this.#target.values[axis])) {
        input.value = finiteDraft(target.values[axis]);
      }
    }
    this.#target = target;
    this.position();
  }

  onClick(target: EventTarget | null): boolean {
    if (!this.isOpen || this.#form === undefined) return false;
    if (contains(this.#form, target)) return true;
    this.close(false);
    return false;
  }

  onInput(target: EventTarget | null): boolean {
    const axis = this.entryAxis(target);
    if (!this.isOpen || axis === undefined) return false;
    this.input(axis).removeAttribute('aria-invalid');
    if (!this.invalidAxes().length) this.error.textContent = '';
    return true;
  }

  onChange(target: EventTarget | null): boolean {
    const axis = this.entryAxis(target);
    if (!this.isOpen || axis === undefined) return false;
    const parsed = this.callbacks.parse(this.readDraft());
    this.setAxisInvalid(axis, !parsed.ok && parsed.invalidAxes.includes(axis));
    this.error.textContent = this.invalidAxes().length ? this.callbacks.invalidText : '';
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
    const parsed = this.callbacks.parse(this.readDraft());
    if (!parsed.ok) {
      for (const axis of this.callbacks.axes) {
        this.setAxisInvalid(axis, parsed.invalidAxes.includes(axis));
      }
      this.error.textContent = this.callbacks.invalidText;
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
    const transaction = this.callbacks.createTransaction(
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
    else this.error.textContent = this.callbacks.submitFailedText;
  }

  private target(): DesignerPairEntryTarget<Axis> | undefined {
    return this.callbacks.getTarget(
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
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
    const placement = placeDesignerPairEntry(
      viewport.getBoundingClientRect(),
      selection.getBoundingClientRect(),
      this.#form!.getBoundingClientRect(),
    );
    this.#form!.style.left = `${placement.left}px`;
    this.#form!.style.top = `${placement.top}px`;
    this.#form!.dataset[this.callbacks.placementDataKey] = placement.placement;
  }

  private readDraft(): Record<Axis, string> {
    const draft = {} as Record<Axis, string>;
    for (const axis of this.callbacks.axes) draft[axis] = this.input(axis).value;
    return draft;
  }

  private input(axis: Axis): HTMLInputElement {
    return this.#form!.querySelector<HTMLInputElement>(this.callbacks.inputSelector(axis))!;
  }

  private get error(): HTMLElement {
    return this.#form!.querySelector<HTMLElement>(this.callbacks.errorSelector)!;
  }

  private clearValidation(): void {
    for (const axis of this.callbacks.axes) this.setAxisInvalid(axis, false);
    if (this.#form !== undefined) this.error.textContent = '';
  }

  private invalidAxes(): Axis[] {
    return this.callbacks.axes.filter(
      (axis) => this.input(axis).getAttribute('aria-invalid') === 'true',
    );
  }

  private setAxisInvalid(axis: Axis, invalid: boolean): void {
    const input = this.input(axis);
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  private entryAxis(target: EventTarget | null): Axis | undefined {
    const axis = (target as { readonly dataset?: DOMStringMap } | null)?.dataset?.[
      this.callbacks.axisDataKey
    ];
    return this.callbacks.axes.find((candidate) => candidate === axis);
  }
}

function sameTarget<Axis extends string>(
  left: DesignerPairEntryTarget<Axis>,
  right: DesignerPairEntryTarget<Axis>,
  axes: readonly Axis[],
): boolean {
  return (
    left.id === right.id && axes.every((axis) => Object.is(left.values[axis], right.values[axis]))
  );
}

function contains(container: HTMLElement, target: EventTarget | null): boolean {
  return target !== null && container.contains(target as Node);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteDraft(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}
