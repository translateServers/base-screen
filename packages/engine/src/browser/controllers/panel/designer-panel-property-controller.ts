import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import { createDesignerImageDensityTransaction } from '../../../common/operations/element/designer-image-density.js';
import {
  createDesignerQuickStyleTransaction,
  type DesignerQuickStyleAction,
} from '../../../common/operations/style/designer-quick-style.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  createDescriptorArrayTransaction,
  createDescriptorFieldTransaction,
} from '../../dom/descriptor/designer-descriptor-operations.js';
import {
  createDesignerCanvasPresentationSettings,
  createMultiSelectionTransaction,
  createPropertyTransaction,
  type DesignerCanvasPresentationSettings,
  renderDesignerProperties,
} from '../../dom/panel/designer-panel-dom.js';
import type { DesignerPanelControllerCallbacks } from './designer-panel-controller-callbacks.js';

export class DesignerPanelPropertyController {
  readonly #canvasPresentation: DesignerCanvasPresentationSettings =
    createDesignerCanvasPresentationSettings();

  constructor(private readonly callbacks: DesignerPanelControllerCallbacks) {}

  render(properties: HTMLElement | undefined): void {
    if (properties === undefined) return;
    renderDesignerProperties(
      properties,
      this.callbacks.getGeometryDocument?.() ?? this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
      this.callbacks.getDatasetFields,
      this.callbacks.isCanvasBackgroundImageButtonVisible?.() ?? false,
      this.#canvasPresentation,
      this.callbacks.getInspectorControls?.(),
    );
  }

  onClick(target: Element): boolean {
    const backgroundImageAction = target.closest<HTMLButtonElement>(
      '[data-canvas-background-image-action]',
    );
    if (backgroundImageAction !== null) {
      this.callbacks.requestCanvasBackgroundImage?.();
      return true;
    }
    const scaleButton = target.closest<HTMLButtonElement>('[data-canvas-setting="scaleMode"]');
    if (scaleButton !== null) {
      this.updateScaleMode(scaleButton);
      return true;
    }
    const geometryAction = target.closest<HTMLButtonElement>('[data-geometry-action]');
    if (geometryAction !== null) {
      this.commitPropertyControl(geometryAction);
      return true;
    }
    const imageDensityAction = target.closest<HTMLButtonElement>('[data-image-density-action]');
    if (imageDensityAction !== null) {
      this.applyImageDensity(imageDensityAction);
      return true;
    }
    const quickStyle = target.closest<HTMLButtonElement>('[data-quick-style]');
    if (quickStyle !== null) {
      const value = Number(quickStyle.dataset.quickStyle);
      if (Number.isInteger(value)) this.applyQuickStyle(quickStyle, { kind: 'preset', value });
      return true;
    }
    const quickConfig = target.closest<HTMLButtonElement>('[data-quick-config]');
    if (quickConfig !== null) {
      const action = quickStyleActionFromButton(quickConfig);
      if (action !== undefined) this.applyQuickStyle(quickConfig, action);
      return true;
    }
    const arrayButton = target.closest<HTMLButtonElement>('[data-descriptor-array-action]');
    if (arrayButton !== null && arrayButton.dataset.descriptorArrayAction !== undefined) {
      const transaction = createDescriptorArrayTransaction(
        arrayButton,
        this.callbacks.getDocument(),
        this.callbacks.getInteraction(),
        this.callbacks.getCatalog(),
      );
      this.executeOptionalTransaction(transaction);
      return true;
    }
    return false;
  }

