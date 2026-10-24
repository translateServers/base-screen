import {
  applyDesignerInspectorFilters,
  type DesignerInspectorDensity,
  renderDesignerInspectorContext,
} from '../../dom/designer-inspector-chrome-dom.js';
import {
  applyDesignerInspectorSearchStyle,
  captureDesignerInspectorSearchStyle,
  closeDesignerInspectorSearchMenus,
  type DesignerInspectorSearchClipboard,
  designerInspectorSectionDisclosure,
} from '../../dom/designer-inspector-search-dom.js';
import {
  DesignerInspectorScrollGuard,
  isInspectorFormControlTarget,
} from '../designer-inspector-scroll-guard.js';
import type { DesignerPanelControllerCallbacks } from './designer-panel-controller-callbacks.js';

const INSPECTOR_DENSITY_STORAGE_KEY = 'base-screen.designer.inspector-density';
const INSPECTOR_GROUPS_STORAGE_KEY = 'base-screen.designer.inspector-groups';
const MAX_INSPECTOR_GROUP_PREFERENCES = 200;
const INSPECTOR_SCROLL_CONTAINER_SELECTOR =
  '.inspector-pane, .designer-inspector-data-flow-content';

/** Owns Inspector chrome, search preferences, and scroll continuity. */
export class DesignerPanelInspectorController {
  #density: DesignerInspectorDensity = 'basic';
  #search = '';
  #searchOpen = false;
  #searchClipboard: DesignerInspectorSearchClipboard | undefined;
  #densityPreferenceRestored = false;
  #groupPreferenceRestored = false;
  readonly #groupPreferences = new Map<string, boolean>();
  readonly #scrollGuard = new DesignerInspectorScrollGuard();

  constructor(private readonly callbacks: DesignerPanelControllerCallbacks) {}

  dispose(): void {
    this.#scrollGuard.dispose();
  }

  prepareRender(properties: HTMLElement | undefined, dataPanel?: HTMLElement): void {
    const propertiesPane = properties?.parentElement;
    if (propertiesPane !== null && propertiesPane !== undefined) {
      this.#scrollGuard.ensureListeners(propertiesPane);
    }
    const dataFlowContent = dataPanel?.querySelector<HTMLElement>(
      '.designer-inspector-data-flow-content',
    );
    if (dataFlowContent !== null && dataFlowContent !== undefined) {
      this.#scrollGuard.ensureListeners(dataFlowContent);
    }
  }

  onPointerDown(event: PointerEvent): void {
    if (!isPrimaryPointer(event)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !isInspectorFormControlTarget(target)) return;
    const pane = findInspectorScrollContainer(target);
    if (pane === undefined) return;
    this.#scrollGuard.begin(pane, findInspectorFormControl(target));
  }

  preservePropertyScroll(target: EventTarget | null): void {
    if (!isInspectorFormControlTarget(target)) return;
    const pane = findInspectorScrollContainer(target as HTMLElement);
    if (pane !== undefined) this.#scrollGuard.preserve(pane);
  }

  captureGroupPreferences(root: ShadowRoot | HTMLElement | null): void {
    if (root === null) return;
    let persistenceTarget: HTMLElement | undefined;
    for (const section of root.querySelectorAll<HTMLElement>(
      '[data-inspector-search-kind="section"][data-inspector-search-key]',
    )) {
      const pane = section.closest<HTMLElement>('[data-inspector-pane]');
      const preferenceKey = this.groupPreferenceKey(section, pane);
      const details = designerInspectorSectionDisclosure(section);
      if (preferenceKey === undefined || details === null) continue;
      const searchState = details.dataset.inspectorSearchWasOpen;
      const open = searchState === undefined ? details.open : searchState === 'true';
      this.#groupPreferences.set(preferenceKey, open);
      persistenceTarget ??= section;
    }
    if (persistenceTarget !== undefined) this.persistGroupPreferences(persistenceTarget);
  }

