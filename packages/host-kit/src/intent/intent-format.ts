import type { IntentStylePalette } from './intent-style.js';
import type { IntentKpiDelta } from './intent-types.js';

/** 没有数据时的占位。 */
const KPI_PENDING = '—';

/** 格式化只看数值、单位与小数位。 */
export interface KpiValueInput {
  readonly value: number | null;
  readonly unit?: string;
  readonly precision?: number;
}

/**
 * 指标数值的统一格式（ADR-0112 §2.4）：万 / 亿折算、千分位、小数位、单位间距都在这里，
 * 模型只给数字。百分号紧贴数字，其余单位与数字之间留一个空格（「28.6 万件」「23.7 天」「92.5%」）。
 */
export function formatKpiValue(kpi: KpiValueInput): string {
  if (kpi.value === null) return KPI_PENDING;
  const unit = kpi.unit ?? '';
  const magnitude = Math.abs(kpi.value);
  const [scaled, scale] =
    unit === '%'
      ? [kpi.value, '']
      : magnitude >= 1e8
        ? [kpi.value / 1e8, '亿']
        : magnitude >= 1e4
          ? [kpi.value / 1e4, '万']
          : [kpi.value, ''];
  const digits =
    kpi.precision ??
    (scale !== '' ? 1 : Number.isInteger(scaled) ? 0 : Math.min(2, decimals(scaled)));
  const number = groupThousands(scaled.toFixed(digits));
  if (unit === '%') return `${number}%`;
  const suffix = `${scale}${unit}`;
  return suffix === '' ? number : `${number} ${suffix}`;
}

/** 增减量：带正负号；百分比紧贴「%」，百分点写「个百分点」，绝对值沿用指标单位。 */
export function formatKpiDelta(kpi: KpiValueInput & { readonly delta?: IntentKpiDelta }): string {
  const delta = kpi.delta;
  if (delta === undefined) return '';
  const sign = delta.value > 0 ? '+' : delta.value < 0 ? '-' : '';
  const magnitude = Math.abs(delta.value);
  if (delta.unit === 'percent') return `${sign}${trimZeros(magnitude.toFixed(1))}%`;
  if (delta.unit === 'point') return `${sign}${trimZeros(magnitude.toFixed(1))} 个百分点`;
  const absolute = formatKpiValue({
    value: magnitude,
    ...(kpi.unit === undefined ? {} : { unit: kpi.unit }),
  });
  return `${sign}${absolute}`;
}

/**
 * 增减量的颜色只取主题状态色位（ADR-0110 的 `theme:<slot>`），不写固定色值：
 * 增为好且在增、减为好且在减 → success；反过来 → danger；neutral 或没变化 → 次要文字色。
 */
export function deltaColor(delta: IntentKpiDelta, palette: IntentStylePalette): string {
  if (delta.direction === 'neutral' || delta.value === 0) return palette.muted;
  const good = (delta.direction === 'up-good') === delta.value > 0;
  return good ? 'theme:success' : 'theme:danger';
}

function decimals(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function groupThousands(text: string): string {
  const [integer, fraction] = text.split('.');
  const grouped = (integer ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
