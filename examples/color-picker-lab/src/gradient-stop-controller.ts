import { ColorControlState, type ColorMode, type RadialShape } from './color-control-state.js';
import { clamp, rgbaToHex } from './color-model.js';

interface GradientStopCallbacks {
  readonly update: () => void;
  readonly emitInput: () => void;
  readonly emitChange: () => void;
  readonly emitBoth: () => void;
  readonly clearValidation: () => void;
  readonly showValidation: (input: HTMLInputElement, message: string) => void;
  readonly getRoot: () => ShadowRoot;
  readonly getRail: () => HTMLElement;
}

const COLOR_MODES: readonly ColorMode[] = ['solid', 'linear-gradient', 'radial-gradient'];

export class GradientStopController {
  private draggingStopId: string | undefined;
  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.draggingStopId === undefined) return;
    this.state.moveStop(this.draggingStopId, this.positionFromPointer(event));
    this.callbacks.update();
    this.callbacks.emitInput();
  };
  private readonly handlePointerUp = (): void => {
    if (this.draggingStopId === undefined) return;
    this.draggingStopId = undefined;
    this.callbacks.update();
    this.callbacks.emitChange();
  };

  constructor(
    private readonly state: ColorControlState,
    private readonly callbacks: GradientStopCallbacks,
  ) {}

  connect(): void {
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  disconnect(): void {
    this.draggingStopId = undefined;
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  onPointerDown(event: PointerEvent): boolean {
    if (event.button !== 0) return false;
    const stop =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-stop-id]')
        : null;
    if (stop?.dataset.stopId === undefined) return false;
    event.preventDefault();
    this.state.selectedStopId = stop.dataset.stopId;
    this.draggingStopId = stop.dataset.stopId;
    this.callbacks.update();
    stop.focus();
    return true;
  }

  onClick(event: Event): boolean {
    const target = event.target instanceof Element ? event.target : undefined;
    const button = target?.closest<HTMLButtonElement>('button');
    if (this.isColorMode(button?.dataset.mode)) {
      if (this.state.mode !== button.dataset.mode) {
        const previousMode = this.state.mode;
        this.state.mode = button.dataset.mode;
        if (previousMode === 'solid' && this.state.mode !== 'solid') {
          this.state.selectFirstStop();
        }
        this.commit();
      }
      return true;
    }
    if (this.isRadialShape(button?.dataset.radialShape)) {
      if (this.state.radialShape !== button.dataset.radialShape) {
        this.state.radialShape = button.dataset.radialShape;
        this.commit();
      }
      return true;
    }
    if (button?.dataset.action === 'add-stop') {
      this.state.addStop(this.nextStopPosition());
      this.commit();
      return true;
    }
    if (button?.dataset.action === 'remove-stop') {
      if (this.state.removeSelectedStop()) this.commit();
      return true;
    }
    if (button?.dataset.stopId !== undefined) {
      this.state.selectedStopId = button.dataset.stopId;
      this.callbacks.update();
      return true;
    }
    const rail = target?.closest<HTMLElement>('[data-gradient-rail]');
    if (rail === null || rail === undefined) return false;
    this.state.addStop(this.positionFromPointer(event as MouseEvent));
    this.commit();
    return true;
  }

  onChange(event: Event): boolean {
    const input = event.target instanceof HTMLInputElement ? event.target : undefined;
    if (input?.matches('[data-stop-position]')) {
      const position = this.validNumber(input, 0, 100, '色标位置需在 0–100 之间。');
      if (position !== undefined) {
        this.state.moveStop(this.state.selectedStopId, position);
        this.commit();
      }
      return true;
    }
    if (input?.matches('[data-linear-angle]')) {
      const angle = this.validNumber(input, 0, 360, '渐变角度需在 0–360 之间。');
      if (angle !== undefined) {
        this.state.linearAngle = angle;
        this.commit();
      }
      return true;
    }
    if (input?.dataset.radialCenter !== undefined) {
      const center = this.validNumber(input, 0, 100, '渐变中心需在 0–100 之间。');
      if (center !== undefined) {
        if (input.dataset.radialCenter === 'x') this.state.radialCenterX = center;
        if (input.dataset.radialCenter === 'y') this.state.radialCenterY = center;
        this.commit();
      }
      return true;
    }
    return false;
  }

  onKeydown(event: KeyboardEvent, target: HTMLElement | undefined): boolean {
    const id = target?.dataset.stopId;
    if (id === undefined) return false;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.state.selectedStopId = id;
      if (this.state.removeSelectedStop()) this.commit();
      return true;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return false;
    event.preventDefault();
    const stop = this.state.gradientStops.find((item) => item.id === id);
    if (stop === undefined) return true;
    const delta = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowRight' ? 1 : -1);
    this.state.moveStop(id, stop.position + delta);
    this.state.selectedStopId = id;
    this.commit();
    return true;
  }

  render(): void {
    const root = this.callbacks.getRoot();
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === this.state.mode));
    }
    const editor = this.element<HTMLElement>(root, '[data-gradient-editor]');
    editor.hidden = this.state.mode === 'solid';
    if (editor.hidden) return;

    this.element<HTMLElement>(root, '[data-linear-settings]').hidden =
      this.state.mode !== 'linear-gradient';
    this.element<HTMLElement>(root, '[data-radial-settings]').hidden =
      this.state.mode !== 'radial-gradient';
    this.renderStops(root);
    this.element<HTMLInputElement>(root, '[data-linear-angle]').value = String(
      Math.round(this.state.linearAngle),
    );
    this.element<HTMLInputElement>(root, '[data-radial-center="x"]').value = String(
      Math.round(this.state.radialCenterX),
    );
    this.element<HTMLInputElement>(root, '[data-radial-center="y"]').value = String(
      Math.round(this.state.radialCenterY),
    );
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-radial-shape]')) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.radialShape === this.state.radialShape),
      );
    }
  }

  private renderStops(root: ShadowRoot): void {
    const rail = this.callbacks.getRail();
    const ordered = [...this.state.gradientStops].sort(
      (left, right) => left.position - right.position,
    );
    const stopsCss = ordered
      .map((stop) => `${rgbaToHex(stop.color)} ${Math.round(stop.position)}%`)
      .join(', ');
    rail.style.setProperty('--gradient-value', `linear-gradient(to right, ${stopsCss})`);

    const expectedIds = new Set(ordered.map((stop) => stop.id));
    for (const button of rail.querySelectorAll<HTMLButtonElement>('[data-stop-id]')) {
      if (!expectedIds.has(button.dataset.stopId ?? '')) button.remove();
    }
    for (const [index, stop] of ordered.entries()) {
      let button = rail.querySelector<HTMLButtonElement>(`[data-stop-id="${stop.id}"]`);
      if (button === null) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'gradient-stop';
        button.dataset.stopId = stop.id;
        rail.append(button);
      }
      const position = Math.round(stop.position);
      button.style.left = `${stop.position}%`;
      button.style.setProperty('--stop-color', rgbaToHex(stop.color));
      button.setAttribute('aria-pressed', String(stop.id === this.state.selectedStopId));
      button.setAttribute('aria-label', `色标 ${index + 1}，位置 ${position}%，可用左右方向键调整`);
    }

    const selected = ordered.find((stop) => stop.id === this.state.selectedStopId) ?? ordered[0];
    this.element<HTMLInputElement>(root, '[data-stop-position]').value = String(
      Math.round(selected?.position ?? 0),
    );
    this.element<HTMLButtonElement>(root, '[data-action="remove-stop"]').disabled =
      ordered.length <= 2;
  }

  private validNumber(
    input: HTMLInputElement,
    minimum: number,
    maximum: number,
    message: string,
  ): number | undefined {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      this.callbacks.showValidation(input, message);
      return undefined;
    }
    return value;
  }

  private nextStopPosition(): number {
    const ordered = [...this.state.gradientStops].sort(
      (left, right) => left.position - right.position,
    );
    let position = 50;
    let largestGap = -1;
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      if (left === undefined || right === undefined) continue;
      const gap = right.position - left.position;
      if (gap > largestGap) {
        largestGap = gap;
        position = left.position + gap / 2;
      }
    }
    return clamp(position, 0, 100);
  }

  private commit(): void {
    this.callbacks.clearValidation();
    this.callbacks.update();
    this.callbacks.emitBoth();
  }

  private positionFromPointer(event: MouseEvent | PointerEvent): number {
    const bounds = this.callbacks.getRail().getBoundingClientRect();
    if (bounds.width === 0) return 0;
    return clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
  }

  private isColorMode(value: string | undefined): value is ColorMode {
    return value !== undefined && COLOR_MODES.includes(value as ColorMode);
  }

  private isRadialShape(value: string | undefined): value is RadialShape {
    return value === 'circle' || value === 'ellipse';
  }

  private element<T extends Element>(root: ShadowRoot, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (element === null) throw new Error(`Gradient control element not found: ${selector}`);
    return element;
  }
}
