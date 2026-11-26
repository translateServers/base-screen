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

/** 已带数量级的单位：中文以万 / 亿 / 千开头，英文以 K / M / B / k 开头且后面不是字母（`Mbps` 不算）。 */
const SCALED_UNIT = /^(?:[万亿千]|[KMBk](?![a-z]))/;

/** 屏的文案语言：中文屏用「万 / 亿 / 个百分点」，其余用 K / M / B 与 pp。 */
export type IntentLanguage = 'zh' | 'en';

/** 标题与副标题里没有任何中日韩字符，就按英文屏处理。 */
export function detectIntentLanguage(...texts: readonly string[]): IntentLanguage {
  return /[⺀-鿿豈-﫿＀-￯]/.test(texts.join('')) ? 'zh' : 'en';
}

/**
 * 指标数值的统一格式（ADR-0112 §2.4）：万 / 亿折算、千分位、小数位、单位间距都在这里，
 * 模型只给数字。百分号紧贴数字，其余单位与数字之间留一个空格（「28.6 万件」「23.7 天」「92.5%」）。
 * 英文屏不折算到万：不到一百万写全（`286,000 cases`），百万以上用 M / B（`1.2M units`）。
 */
export function formatKpiValue(kpi: KpiValueInput, language: IntentLanguage = 'zh'): string {
  if (kpi.value === null) return KPI_PENDING;
  const unit = kpi.unit ?? '';
  const magnitude = Math.abs(kpi.value);
  // 单位自己已经带数量级（「万元」「亿元」「K」「M」）时不再折算：否则 286000 万元会写成「28.6 万万元」。
  const [scaled, scale] =
    unit === '%' || SCALED_UNIT.test(unit)
      ? [kpi.value, '']
      : language === 'en'
        ? magnitude >= 1e9
          ? [kpi.value / 1e9, 'B']
          : magnitude >= 1e6
            ? [kpi.value / 1e6, 'M']
            : [kpi.value, '']
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
  if (language === 'en') return unit === '' ? `${number}${scale}` : `${number}${scale} ${unit}`;
  const suffix = `${scale}${unit}`;
  return suffix === '' ? number : `${number} ${suffix}`;
}

/**
 * 增减量：带正负号；百分比紧贴「%」，百分点中文写「个百分点」、英文写「pp」，绝对值沿用指标单位。
 * 四舍五入后是零就不带符号（「-0 个百分点」没有意义）。
 */
export function formatKpiDelta(
  kpi: KpiValueInput & { readonly delta?: IntentKpiDelta },
  language: IntentLanguage = 'zh',
): string {
  const delta = kpi.delta;
  if (delta === undefined) return '';
  const zero = deltaIsZero(delta);
  const sign = zero ? '' : delta.value > 0 ? '+' : '-';
  const magnitude = Math.abs(delta.value);
  if (delta.unit === 'percent') return `${sign}${trimZeros(magnitude.toFixed(1))}%`;
  if (delta.unit === 'point') {
    return `${sign}${trimZeros(magnitude.toFixed(1))}${language === 'en' ? ' pp' : ' 个百分点'}`;
  }
  const absolute = formatKpiValue(
    {
      value: magnitude,
      ...(kpi.unit === undefined ? {} : { unit: kpi.unit }),
    },
    language,
  );
  return `${sign}${absolute}`;
}

/** 显示出来是零：百分比 / 百分点保留一位小数后为零；绝对值只有恰好为零。 */
export function deltaIsZero(delta: IntentKpiDelta): boolean {
  if (delta.value === 0) return true;
  return delta.unit === 'absolute' ? false : Number(Math.abs(delta.value).toFixed(1)) === 0;
}

/**
 * 增减量的颜色只取主题状态色位（ADR-0110 的 `theme:<slot>`），不写固定色值：
 * 增为好且在增、减为好且在减 → success；反过来 → danger；neutral 或没变化 → 次要文字色。
 */
export function deltaColor(delta: IntentKpiDelta, palette: IntentStylePalette): string {
  if (delta.direction === 'neutral' || deltaIsZero(delta)) return palette.muted;
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