  onPropertyChange(event: Event): void {
    const target = event.target;
    const canvasSetting = (target as { readonly dataset?: DOMStringMap } | null)?.dataset
      ?.canvasSetting;
    if (canvasSetting !== undefined) {
      this.updateCanvasPresentationSetting(target, canvasSetting);
      return;
    }
    const multiProperty = (target as { readonly dataset?: DOMStringMap } | null)?.dataset
      ?.multiProperty;
    if (multiProperty !== undefined && target !== null) {
      const transaction = createMultiSelectionTransaction(
        target,
        this.callbacks.getGeometryDocument?.() ?? this.callbacks.getDocument(),
        this.callbacks.getInteraction(),
        this.callbacks.getCatalog(),
      );
      if (transaction !== undefined) {
        this.executeDraftTransaction(target, transaction);
        return;
      }
    }
    const arrayTransaction = createDescriptorArrayTransaction(
      target,
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (arrayTransaction !== undefined) {
      this.executeOptionalTransaction(arrayTransaction);
      return;
    }
    const descriptorTransaction = createDescriptorFieldTransaction(
      target,
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (descriptorTransaction !== undefined) {
      this.executeDraftTransaction(target, descriptorTransaction);
      return;
    }
    if (this.commitPropertyControl(target)) return;
    if (isDesignerDraft(target)) {
      setDraftValidity(target, false);
      this.callbacks.emitDiagnostics([invalidDraftDiagnostic()]);
    }
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (
      event.key !== 'Enter' ||
      event.isComposing ||
      isTextArea(event.target) ||
      !isDesignerDraft(event.target)
    ) {
      return false;
    }
    event.preventDefault();
    this.onPropertyChange(event);
    return true;
  }

  private updateScaleMode(button: HTMLButtonElement): void {
    const value = button.dataset.canvasSettingValue;
    if (
      value !== 'fill' &&
      value !== 'fit' &&
      value !== 'width' &&
      value !== 'height' &&
      value !== 'original' &&
      value !== 'none'
    ) {
      return;
    }
    this.#canvasPresentation.scaleMode = value;
    this.callbacks.onCanvasPresentationChange?.(this.#canvasPresentation);
    for (const control of button.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[data-canvas-setting="scaleMode"]',
    ) ?? []) {
      control.ariaPressed = String(control === button);
    }
  }

  private updateCanvasPresentationSetting(target: EventTarget | null, setting: string): void {
    if (!(target instanceof HTMLInputElement)) return;
    if (setting === 'opacity') {
      // 面板读数是 0–100 的百分比（与组件不透明度同一档），呈现层仍持有 0–1 的比值。
      const percent = Number(target.value);
      if (!Number.isFinite(percent)) return;
      const opacity = Math.round(Math.min(100, Math.max(0, percent))) / 100;
      this.#canvasPresentation.opacity = opacity;
      this.callbacks.onCanvasPresentationChange?.(this.#canvasPresentation);
      const root = target.getRootNode() as ShadowRoot | Document;
      for (const control of root.querySelectorAll<HTMLInputElement>(
        '[data-canvas-setting="opacity"]',
      )) {
        control.value = String(Math.round(opacity * 100));
      }
      return;
    }
    if (setting === 'backgroundAutoFill') {
      this.#canvasPresentation.backgroundAutoFill = target.checked;
    } else if (setting === 'disableComponentLoading') {
      this.#canvasPresentation.disableComponentLoading = target.checked;
    }
    this.callbacks.onCanvasPresentationChange?.(this.#canvasPresentation);
  }

  private applyQuickStyle(button: HTMLButtonElement, action: DesignerQuickStyleAction): void {
    const transaction = createDesignerQuickStyleTransaction(
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
      action,
    );
    if (transaction === undefined) return;
    if (!transaction.ok) {
      this.callbacks.emitDiagnostics(transaction.diagnostics);
      return;
    }
    const result = this.callbacks.executeTransaction(transaction.value);
    if (result.ok) {
      for (const control of button.parentElement?.querySelectorAll<HTMLButtonElement>(
        `[data-quick-${button.dataset.quickStyle !== undefined ? 'style' : 'config'}]`,
      ) ?? []) {
        control.ariaPressed = String(control === button);
      }
    }
    this.report(result);
  }

  private applyImageDensity(button: HTMLButtonElement): void {
    const componentId = button.dataset.imageDensityComponentId ?? '';
    const density = Number(button.dataset.imageDensityAction);
    const transaction = createDesignerImageDensityTransaction(
      this.callbacks.getDocument(),
      componentId,
      this.callbacks.getImageNaturalSize?.(componentId),
      density,
    );
    if (!transaction.ok) {
      this.callbacks.emitDiagnostics(transaction.diagnostics);
      return;
    }
    if (transaction.value !== undefined) {
      this.report(this.callbacks.executeTransaction(transaction.value));
    }
  }

  private commitPropertyControl(target: EventTarget | null): boolean {
    const transaction = createPropertyTransaction(
      target,
      this.callbacks.getGeometryDocument?.() ?? this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (transaction === undefined) return false;
    if (!transaction.ok) {
      setDraftValidity(target, false);
      this.callbacks.emitDiagnostics(transaction.diagnostics);
      return true;
    }
    const result = this.callbacks.executeTransaction(transaction.value);
    setDraftValidity(target, result.ok);
    this.report(result);
    return true;
  }

  private executeOptionalTransaction(
    transaction: ScreenParseResult<ScreenDocumentTransaction> | undefined,
  ): void {
    if (transaction === undefined) return;
    if (transaction.ok) this.report(this.callbacks.executeTransaction(transaction.value));
    else this.callbacks.emitDiagnostics(transaction.diagnostics);
  }

  private executeDraftTransaction(
    target: EventTarget | null,
    transaction: ScreenParseResult<ScreenDocumentTransaction>,
  ): void {
    if (transaction.ok) {
      setDraftValidity(target, true);
      this.report(this.callbacks.executeTransaction(transaction.value));
    } else {
      setDraftValidity(target, false);
      this.callbacks.emitDiagnostics(transaction.diagnostics);
    }
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }
}

function quickStyleActionFromButton(
  button: HTMLButtonElement,
): DesignerQuickStyleAction | undefined {
  const kind = button.dataset.quickConfig;
  const value = button.dataset.quickConfigValue;
  if (kind === 'colors' && value !== undefined) return { kind, value };
  if (kind === 'text' && (value === '12' || value === '14' || value === '16')) {
    return { kind, value: Number(value) as 12 | 14 | 16 };
  }
  if (kind === 'info' && (value === 'simple' || value === 'common' || value === 'detailed')) {
    return { kind, value };
  }
  return undefined;
}

function isDesignerDraft(target: EventTarget | null): boolean {
  const dataset = (target as { readonly dataset?: DOMStringMap } | null)?.dataset;
  return (
    dataset !== undefined &&
    (dataset.property !== undefined ||
      dataset.prop !== undefined ||
      dataset.style !== undefined ||
      dataset.canvasProperty !== undefined ||
      dataset.canvasSetting !== undefined ||
      dataset.multiProperty !== undefined)
  );
}

function isTextArea(target: EventTarget | null): boolean {
  return (target as { readonly tagName?: string } | null)?.tagName === 'TEXTAREA';
}

function invalidDraftDiagnostic(): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'CORE_COMMAND_INVALID',
    path: [],
    message: DESIGNER_UI_TEXT.panel.fieldValueInvalid,
  };
}

function setDraftValidity(target: EventTarget | null, valid: boolean): void {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLSelectElement) &&
    !(target instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  target.ariaInvalid = String(!valid);
  const message = target.parentElement?.querySelector<HTMLElement>('[data-field-message]');
  if (message !== null && message !== undefined) {
    message.textContent = valid ? '' : DESIGNER_UI_TEXT.panel.enterValidValue;
  }
}
