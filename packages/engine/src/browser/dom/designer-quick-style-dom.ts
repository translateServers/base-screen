import type { ScreenComponentNode } from '@base-screen/contracts';
import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import {
  DESIGNER_QUICK_STYLE_PALETTES,
  designerQuickStyleActionApplied,
  designerQuickStyleActionSupported,
} from '../../common/operations/designer-quick-style.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';

interface DesignerQuickConfigRow {
  readonly label: string;
  readonly kind: 'colors' | 'text' | 'info';
  readonly values: readonly { readonly value: string; readonly label: string }[];
}

export interface DesignerQuickStyleOptions {
  readonly components?: readonly ScreenComponentNode[];
  readonly includePresets?: boolean;
  readonly preferenceContext?: string;
  readonly title?: string;
  readonly variant?: 'single' | 'batch';
}

export function appendDesignerQuickStyle(
  properties: HTMLElement,
  manifest: BaseScreenMaterialManifest,
  options: DesignerQuickStyleOptions = {},
): void {
  if (!isChartLikeManifest(manifest)) return;
  const hasPreset = DESIGNER_QUICK_STYLE_PALETTES.some((_, value) =>
    designerQuickStyleActionSupported(manifest, { kind: 'preset', value }),
  );
  const hasColors = designerQuickStyleActionSupported(manifest, {
    kind: 'colors',
    value: '#38bdf8',
  });
  const hasText = designerQuickStyleActionSupported(manifest, { kind: 'text', value: 14 });
  const hasInfo = designerQuickStyleActionSupported(manifest, { kind: 'info', value: 'common' });
  const includesPreset = hasPreset && options.includePresets !== false;
  if (!includesPreset && !hasColors && !hasText && !hasInfo) return;

  const content = appendQuickStyleSection(properties, manifest.type, options);
  if (includesPreset) appendPresetGrid(content, manifest, options.components);
  for (const row of quickConfigRows(hasColors, hasText, hasInfo)) {
    appendQuickConfigRow(content, row, manifest, options.components);
  }
}

function appendQuickStyleSection(
  properties: HTMLElement,
  materialType: string,
  options: DesignerQuickStyleOptions,
): HTMLElement {
  const section = properties.ownerDocument.createElement('section');
  section.className = 'designer-inspector-section designer-datav-quick-style-section';
  section.dataset.inspectorSearchKey = 'quick-style';
  section.dataset.inspectorPreferenceContext = options.preferenceContext ?? materialType;
  section.dataset.quickStyleSection = 'true';
  section.dataset.quickStyleVariant = options.variant ?? 'single';
  const details = properties.ownerDocument.createElement('details');
  details.open = true;
  const summary = properties.ownerDocument.createElement('summary');
  summary.className =
    'designer-inspector-section-title designer-descriptor-group-summary designer-datav-section-summary';
  summary.textContent = options.title ?? DESIGNER_UI_TEXT.propertiesPanel.quickStyle;
  const disclosure = properties.ownerDocument.createElement('span');
  disclosure.className = 'designer-datav-section-disclosure';
  disclosure.innerHTML = designerIcon('chevron-down');
  summary.appendChild(disclosure);
  const content = properties.ownerDocument.createElement('div');
  content.className = 'designer-datav-section-content';
  details.append(summary, content);
  section.appendChild(details);
  properties.appendChild(section);
  return content;
}

function appendPresetGrid(
  parent: HTMLElement,
  manifest: BaseScreenMaterialManifest,
  components: readonly ScreenComponentNode[] | undefined,
): void {
  const grid = parent.ownerDocument.createElement('div');
  grid.className = 'designer-quick-style-grid';
  for (let index = 0; index < DESIGNER_QUICK_STYLE_PALETTES.length; index++) {
    const supported = designerQuickStyleActionSupported(manifest, {
      kind: 'preset',
      value: index,
    });
    const button = parent.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-quick-style';
    button.dataset.quickStyle = String(index);
    button.disabled = !supported;
    button.title = DESIGNER_UI_TEXT.propertiesPanel.quickStylePreset(index);
    button.setAttribute('aria-label', button.title);
    button.setAttribute(
      'aria-pressed',
      String(
        supported && quickStyleAppliedToAll(components, manifest, { kind: 'preset', value: index }),
      ),
    );
    const preview = parent.ownerDocument.createElement('span');
    preview.className = `designer-quick-style-preview quick-style-${index + 1}`;
    for (let bar = 0; bar < 5; bar++) {
      const line = parent.ownerDocument.createElement('i');
      line.style.setProperty('--quick-bar-index', String(bar));
      preview.appendChild(line);
    }
    button.appendChild(preview);
    grid.appendChild(button);
  }
  parent.appendChild(grid);
}

