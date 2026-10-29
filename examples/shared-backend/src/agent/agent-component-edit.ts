const MAX_COMPONENTS = 12;
const MAX_CONTEXT_KEYS = 48;

export interface AgentEditableComponent {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly style: Readonly<Record<string, unknown>>;
  readonly text?: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
}

export interface AgentComponentPatch {
  readonly componentId: string;
  readonly name?: string;
  readonly text?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly style?: Readonly<Record<string, unknown>>;
  readonly position?: { readonly x: number; readonly y: number };
  readonly size?: { readonly width: number; readonly height: number };
}

export interface AgentComponentEditSpec {
  readonly summary: string;
  readonly patches: readonly AgentComponentPatch[];
}

export const AGENT_COMPONENT_EDIT_SYSTEM_PROMPT = `你是大屏组件编辑器。用户会给你一条修改指令和当前选中的组件。
你只输出 JSON，不要解释，不要写 markdown。

JSON 结构：
{
  "summary": "一句话说明本次改了什么",
  "patches": [
    {
      "componentId": "选中组件的 id",
      "name": "可选：组件图层名",
      "text": "可选：纯文本组件的新文本",
      "props": { "需要修改的属性": "新值" },
      "style": { "需要修改的样式": "新值" },
      "position": { "x": 0, "y": 0 },
      "size": { "width": 320, "height": 120 }
    }
  ]
}

约束：
- componentId 只能来自选中组件列表，每个组件最多一个 patch。
- 只写需要变化的字段；props/style 只写要改的键，不要复制整份对象。
- 不得新增或删除组件，不得修改 dataSource、dataValue、dataBinding。
- 样式值必须符合现有组件语义；不要编造用户没要求的大量视觉变化。
- 指令无法安全映射到组件修改时，返回 {"summary":"无法应用","patches":[]}。
- 全部使用简体中文，不要 emoji。`;

export function buildAgentComponentUserPrompt(
  instruction: string,
  components: readonly AgentEditableComponent[],
): string {
  return `修改指令：${instruction}

选中组件：
${JSON.stringify(components)}`;
}

/** 读取宿主传来的组件快照；任一结构不合法都失败关闭。 */
export function readEditableComponents(value: unknown): readonly AgentEditableComponent[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_COMPONENTS) return null;
  const components: AgentEditableComponent[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = readNonEmptyString(item.id);
    const type = readNonEmptyString(item.type);
    const name = readNonEmptyString(item.name);
    const text = item.text === undefined ? undefined : readText(item.text);
    const position = readPoint(item.position);
    const size = readSize(item.size);
    if (
      id === null ||
      type === null ||
      name === null ||
      (item.text !== undefined && text === null) ||
      position === null ||
      size === null ||
      !isRecord(item.props) ||
      !isRecord(item.style) ||
      Object.keys(item.props).length > MAX_CONTEXT_KEYS ||
      Object.keys(item.style).length > MAX_CONTEXT_KEYS ||
      ids.has(id)
    ) {
      return null;
    }
    ids.add(id);
    components.push({
      id,
      type,
      name,
      props: item.props,
      style: item.style,
      ...(text === undefined || text === null ? {} : { text }),
      position,
      size,
    });
  }
  return components;
}

