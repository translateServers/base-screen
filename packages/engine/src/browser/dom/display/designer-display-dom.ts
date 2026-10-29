import type { ScreenTargetDisplayProfile } from '@base-screen/contracts';
import type {
  DesignerDisplayMetrics,
  DesignerDisplayOverlayKind,
} from '../../../common/operations/display/designer-target-display.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { adoptDesignerFormControls } from '../designer-form-controls-dom.js';
import { escapeHtml } from '../designer-html-escape.js';

const text = DESIGNER_UI_TEXT.targetDisplay;

/**
 * 目标屏面板：只读参数 + 三个独立叠加开关 + 按参数算出的验收读数。
 *
 * 参数由宿主提供，面板不写入文档；没有参数时说明「当前环境未提供」，
 * 而不是显示一组编造的默认值。
 */
export function displayPanelMarkup(
  profile: ScreenTargetDisplayProfile | undefined,
  metrics: DesignerDisplayMetrics | undefined,
  toggles: ReadonlySet<DesignerDisplayOverlayKind>,
): string {
  if (profile === undefined) {
    return `<p class="display-panel-empty">${text.unavailable}</p>`;
  }
  const rows: string[] = [];
  const row = (label: string, value: string): void => {
    rows.push(
      `<div class="display-kv"><span class="display-kv-label">${escapeHtml(label)}</span><span class="display-kv-value">${escapeHtml(value)}</span></div>`,
    );
  };
  row(text.resolution, `${Math.round(profile.columns)} × ${Math.round(profile.rows)}`);
  if (profile.seamPx !== undefined) row(text.seam, `${profile.seamPx} px`);
  if (profile.pixelPitchMm !== undefined) row(text.pitch, `P${profile.pixelPitchMm}`);
  if (profile.viewingDistanceM !== undefined) row(text.distance, `${profile.viewingDistanceM} m`);
  if (profile.safeAreaPx !== undefined) row(text.safeArea, `${profile.safeAreaPx} px`);
  if (profile.brightnessCdM2 !== undefined || profile.ambientLux !== undefined) {
    row(
      text.brightness,
      [profile.brightnessCdM2 === undefined ? null : `${profile.brightnessCdM2} cd/m²`, profile.ambientLux === undefined ? null : `${profile.ambientLux} lux`]
        .filter((part): part is string => part !== null)
        .join(' / '),
    );
  }
  if (metrics?.physical !== undefined && metrics?.physical !== null) {
    row(
      text.physical,
      text.physicalSize(
        round(metrics.physical.widthMm / 1000),
        round(metrics.physical.heightMm / 1000),
      ),
    );
  }
  if (metrics?.angular !== undefined && metrics?.angular !== null) {
    row(text.angle, `${metrics.angular.horizontalDeg}° × ${metrics.angular.verticalDeg}°`);
  }
  if (metrics?.minimumLegibleFontPx !== null && metrics?.minimumLegibleFontPx !== undefined) {
    row(text.minFont, `${Math.round(metrics.minimumLegibleFontPx)} px`);
  }

  const toggle = (kind: DesignerDisplayOverlayKind, label: string): string =>
    `<button type="button" class="designer-control designer-display-toggle" data-display-overlay="${kind}" aria-pressed="${String(toggles.has(kind))}">${escapeHtml(label)}</button>`;

  return `<div class="display-panel-head">
      <span class="display-panel-title">${text.label}</span>
      <button type="button" class="topbar-icon-button" data-display-close aria-label="${text.close}">×</button>
    </div>
    <div class="display-panel-rows">${rows.join('')}</div>
    <div class="display-panel-toggles">
      ${toggle('safe-area', text.safeArea)}
      ${toggle('seam', text.seam)}
      ${toggle('distance', text.distance)}
    </div>
    <p class="display-panel-hint">${text.hint}</p>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 渲染并采纳表单控件：按钮需要与既有控件走同一套模板与键盘行为。 */
export function renderDisplayPanel(
  panel: HTMLElement,
  profile: ScreenTargetDisplayProfile | undefined,
  metrics: DesignerDisplayMetrics | undefined,
  toggles: ReadonlySet<DesignerDisplayOverlayKind>,
): void {
  panel.innerHTML = displayPanelMarkup(profile, metrics, toggles);
  adoptDesignerFormControls(panel);
}