  refresh(root: ShadowRoot | HTMLElement | null): void {
    if (root === null) return;
    this.restoreDensityPreference(root);
    renderDesignerInspectorContext(
      root.querySelector<HTMLElement>('[data-inspector-context]'),
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    const inspector = root.querySelector<HTMLElement>('[data-right-panel]');
    if (inspector?.dataset.inspectorContextKind === 'canvas') {
      this.#search = '';
      this.#searchOpen = false;
      const input = root.querySelector<HTMLInputElement>('[data-inspector-search]');
      if (input !== null) input.value = '';
    }
    inspector?.toggleAttribute('data-inspector-search-open', this.#searchOpen);
    const searchWorkspace = root.querySelector<HTMLElement>('[data-inspector-search-workspace]');
    if (searchWorkspace !== null) searchWorkspace.hidden = !this.#searchOpen;
    this.applyGroupPreferences(root);
    applyDesignerInspectorFilters(root, { density: this.#density, query: this.#search });
  }

  onClick(target: Element): boolean {
    const searchLaunch = target.closest<HTMLButtonElement>('[data-inspector-search-launch]');
    if (searchLaunch !== null) {
      const root = searchLaunch.getRootNode() as ShadowRoot;
      this.#searchOpen = true;
      this.refresh(root);
      root.querySelector<HTMLInputElement>('[data-inspector-search]')?.focus();
      return true;
    }
    const searchClose = target.closest<HTMLButtonElement>('[data-inspector-search-close]');
    if (searchClose !== null) {
      const root = searchClose.getRootNode() as ShadowRoot;
      const input = root.querySelector<HTMLInputElement>('[data-inspector-search]');
      if (input !== null) input.value = '';
      this.#search = '';
      this.#searchOpen = false;
      this.refresh(root);
      root.querySelector<HTMLButtonElement>('[data-inspector-search-launch]')?.focus();
      return true;
    }
    const copyTarget = target.closest<HTMLButtonElement>('[data-inspector-search-copy-target]');
    const copyKey = copyTarget?.dataset.inspectorSearchCopyTarget;
    if (copyTarget !== null && copyTarget !== undefined && copyKey !== undefined) {
      const root = copyTarget.getRootNode() as ShadowRoot;
      this.#searchClipboard = captureDesignerInspectorSearchStyle(root, copyKey);
      closeDesignerInspectorSearchMenus(root);
      return true;
    }
    const pasteTarget = target.closest<HTMLButtonElement>('[data-inspector-search-paste-target]');
    const pasteKey = pasteTarget?.dataset.inspectorSearchPasteTarget;
    if (
      pasteTarget !== null &&
      pasteTarget !== undefined &&
      pasteKey !== undefined &&
      this.#searchClipboard !== undefined
    ) {
      const root = pasteTarget.getRootNode() as ShadowRoot;
      applyDesignerInspectorSearchStyle(root, pasteKey, this.#searchClipboard);
      closeDesignerInspectorSearchMenus(root);
      return true;
    }
    const density = target.closest<HTMLButtonElement>('button[data-inspector-density]')?.dataset
      .inspectorDensity;
    if (density === 'basic' || density === 'all') {
      this.#density = density;
      this.persistDensityPreference(target, density);
      this.refresh(target.getRootNode() as ShadowRoot);
      return true;
    }
    this.captureGroupSummaryPreference(target);
    const searchResult = target.closest<HTMLButtonElement>('[data-inspector-search-target]');
    const searchTab = searchResult?.dataset.inspectorSearchTab;
    if (
      searchResult === null ||
      searchResult === undefined ||
      (searchTab !== 'appearance' && searchTab !== 'data' && searchTab !== 'interaction')
    ) {
      return false;
    }
    this.callbacks.selectInspectorTab?.(searchTab);
    const root = searchResult.getRootNode() as ShadowRoot;
    const key = searchResult.dataset.inspectorSearchTarget;
    const field = [...root.querySelectorAll<HTMLElement>('[data-inspector-search-key]')].find(
      (item) => item.dataset.inspectorSearchKey === key,
    );
    const inspectorSearch = root.querySelector<HTMLInputElement>('[data-inspector-search]');
    if (inspectorSearch !== null) inspectorSearch.value = '';
    this.#search = '';
    this.#searchOpen = false;
    this.refresh(root);
    field?.scrollIntoView({ block: 'center' });
    field?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    field?.classList.add('inspector-search-highlight');
    setTimeout(() => field?.classList.remove('inspector-search-highlight'), 900);
    return true;
  }

  onInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement) || target.dataset.inspectorSearch === undefined) {
      return false;
    }
    this.#searchOpen = true;
    this.#search = target.value.trim().toLocaleLowerCase();
    this.refresh(target.getRootNode() as ShadowRoot);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape' || event.isComposing) return false;
    const search = event.target;
    if (!(search instanceof HTMLInputElement) || search.dataset.inspectorSearch === undefined) {
      return false;
    }
    event.preventDefault();
    if (this.#search !== '' || search.value !== '') {
      search.value = '';
      this.#search = '';
      this.refresh(search.getRootNode() as ShadowRoot);
      search.focus();
      return true;
    }
    const root = search.getRootNode() as ShadowRoot;
    this.#searchOpen = false;
    this.refresh(root);
    root.querySelector<HTMLButtonElement>('[data-inspector-search-launch]')?.focus();
    return true;
  }

  private captureGroupSummaryPreference(target: Element): void {
    const groupSummary = target.closest<HTMLElement>('summary');
    if (groupSummary === null) return;
    const details = groupSummary.closest<HTMLDetailsElement>('details');
    const section = groupSummary.closest<HTMLElement>('[data-inspector-search-key]');
    const pane = groupSummary.closest<HTMLElement>('[data-inspector-pane]');
    const preferenceKey = this.groupPreferenceKey(section, pane);
    if (details === null || preferenceKey === undefined) return;
    this.#groupPreferences.set(preferenceKey, !details.open);
    this.persistGroupPreferences(groupSummary);
  }

  private restoreDensityPreference(root: ShadowRoot | HTMLElement): void {
    if (this.#densityPreferenceRestored) return;
    this.#densityPreferenceRestored = true;
    try {
      const stored = root.ownerDocument.defaultView?.localStorage.getItem(
        INSPECTOR_DENSITY_STORAGE_KEY,
      );
      if (stored === 'basic' || stored === 'all') this.#density = stored;
    } catch {
      // Sandboxed hosts may deny storage; basic mode is the safe default.
    }
  }

  private persistDensityPreference(target: Element, density: DesignerInspectorDensity): void {
    try {
      target.ownerDocument.defaultView?.localStorage.setItem(
        INSPECTOR_DENSITY_STORAGE_KEY,
        density,
      );
    } catch {
      // Preference persistence is optional.
    }
  }

  private applyGroupPreferences(root: ShadowRoot | HTMLElement): void {
    this.restoreGroupPreferences(root);
    for (const section of root.querySelectorAll<HTMLElement>('[data-inspector-search-key]')) {
      const pane = section.closest<HTMLElement>('[data-inspector-pane]');
      const preferenceKey = this.groupPreferenceKey(section, pane);
      const open =
        preferenceKey === undefined ? undefined : this.#groupPreferences.get(preferenceKey);
      const details = designerInspectorSectionDisclosure(section);
      if (details !== null && open !== undefined) details.open = open;
    }
  }

  private restoreGroupPreferences(root: ShadowRoot | HTMLElement): void {
    if (this.#groupPreferenceRestored) return;
    this.#groupPreferenceRestored = true;
    try {
      const stored = root.ownerDocument.defaultView?.localStorage.getItem(
        INSPECTOR_GROUPS_STORAGE_KEY,
      );
      if (stored === null || stored === undefined) return;
      const entries = Object.entries(JSON.parse(stored) as Record<string, unknown>).slice(
        -MAX_INSPECTOR_GROUP_PREFERENCES,
      );
      for (const [key, value] of entries) {
        if (typeof value === 'boolean') this.#groupPreferences.set(key, value);
      }
    } catch {
      // Sandboxed hosts or malformed preferences fall back to descriptor defaults.
    }
  }

  private persistGroupPreferences(target: Element): void {
    try {
      const entries = [...this.#groupPreferences.entries()].slice(-MAX_INSPECTOR_GROUP_PREFERENCES);
      target.ownerDocument.defaultView?.localStorage.setItem(
        INSPECTOR_GROUPS_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(entries)),
      );
    } catch {
      // Preference persistence is optional.
    }
  }

  private groupPreferenceKey(
    section: HTMLElement | null,
    pane: HTMLElement | null,
  ): string | undefined {
    const sectionKey = section?.dataset.inspectorSearchKey;
    const tab = pane?.dataset.inspectorPane;
    if (sectionKey === undefined || tab === undefined) return undefined;
    const document = this.callbacks.getDocument();
    const interaction = this.callbacks.getInteraction();
    const focusedId = interaction.focusedComponentId;
    const context =
      section?.dataset.inspectorPreferenceContext ??
      (focusedId === null
        ? interaction.selectedComponentIds.length > 1
          ? 'multi'
          : 'canvas'
        : (document?.components.find((component) => component.id === focusedId)?.type ?? 'canvas'));
    return `${context}|${tab}|${sectionKey}`;
  }
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}

function findInspectorScrollContainer(control: HTMLElement): HTMLElement | undefined {
  return control.closest<HTMLElement>(INSPECTOR_SCROLL_CONTAINER_SELECTOR) ?? undefined;
}

function findInspectorFormControl(target: HTMLElement): HTMLElement | undefined {
  const direct = target.closest<HTMLElement>('input, select, textarea');
  if (direct !== null) return direct;
  return target.closest<HTMLLabelElement>('label')?.control ?? undefined;
}