/** 解析模型输出，并再次校验目标 ID 与 patch 结构。 */
export function parseAgentComponentEditSpec(
  text: string,
  components: readonly AgentEditableComponent[],
): AgentComponentEditSpec | null {
  let value: unknown;
  try {
    value = JSON.parse(stripCodeFence(text));
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const summary = readNonEmptyString(value.summary);
  if (summary === null || !Array.isArray(value.patches) || value.patches.length === 0) return null;
  const allowed = new Set(components.map((component) => component.id));
  const seen = new Set<string>();
  const patches: AgentComponentPatch[] = [];
  for (const item of value.patches.slice(0, MAX_COMPONENTS)) {
    if (!isRecord(item)) return null;
    const componentId = readNonEmptyString(item.componentId);
    if (componentId === null || !allowed.has(componentId) || seen.has(componentId)) return null;
    if (Object.keys(item).some((key) => !COMPONENT_PATCH_FIELDS.has(key))) return null;
    const patch = readComponentPatch(componentId, item);
    if (patch === null) return null;
    seen.add(componentId);
    patches.push(patch);
  }
  return patches.length === 0 ? null : { summary: summary.slice(0, 80), patches };
}

/**
 * 未配置模型时的确定性兜底：只处理能明确解释的常见指令，不擅自猜测用户意图。
 * 文本替换、颜色、字号、粗细、对齐、透明度和整体缩放是最常用的一组组件级编辑。
 */
export function deterministicComponentEdit(
  instruction: string,
  components: readonly AgentEditableComponent[],
): AgentComponentEditSpec | null {
  const normalized = instruction.trim();
  const patches: AgentComponentPatch[] = [];
  const replacement = extractReplacementText(normalized);
  const color = extractColor(normalized);
  const fontSize = extractFontSize(normalized);
  const opacity = extractOpacity(normalized);
  const scale = extractScale(normalized);
  const fontWeight = /不加粗|取消加粗/.test(normalized)
    ? 400
    : /加粗|粗体|bold/i.test(normalized)
      ? 700
      : undefined;
  const textAlign = /居中/.test(normalized)
    ? 'center'
    : /左对齐/.test(normalized)
      ? 'left'
      : /右对齐/.test(normalized)
        ? 'right'
        : undefined;
  const textTargets = components.filter((component) => component.text !== undefined);

  for (const component of components) {
    const style: Record<string, unknown> = {};
    const textual = component.text !== undefined;
    let patchText: string | undefined;
    if (replacement !== null && textual && textTargets.length === 1) {
      patchText = replacement;
    }
    if (color !== null) {
      if (/背景/.test(normalized) || (!textual && 'backgroundColor' in component.style)) {
        style.backgroundColor = color;
      } else if (textual || 'color' in component.style) {
        style.color = color;
      } else {
        style.backgroundColor = color;
      }
    }
    if (fontSize !== null) style.fontSize = fontSize;
    if (fontWeight !== undefined) style.fontWeight = fontWeight;
    if (textAlign !== undefined) style.textAlign = textAlign;
    if (opacity !== null) style.opacity = opacity;
    const patch: {
      componentId: string;
      text?: string;
      style?: Record<string, unknown>;
      size?: { width: number; height: number };
    } = { componentId: component.id };
    if (patchText !== undefined) patch.text = patchText;
    if (Object.keys(style).length > 0) patch.style = style;
    if (scale !== null) {
      patch.size = {
        width: Math.max(1, Math.round(component.size.width * scale)),
        height: Math.max(1, Math.round(component.size.height * scale)),
      };
    }
    if (Object.keys(patch).length > 1) patches.push(patch);
  }

  if (patches.length === 0) return null;
  const names = patches
    .map((patch) => components.find((component) => component.id === patch.componentId)?.name)
    .filter((name): name is string => name !== undefined);
  return {
    summary: `已生成${names.length === 0 ? '组件' : ` ${names.join('、')} `}的修改`,
    patches,
  };
}

const COMPONENT_PATCH_FIELDS = new Set([
  'componentId',
  'name',
  'text',
  'props',
  'style',
  'position',
  'size',
]);

function readComponentPatch(
  componentId: string,
  item: Readonly<Record<string, unknown>>,
): AgentComponentPatch | null {
  const name = item.name === undefined ? undefined : readNonEmptyString(item.name);
  if (item.name !== undefined && name === null) return null;
  const text = item.text === undefined ? undefined : readText(item.text);
  if (item.text !== undefined && text === null) return null;
  const props = item.props === undefined ? undefined : readJsonObject(item.props);
  const style = item.style === undefined ? undefined : readJsonObject(item.style);
  const position = item.position === undefined ? undefined : readPoint(item.position);
  const size = item.size === undefined ? undefined : readSize(item.size);
  if (item.props !== undefined && props === null) return null;
  if (item.style !== undefined && style === null) return null;
  if (item.position !== undefined && position === null) return null;
  if (item.size !== undefined && size === null) return null;
  const patch: AgentComponentPatch = {
    componentId,
    ...(name === undefined || name === null ? {} : { name }),
    ...(text === undefined || text === null ? {} : { text }),
    ...(props === undefined || props === null ? {} : { props }),
    ...(style === undefined || style === null ? {} : { style }),
    ...(position === undefined || position === null ? {} : { position }),
    ...(size === undefined || size === null ? {} : { size }),
  };
  return Object.keys(patch).length === 1 ? null : patch;
}

function extractReplacementText(instruction: string): string | null {
  const match = instruction.match(
    /(?:改成|改为|换成|写成|更新为|设为|设置为)\s*[“"「『']?([^”"」』'，。；;,\n]+)[”"」』']?/,
  );
  const value = match?.[1]?.trim() ?? '';
  if (
    value === '' ||
    value.length > 60 ||
    isColorPhrase(value) ||
    /^\d+(?:px|像素|号字)$/i.test(value)
  ) {
    return null;
  }
  return value;
}

function extractColor(instruction: string): string | null {
  const hex = instruction.match(/#[0-9a-f]{3,8}\b/i);
  if (hex !== null) return hex[0];
  if (!/颜色|色|背景/.test(instruction)) return null;
  const named = COLOR_VALUES.find(([name]) => instruction.includes(name));
  return named?.[1] ?? null;
}

function extractFontSize(instruction: string): number | null {
  const match =
    instruction.match(/(?:字号|字体)\s*(?:改为|设为|调整到|调到)?\s*(\d{1,3})/i) ??
    instruction.match(/(\d{1,3})\s*(?:px|像素|号字|号)/i);
  if (match?.[1] === undefined) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 8 && value <= 200 ? value : null;
}

function extractOpacity(instruction: string): number | null {
  if (!/透明/.test(instruction)) return null;
  const match = instruction.match(/(\d{1,3})\s*%/);
  if (match?.[1] === undefined) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Number((value / 100).toFixed(2));
}

function extractScale(instruction: string): number | null {
  if (/放大|大一点|更大/.test(instruction)) return 1.15;
  if (/缩小|小一点|更小/.test(instruction)) return 0.85;
  return null;
}

function isColorPhrase(value: string): boolean {
  return /^(?:红色?|蓝色?|绿色?|白色?|黑色?|黄色?|橙色?|紫色?|灰色?|#[0-9a-f]{3,8})$/i.test(value);
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' || text.length > 120 ? null : text;
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' || text.length > 200 ? null : text;
}

function readPoint(value: unknown): { readonly x: number; readonly y: number } | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return null;
  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return null;
  return { x: value.x, y: value.y };
}

function readSize(value: unknown): { readonly width: number; readonly height: number } | null {
  if (!isRecord(value)) return null;
  if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0) {
    return null;
  }
  if (typeof value.height !== 'number' || !Number.isFinite(value.height) || value.height <= 0) {
    return null;
  }
  return { width: value.width, height: value.height };
}

function readJsonObject(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!isRecord(value) || Object.keys(value).length > MAX_CONTEXT_KEYS) return null;
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COLOR_VALUES: readonly (readonly [string, string])[] = [
  ['红', '#ff5c5c'],
  ['蓝', '#4c9df3'],
  ['绿', '#4fcc6f'],
  ['白', '#ffffff'],
  ['黑', '#111827'],
  ['黄', '#facc15'],
  ['橙', '#fb923c'],
  ['紫', '#a78bfa'],
  ['灰', '#94a3b8'],
];
