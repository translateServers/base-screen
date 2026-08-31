import type { BaseScreenMaterialLibraryGrouping } from '../../../common/operations/material-library/material-library-grouping.js';
import { renderMaterialLibraryGroupNavigation } from '../../dom/material-library/designer-material-library-group-dom.js';
import type { DesignerMaterialGroupView } from '../../dom/material-library/designer-material-library-group-view.js';
import { DesignerMaterialGroupPopoverController } from './designer-material-group-popover-controller.js';

type SelectGroup = (groupId: string | undefined, layout: HTMLElement) => void;

/** UI-only directory navigation; the material controller owns the selected filter. */
export class DesignerMaterialGroupNavigationController {
  #layout: HTMLElement | undefined;
  #grouping: BaseScreenMaterialLibraryGrouping | undefined;
  #view: DesignerMaterialGroupView | undefined;
  readonly #popover = new DesignerMaterialGroupPopoverController();

  constructor(private readonly selectGroup: SelectGroup) {}

  refresh(
    layout: HTMLElement,
    grouping: BaseScreenMaterialLibraryGrouping | undefined,
    selectedGroupId: string | undefined,
  ): void {
    const focused = (this.#view?.navigation.getRootNode() as Document | ShadowRoot | undefined)
      ?.activeElement;
    const ownedFocus =
      focused != null &&
      (this.#view?.navigation.contains(focused) ||
        focused === layout.querySelector('[data-material-group-toggle]'));
    if (layout !== this.#layout || grouping !== this.#grouping) {
      this.#popover.close(layout === this.#layout && grouping !== undefined);
      this.#popover.dispose();
    }
    this.#layout = layout;
    this.#grouping = grouping;
    this.#view = renderMaterialLibraryGroupNavigation(layout, grouping, selectedGroupId);
    if (this.#view !== undefined) this.#popover.bind(layout, this.#view.navigation);
    else if (ownedFocus)
      layout
        .querySelector<HTMLInputElement>('[data-material-search]')
        ?.focus({ preventScroll: true });
  }

  dispose(): void {
    this.#popover.dispose();
    this.#layout = undefined;
    this.#grouping = undefined;
    this.#view = undefined;
  }

  onClick(target: Element): boolean {
    if (this.#view === undefined || this.#layout === undefined) return false;
    const control = target.closest<HTMLElement>('[data-material-group-action]');
    const layout = this.#layout;
    if (control === null || layout === undefined || !layout.contains(control)) return false;
    const action = control.dataset.materialGroupAction;
    if (action === 'toggle') {
      this.#popover.toggle();
      return true;
    }
    if (action === 'close') {
      this.#popover.close(true);
      return true;
    }
    if (!['all', 'current', 'select', 'back'].includes(action ?? '')) return false;

    const branchId = this.#view?.navigation.dataset.materialGroupBranch;
    const groupId =
      action === 'all'
        ? undefined
        : action === 'back'
          ? control.dataset.materialGroupBreadcrumb
          : action === 'current'
            ? control.dataset.materialGroupCurrent || undefined
            : control.dataset.materialGroup;
    setGroupTabStop(control);
    this.selectGroup(groupId, layout);
    if (action === 'back') {
      const previousBranch = [
        ...(this.#view?.children.querySelectorAll<HTMLButtonElement>('[data-material-group]') ??
          []),
      ].find((button) => button.dataset.materialGroup === branchId);
      this.focus(previousBranch ?? this.currentButton());
    } else if (!control.isConnected) {
      this.focus(this.currentButton());
    }
    if (action !== 'back' && control.dataset.materialGroupHasChildren !== 'true') {
      this.#popover.close(true);
    }
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (
      this.#view === undefined ||
      this.#layout === undefined ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !(event.target instanceof HTMLElement)
    )
      return false;
    const control = event.target.closest<HTMLButtonElement>('button[data-material-group-action]');
    if (control === null || !this.#layout?.contains(control)) return false;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      return this.onClick(control);
    }
    const list = control.closest<HTMLElement>('[data-material-group-list]');
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (list === null && control !== this.#view.back) return false;
      event.preventDefault();
      this.navigateHierarchy(control, event.key);
      return true;
    }
    if (list === null) return false;
    const buttons = [...list.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(control);
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, buttons.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : undefined;
    if (nextIndex === undefined) return false;
    event.preventDefault();
    this.focus(buttons[nextIndex]);
    return true;
  }

  private navigateHierarchy(control: HTMLButtonElement, key: string): void {
    const view = this.#view;
    if (view === undefined) return;
    if (key === 'ArrowRight') {
      if (
        control === view.back ||
        (view.roots.contains(control) && control.ariaPressed === 'true')
      ) {
        this.focus(
          view.children.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
            this.currentButton(),
        );
      } else if (control.dataset.materialGroupHasChildren === 'true') {
        this.onClick(control);
        this.focus(this.currentButton());
      }
      return;
    }
    if (!view.children.contains(control) && control !== view.back) return;
    if (!view.back.hidden) this.onClick(view.back);
    else
      this.focus(view.roots.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? undefined);
  }

  private currentButton(): HTMLButtonElement | undefined {
    return (
      this.#view?.children.querySelector<HTMLButtonElement>('[data-material-group-current]') ??
      undefined
    );
  }

  private focus(button: HTMLButtonElement | undefined): void {
    if (button === undefined) return;
    setGroupTabStop(button);
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function setGroupTabStop(control: HTMLElement): void {
  const list = control.closest<HTMLElement>('[data-material-group-list]');
  for (const button of list?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
    button.tabIndex = button === control ? 0 : -1;
  }
}
