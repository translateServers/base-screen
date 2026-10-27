import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenPluginCatalog, PluginCommandPort } from '@base-screen/plugin-core';
import type { BaseScreenDesignerWorkbenchMode } from '../../common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_OPERATION_TEXT } from '../../common/operations/designer-operation-registry.js';
import { listDesignerPluginCommandPaletteItems } from '../../common/operations/plugin/designer-plugin-commands.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export type DesignerCommandPaletteKind = 'material' | 'layer' | 'command' | 'blueprint';

export interface DesignerCommandPaletteEntry {
  readonly kind: DesignerCommandPaletteKind;
  readonly label: string;
  readonly detail: string;
  readonly searchText: string;
  readonly disabled?: boolean;
  readonly materialType?: string;
  readonly materialItemId?: string;
  readonly componentId?: string;
  readonly operationId?: keyof typeof DESIGNER_OPERATION_TEXT;
  readonly pluginCommandId?: string;
  readonly blueprintTargetId?: string;
}

export interface DesignerCommandPaletteQuery {
  readonly kind?: DesignerCommandPaletteKind;
  readonly term: string;
}

export interface DesignerCommandPaletteControllerCallbacks {
  readonly getRoot: () => ShadowRoot | null;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getWorkbenchMode: () => BaseScreenDesignerWorkbenchMode;
  readonly getPluginCatalog?: () => BaseScreenPluginCatalog | undefined;
  readonly getPluginCommandPort?: () => PluginCommandPort | undefined;
  readonly executePluginCommand?: (commandId: string) => void;
  readonly renderKindIcon: (kind: DesignerCommandPaletteKind) => string;
}

const MAX_RESULTS = 18;
const OPERATION_IDS = Object.keys(
  DESIGNER_OPERATION_TEXT,
) as readonly (keyof typeof DESIGNER_OPERATION_TEXT)[];

export function parseDesignerCommandPaletteQuery(value: string): DesignerCommandPaletteQuery {
  const trimmed = value.trimStart();
  const kind = trimmed.startsWith('+')
    ? 'material'
    : trimmed.startsWith('/')
      ? 'layer'
      : trimmed.startsWith('>')
        ? 'command'
        : undefined;
  return {
    ...(kind === undefined ? {} : { kind }),
    term: (kind === undefined ? trimmed : trimmed.slice(1)).trim().toLocaleLowerCase(),
  };
}

export function filterDesignerCommandPaletteEntries(
  entries: readonly DesignerCommandPaletteEntry[],
  value: string,
  limit = MAX_RESULTS,
): readonly DesignerCommandPaletteEntry[] {
  const query = parseDesignerCommandPaletteQuery(value);
  const candidates = entries.filter(
    (entry) => query.kind === undefined || entry.kind === query.kind,
  );
  if (query.term.length === 0) {
    const defaults =
      query.kind === undefined
        ? candidates.filter((entry) => entry.kind === 'command')
        : candidates;
    return defaults.slice(0, limit);
  }
  return candidates
    .map((entry, index) => ({ entry, index, score: searchScore(entry, query.term) }))
    .filter((candidate) => candidate.score < 3)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, limit)
    .map((candidate) => candidate.entry);
}

export class DesignerCommandPaletteController {
  constructor(private readonly callbacks: DesignerCommandPaletteControllerCallbacks) {}

  onClick(target: Element): boolean {
    if (target.closest('[data-command-palette-toggle]') !== null) {
      this.toggle();
      return true;
    }
    const result = target.closest<HTMLButtonElement>('[data-command-palette-result]');
    if (result !== null) {
      const commandId = result.dataset.pluginCommand;
      this.close(false);
      if (commandId !== undefined && result.disabled === false) {
        this.callbacks.executePluginCommand?.(commandId);
        return true;
      }
      return false;
    }
    const overlay = target.closest<HTMLElement>('[data-command-palette]');
    if (overlay !== null && target === overlay) {
      this.close();
      return true;
    }
    return false;
  }