function quickConfigRows(
  hasColors: boolean,
  hasText: boolean,
  hasInfo: boolean,
): readonly DesignerQuickConfigRow[] {
  const rows: DesignerQuickConfigRow[] = [];
  if (hasColors) {
    rows.push({
      label: DESIGNER_UI_TEXT.propertiesPanel.chartColors,
      kind: 'colors',
      values: ['#38bdf8', '#4ade80', '#f97316', '#a78bfa', '#facc15', '#fb7185'].map((value) => ({
        value,
        label: '',
      })),
    });
  }
  if (hasText) {
    rows.push({
      label: DESIGNER_UI_TEXT.propertiesPanel.chartText,
      kind: 'text',
      values: ['12', '14', '16'].map((value) => ({ value, label: value })),
    });
  }
  if (hasInfo) {
    rows.push({
      label: DESIGNER_UI_TEXT.propertiesPanel.chartInfo,
      kind: 'info',
      values: [
        { value: 'simple', label: DESIGNER_UI_TEXT.propertiesPanel.chartInfoSimple },
        { value: 'common', label: DESIGNER_UI_TEXT.propertiesPanel.chartInfoCommon },
        { value: 'detailed', label: DESIGNER_UI_TEXT.propertiesPanel.chartInfoDetailed },
      ],
    });
  }
  return rows;
}

function appendQuickConfigRow(
  parent: HTMLElement,
  row: DesignerQuickConfigRow,
  manifest: BaseScreenMaterialManifest,
  components: readonly ScreenComponentNode[] | undefined,
): void {
  const container = parent.ownerDocument.createElement('div');
  container.className = 'designer-quick-config-row';
  const label = parent.ownerDocument.createElement('span');
  label.className = 'designer-quick-config-label';
  label.textContent = row.label;
  const controls = parent.ownerDocument.createElement('div');
  controls.className = `designer-quick-config-controls quick-config-${row.kind}`;
  for (const item of row.values) {
    const value =
      row.kind === 'text'
        ? ({ kind: 'text', value: Number(item.value) as 12 | 14 | 16 } as const)
        : row.kind === 'info'
          ? ({ kind: 'info', value: item.value as 'simple' | 'common' | 'detailed' } as const)
          : ({ kind: 'colors', value: item.value } as const);
    const button = parent.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button designer-quick-config-button';
    button.dataset.quickConfig = row.kind;
    button.dataset.quickConfigValue = item.value;
    button.disabled = !designerQuickStyleActionSupported(manifest, value);
    button.setAttribute(
      'aria-pressed',
      String(!button.disabled && quickStyleAppliedToAll(components, manifest, value)),
    );
    if (row.kind === 'colors') {
      const accessibleLabel = `${row.label} ${item.value.toUpperCase()}`;
      button.style.setProperty('--quick-color', item.value);
      button.title = accessibleLabel;
      button.setAttribute('aria-label', accessibleLabel);
    }
    button.textContent = row.kind === 'colors' ? '' : item.label;
    controls.appendChild(button);
  }
  container.append(label, controls);
  parent.appendChild(container);
}

function quickStyleAppliedToAll(
  components: readonly ScreenComponentNode[] | undefined,
  manifest: BaseScreenMaterialManifest,
  action: Parameters<typeof designerQuickStyleActionApplied>[2],
): boolean {
  return (
    components !== undefined &&
    components.length > 0 &&
    components.every((component) => designerQuickStyleActionApplied(component, manifest, action))
  );
}

function isChartLikeManifest(manifest: BaseScreenMaterialManifest): boolean {
  const type = manifest.type ?? '';
  return (
    manifest.category === DESIGNER_UI_TEXT.propertiesPanel.dataCategory ||
    type.includes('chart') ||
    type.includes('echarts') ||
    type.includes('table')
  );
}
