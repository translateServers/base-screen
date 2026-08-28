import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenBlueprintVisibilityEffect } from '@base-screen/core';

type MountedVisibilityElement = {
  readonly element: HTMLElement;
};

export class BlueprintVisibilityController {
  #componentIndex = new Map<string, ScreenComponentNode>();
  #overrides = new Map<string, boolean>();
  #animations = new Map<string, Animation>();

  constructor(private readonly root: HTMLElement) {}

  prepare(document: ScreenDocument): void {
    this.#componentIndex = new Map(
      document.components.map((component) => [component.id, component]),
    );
  }

  isHidden(componentId: string): boolean {
    let current = this.#componentIndex.get(componentId);
    const visited = new Set<string>();
    while (current !== undefined && !visited.has(current.id)) {
      visited.add(current.id);
      const visible = this.#overrides.get(current.id);
      if (visible === false || (visible === undefined && current.status.hidden)) return true;
      current = current.parentId === null ? undefined : this.#componentIndex.get(current.parentId);
    }
    return false;
  }

  apply(
    effects: readonly ScreenBlueprintVisibilityEffect[],
    document: ScreenDocument | undefined,
    mounted: ReadonlyMap<string, MountedVisibilityElement>,
  ): ScreenParseResult<null> {
    if (document === undefined || effects.length === 0) {
      return { ok: true, value: null, diagnostics: [] };
    }
    this.prepare(document);
    for (const effect of effects) {
      const target = this.#componentIndex.get(effect.componentId);
      if (target === undefined) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'DOCUMENT_FIELD_INVALID',
              path: ['blueprint', 'componentId'],
              message: 'Blueprint visibility target is missing.',
            },
          ],
        };
      }
      const before = new Map<string, boolean>();
      for (const componentId of mounted.keys()) before.set(componentId, this.isHidden(componentId));
      const ownVisible = this.#overrides.get(effect.componentId) ?? !target.status.hidden;
      const nextVisible =
        effect.operation === 'show' ? true : effect.operation === 'hide' ? false : !ownVisible;
      this.#overrides.set(effect.componentId, nextVisible);
      for (const [componentId, material] of mounted) {
        const hidden = this.isHidden(componentId);
        if ((before.get(componentId) ?? false) !== hidden) {
          this.animate(componentId, material.element, !hidden, effect.transition);
        }
      }
    }
    return { ok: true, value: null, diagnostics: [] };
  }

  reset(): void {
    for (const animation of this.#animations.values()) animation.cancel();
    this.#animations.clear();
    this.#overrides.clear();
  }

  private animate(
    componentId: string,
    element: HTMLElement,
    visible: boolean,
    transition: ScreenBlueprintVisibilityEffect['transition'],
  ): void {
    const previous = this.#animations.get(componentId);
    const view = this.root.ownerDocument?.defaultView;
    const computed = view?.getComputedStyle(element);
    const currentOpacity = computed?.opacity ?? (visible ? '0' : '1');
    const currentTranslate = computed?.translate ?? 'none';
    previous?.cancel();
    this.#animations.delete(componentId);
    const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (
      transition === undefined ||
      transition.effect === 'appear' ||
      transition.durationMs === 0 ||
      reducedMotion ||
      typeof element.animate !== 'function'
    ) {
      element.style.display = visible ? 'block' : 'none';
      return;
    }
    if (visible) element.style.display = 'block';
    const targetOpacity = element.style.opacity.length > 0 ? element.style.opacity : '1';
    const slide = transition.effect === 'slide-up';
    const keyframes: Keyframe[] = visible
      ? [
          { opacity: currentOpacity, ...(slide ? { translate: currentTranslate } : {}) },
          { opacity: targetOpacity, ...(slide ? { translate: '0 0' } : {}) },
        ]
      : [
          { opacity: currentOpacity, ...(slide ? { translate: currentTranslate } : {}) },
          { opacity: '0', ...(slide ? { translate: '0 12px' } : {}) },
        ];
    const animation = element.animate(keyframes, {
      duration: transition.durationMs,
      easing: visibilityEasing(transition.easing),
      fill: 'none',
    });
    this.#animations.set(componentId, animation);
    void animation.finished
      .then(() => {
        if (this.#animations.get(componentId) !== animation) return;
        this.#animations.delete(componentId);
        element.style.display = visible ? 'block' : 'none';
      })
      .catch(() => undefined);
  }
}

function visibilityEasing(
  easing: NonNullable<ScreenBlueprintVisibilityEffect['transition']>['easing'],
): string {
  if (easing === 'ease-in-out-quad') return 'cubic-bezier(0.455, 0.03, 0.515, 0.955)';
  if (easing === 'ease-in-out-expo') return 'cubic-bezier(1, 0, 0, 1)';
  return 'linear';
}