  onInput(target: Element): boolean {
    const input = target.closest<HTMLInputElement>('[data-command-palette-search]');
    if (input === null) return false;
    this.render(input.value);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const palette = this.palette;
    if (palette === undefined || palette.hidden) {
      const isPaletteShortcut =
        (event.key === 'k' || event.key === 'K') &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey;
      if (!isPaletteShortcut || isEditable(event.target)) {
        return false;
      }
      event.preventDefault();
      this.open();
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (event.key === 'Enter') {
      const active = palette.querySelector<HTMLButtonElement>(
        '[data-command-palette-result][data-active="true"]',
      );
      if (active === null || active.disabled) return false;
      event.preventDefault();
      active.click();
      return true;
    }
    if (event.key === 'Tab') {
      return this.moveFocus(event);
    }
    return false;
  }

  close(restoreFocus = true): void {
    const root = this.callbacks.getRoot();
    const palette = root?.querySelector<HTMLElement>('[data-command-palette]');
    if (palette === null || palette === undefined || palette.hidden) return;
    palette.hidden = true;
    const trigger = root?.querySelector<HTMLButtonElement>('[data-command-palette-toggle]');
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus();
  }

  private get palette(): HTMLElement | undefined {
    return (
      this.callbacks.getRoot()?.querySelector<HTMLElement>('[data-command-palette]') ?? undefined
    );
  }

  private toggle(): void {
    const palette = this.palette;
    if (palette === undefined) return;
    if (palette.hidden) this.open();
    else this.close();
  }

  private open(): void {
    const root = this.callbacks.getRoot();
    const palette = root?.querySelector<HTMLElement>('[data-command-palette]');
    const input = palette?.querySelector<HTMLInputElement>('[data-command-palette-search]');
    if (palette === null || palette === undefined || input === null || input === undefined) return;
    palette.hidden = false;
    root
      ?.querySelector<HTMLButtonElement>('[data-command-palette-toggle]')
      ?.setAttribute('aria-expanded', 'true');
    input.value = '';
    this.render('');
    queueMicrotask(() => input.focus());
  }

  private render(value: string): void {
    const palette = this.palette;
    const results = palette?.querySelector<HTMLElement>('[data-command-palette-results]');
    const empty = palette?.querySelector<HTMLElement>('[data-command-palette-empty]');
    const input = palette?.querySelector<HTMLInputElement>('[data-command-palette-search]');
    if (results === null || results === undefined || empty === null || empty === undefined) return;
    const allEntries = this.entries();
    const entries =
      value.trim().length === 0 && this.callbacks.getWorkbenchMode() === 'blueprint'
        ? allEntries.filter((entry) => entry.kind === 'blueprint').slice(0, MAX_RESULTS)
        : filterDesignerCommandPaletteEntries(allEntries, value);
    results.replaceChildren(...entries.map((entry, index) => this.result(entry, index)));
    empty.hidden = entries.length !== 0;
    const first = results.querySelector<HTMLButtonElement>(
      '[data-command-palette-result]:not(:disabled)',
    );
    if (first !== null) {
      first.dataset.active = 'true';
      first.setAttribute('aria-selected', 'true');
    }
    if (input !== null && input !== undefined) {
      input.setAttribute('aria-activedescendant', first?.id ?? '');
    }
  }

  private entries(): readonly DesignerCommandPaletteEntry[] {
    const root = this.callbacks.getRoot();
    if (root === null) return [];
    const materials = [...root.querySelectorAll<HTMLElement>('[data-material-card]')].flatMap(
      (card): DesignerCommandPaletteEntry[] => {
        const control = card.querySelector<HTMLButtonElement>('[data-material-type]');
        const materialType = card.dataset.materialType ?? control?.dataset.materialType;
        if (control === null || materialType === undefined) return [];
        const label =
          card.querySelector<HTMLElement>('.material-name')?.textContent?.trim() || materialType;
        const materialItemId = control.dataset.materialItemId ?? card.dataset.materialItemId;
        return [
          {
            kind: 'material',
            label,
            detail: materialType,
            searchText: `${label} ${materialType}`.toLocaleLowerCase(),
            disabled: control.disabled,
            materialType,
            ...(materialItemId === undefined ? {} : { materialItemId }),
          },
        ];
      },
    );
    const layers = (this.callbacks.getDocument()?.components ?? []).map(
      (component): DesignerCommandPaletteEntry => ({
        kind: 'layer',
        label: component.name,
        detail: component.type,
        searchText: `${component.name} ${component.type} ${component.id}`.toLocaleLowerCase(),
        componentId: component.id,
      }),
    );
    const commands = OPERATION_IDS.map((operationId): DesignerCommandPaletteEntry => {
      const operation = DESIGNER_OPERATION_TEXT[operationId];
      const controls = [
        ...root.querySelectorAll<HTMLButtonElement>(
          `[data-action="${operationId}"], [data-menu-action="${operationId}"]`,
        ),
      ];
      const enabled = controls.length === 0 || controls.some((control) => !control.disabled);
      return {
        kind: 'command',
        label: operation.label,
        detail: 'shortcut' in operation ? operation.shortcut : operation.tooltip,
        searchText:
          `${operation.label} ${operation.tooltip} ${operationId} ${'shortcut' in operation ? operation.shortcut : ''}`.toLocaleLowerCase(),
        disabled: !enabled,
        operationId,
      };
    });
    const pluginCommands = listDesignerPluginCommandPaletteItems(
      this.callbacks.getPluginCatalog?.(),
      this.callbacks.getPluginCommandPort?.() !== undefined,
    ).map(
      (command): DesignerCommandPaletteEntry => ({
        kind: 'command',
        label: command.name,
        detail: command.shortcut ?? command.id,
        searchText: `${command.name} ${command.id} ${command.shortcut ?? ''}`.toLocaleLowerCase(),
        disabled: command.disabled,
        pluginCommandId: command.id,
      }),
    );
    const blueprint = this.blueprintEntries();
    return this.callbacks.getWorkbenchMode() === 'blueprint'
      ? [...blueprint, ...commands, ...pluginCommands]
      : [...materials, ...layers, ...commands, ...pluginCommands];
  }

  private blueprintEntries(): readonly DesignerCommandPaletteEntry[] {
    const document = this.callbacks.getDocument();
    if (document === undefined) return [];
    const components = document.components.map(
      (component): DesignerCommandPaletteEntry => ({
        kind: 'blueprint',
        label: component.name,
        detail: component.type,
        searchText: `${component.name} ${component.type} ${component.id}`.toLocaleLowerCase(),
        blueprintTargetId: `component:${component.id}`,
      }),
    );
    const relations = document.blueprint.relations.map(
      (relation, index): DesignerCommandPaletteEntry => {
        const source =
          relation.type === 'semantic'
            ? relation.source.componentId
            : relation.source.kind === 'component'
              ? relation.source.componentId
              : relation.source.variableId;
        const target =
          relation.type === 'semantic'
            ? relation.target.componentId
            : relation.target.kind === 'component'
              ? relation.target.componentId
              : relation.target.kind === 'variable'
                ? relation.target.variableId
                : 'host';
        const label = DESIGNER_UI_TEXT.blueprint.relationSummary(index + 1);
        return {
          kind: 'blueprint',
          label,
          detail: `${source} → ${target}`,
          searchText:
            `${label} ${source} ${target} ${relation.type === 'behavior' ? relation.effect.type : relation.role}`.toLocaleLowerCase(),
          blueprintTargetId:
            relation.type === 'semantic' ? `semantic:${relation.id}` : `relation:${relation.id}`,
        };
      },
    );
    return [...components, ...relations];
  }

  private result(entry: DesignerCommandPaletteEntry, index: number): HTMLButtonElement {
    const button = this.callbacks.getRoot()!.ownerDocument.createElement('button');
    button.type = 'button';
    button.id = `designer-command-palette-result-${index}`;
    button.className = 'designer-command-palette-result';
    button.dataset.commandPaletteResult = entry.kind;
    button.disabled = entry.disabled === true;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    const glyph = this.callbacks.getRoot()!.ownerDocument.createElement('span');
    glyph.className = 'designer-command-palette-glyph';
    glyph.innerHTML = this.callbacks.renderKindIcon(entry.kind);
    const text = this.callbacks.getRoot()!.ownerDocument.createElement('span');
    text.className = 'designer-command-palette-copy';
    const label = this.callbacks.getRoot()!.ownerDocument.createElement('strong');
    label.textContent = entry.label;
    const detail = this.callbacks.getRoot()!.ownerDocument.createElement('small');
    detail.textContent = entry.detail;
    text.append(label, detail);
    const kind = this.callbacks.getRoot()!.ownerDocument.createElement('span');
    kind.className = 'designer-command-palette-kind';
    kind.textContent = DESIGNER_UI_TEXT.commandPalette.kinds[entry.kind];
    button.append(glyph, text, kind);
    if (entry.materialType !== undefined) button.dataset.materialType = entry.materialType;
    if (entry.materialItemId !== undefined) button.dataset.materialItemId = entry.materialItemId;
    if (entry.componentId !== undefined) button.dataset.layerSelect = entry.componentId;
    if (entry.operationId !== undefined) button.dataset.action = entry.operationId;
    if (entry.pluginCommandId !== undefined) button.dataset.pluginCommand = entry.pluginCommandId;
    if (entry.blueprintTargetId !== undefined) {
      button.dataset.blueprintSearchId = entry.blueprintTargetId;
    }
    return button;
  }

  private moveActive(delta: number): void {
    const palette = this.palette;
    const input = palette?.querySelector<HTMLInputElement>('[data-command-palette-search]');
    const controls = [
      ...(palette?.querySelectorAll<HTMLButtonElement>(
        '[data-command-palette-result]:not(:disabled)',
      ) ?? []),
    ];
    if (controls.length === 0) return;
    const current = controls.findIndex((control) => control.dataset.active === 'true');
    const next = controls[(current + delta + controls.length) % controls.length]!;
    for (const control of controls) {
      control.removeAttribute('data-active');
      control.setAttribute('aria-selected', 'false');
    }
    next.dataset.active = 'true';
    next.setAttribute('aria-selected', 'true');
    next.scrollIntoView({ block: 'nearest' });
    input?.setAttribute('aria-activedescendant', next.id);
  }

  private moveFocus(event: KeyboardEvent): boolean {
    const palette = this.palette;
    const input = palette?.querySelector<HTMLInputElement>('[data-command-palette-search]');
    const results = [
      ...(palette?.querySelectorAll<HTMLButtonElement>(
        '[data-command-palette-result]:not(:disabled)',
      ) ?? []),
    ];
    if (input === null || input === undefined) return false;
    const focusable: HTMLElement[] = [input, ...results];
    const current = focusable.findIndex((control) => control === event.target);
    if (current < 0) return false;
    event.preventDefault();
    focusable[(current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
    return true;
  }
}

function searchScore(entry: DesignerCommandPaletteEntry, term: string): number {
  const label = entry.label.toLocaleLowerCase();
  if (label === term || label.startsWith(term)) return 0;
  if (entry.searchText.split(/\s+/u).some((token) => token.startsWith(term))) return 1;
  return entry.searchText.includes(term) ? 2 : 3;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
