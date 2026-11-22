/**
 * 样式键词典与描述性文案键（base-screen-docs ADR-0099 §2.6 / R2–R4）的运行时副本。
 *
 * 源码门禁 `tooling/checks/material-atomicity.mjs` 是这两张表的评审落点；在线作者面（ADR-0105）
 * 没有源码可扫，体检在运行时读这里。两份由 `tests/tooling/material-style-keys.test.ts` 锁定逐项相等，
 * 改一处必须同步另一处。
 */

/** §2.6 样式键词典：通用语义的样式键，新物料优先复用。 */
export const BASE_SCREEN_STYLE_KEY_DICTIONARY: ReadonlySet<string> = new Set([
  'fill',
  'backgroundColor',
  'color',
  'labelColor',
  'accentColor',
  'fontSize',
  'labelFontSize',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'strokeColor',
  'strokeWidth',
  'fontWeight',
  'textAlign',
  'verticalAlign',
  'letterSpacing',
  'lineHeight',
  'lineSpacing',
  'shadowColor',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'criticalColor',
  'warningColor',
  'infoColor',
  'runningColor',
  'standbyColor',
  'faultColor',
  'offlineColor',
  'unknownColor',
  // 趋势语义色（ADR-0105 P4）：读数朝好 / 坏方向变化，由组件的「越高越好」决定哪一侧算改善。
  'positiveColor',
  'negativeColor',
]);

/** 已评审登记的词典外样式键（R4）：新物料可以复用，不再另行评审。 */
export const BASE_SCREEN_REGISTERED_STYLE_KEYS: ReadonlySet<string> = new Set([
  'accent',
  'background',
  'connectorColor',
  'connectorWidth',
  'dash',
  'fillColor',
  'fillGlow',
  'gridColor',
  'headerBackgroundColor',
  'headerColor',
  'lineWidth',
  'nodeBackground',
  'nodeBorderColor',
  'objectFit',
  'rowHeight',
  'seriesColor',
  'thickness',
  'tileGap',
  'tileRadius',
  'trackColor',
  'valueColor',
  'waterColor',
  'waveColor',
]);

/**
 * 只描述「这个组件是什么」的文案键（R2）：需要标题、说明时由文档层另放 `base.text`（ADR-0099 T4）。
 * 宿主侧还禁止 `label`（R3），在线组件属于宿主侧，因此体检按 R3 口径（含 `label`）判定。
 */
export const BASE_SCREEN_DESCRIPTIVE_TEXT_KEYS: readonly string[] = [
  'title',
  'caption',
  'description',
  'subtitle',
  'showTitle',
  'titleText',
];
