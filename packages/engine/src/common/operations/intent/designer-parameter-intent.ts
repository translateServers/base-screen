/**
 * 数值类意图的本地解析：把「字号改成 64」这类请求翻译成属性补丁。
 *
 * 报告二 R05 要求这类请求**不经过模型**：它是确定性的取值，走面板同一条事务通道，
 * 命中后面板同步回填。解析只认明确写出的数值，不猜代词、不做语义推断。
 */
export type DesignerParameterProperty =
  | 'style.fontSize'
  | 'style.color'
  | 'size.width'
  | 'size.height';

export interface DesignerParameterPatch {
  readonly property: DesignerParameterProperty;
  readonly value: string | number;
  /** 状态行文案用的短名，例如「字号」。 */
  readonly label: string;
}

const NUMBER = '(-?\\d{1,4}(?:\\.\\d{1,2})?)';
const PREFIX = '(?:改成|改为|设为|设置为|调到|调成|变成|到)?';
const UNIT = '(?:\\s*(?:px|像素))?';

const RULES: readonly {
  readonly property: DesignerParameterProperty;
  readonly label: string;
  readonly pattern: RegExp;
  readonly parse: (raw: string) => string | number;
}[] = [
  {
    property: 'style.fontSize',
    label: '字号',
    pattern: new RegExp(`(?:字号|字体大小|文字大小)\\s*${PREFIX}\\s*${NUMBER}${UNIT}`),
    parse: (raw) => Number(raw),
  },
  {
    property: 'size.width',
    label: '宽度',
    pattern: new RegExp(`(?:宽度|宽)\\s*${PREFIX}\\s*${NUMBER}${UNIT}`),
    parse: (raw) => Number(raw),
  },
  {
    property: 'size.height',
    label: '高度',
    pattern: new RegExp(`(?:高度|高)\\s*${PREFIX}\\s*${NUMBER}${UNIT}`),
    parse: (raw) => Number(raw),
  },
  {
    property: 'style.color',
    label: '颜色',
    pattern: /(?:文字颜色|字体颜色|颜色)\s*(?:改成|改为|设为|设置为|调成|变成)?\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})/,
    parse: (raw) => raw.toLowerCase(),
  },
];

export function matchDesignerParameterIntent(text: string): DesignerParameterPatch | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  for (const rule of RULES) {
    const match = rule.pattern.exec(trimmed);
    if (match === null) continue;
    const raw = match[1];
    if (raw === undefined) continue;
    const value = rule.parse(raw);
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) continue;
    return { property: rule.property, value, label: rule.label };
  }
  return null;
}
