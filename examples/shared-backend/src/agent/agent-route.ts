import { Logger } from '@nestjs/common';
import {
  type AgentCanvasBackground,
  type AgentCanvasPatch,
  type AgentCanvasState,
  isCanvasInstruction,
  MAX_GRADIENT_STOPS,
  matchCanvasInstruction,
  parseCanvasColor,
} from './agent-canvas';
import {
  AGENT_ROUTE_TIMEOUT_MS,
  type AgentLlmSettings,
  type AgentToolCall,
  requestAgentCompletion,
  requestAgentToolCall,
} from './agent-client';

/**
 * 指令 → 动作的路由。
 *
 * 只有四类动作，且都能落到既有通道上：
 * - `generate_screen` 整屏生成（会替换未锁定组件）；
 * - `edit_components` 只改选中组件；
 * - `set_canvas` 只改画布，零模型执行；
 * - `unsupported` 明确说"做不到"，不产生任何变更。
 *
 * 顺序是"规则优先、模型兜底"：规则能判的绝不花一次模型调用；模型只处理规则覆盖不到的
 * 长尾。路由失败（超时 / 网关不支持 tools）一律回 `unsupported`，**绝不静默落回整屏生成**——
 * 那正是"改个背景色却重出一屏"的来源。
 */

export type AgentRoutedBy = 'rule' | 'model';

export type AgentActionName = 'generate_screen' | 'edit_components' | 'set_canvas' | 'unsupported';

export type AgentUnsupportedReason =
  | 'out_of_domain'
  | 'missing_reference'
  | 'unsafe_scope'
  | 'not_implemented'
  | 'model_unavailable';

export type AgentIntentScope = 'screen' | 'canvas' | 'components';

/** 当前屏摘要：只带结构骨架，不带几何、正文与数据源。 */
export interface AgentScreenDigest {
  readonly canvas?: {
    readonly width?: number;
    readonly height?: number;
    readonly backgroundColor?: string;
    readonly hasBackgroundImage?: boolean;
  };
  readonly componentCount?: number;
  readonly types?: readonly { readonly type: string; readonly count: number }[];
  readonly selection?: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
  }[];
  readonly lockedCount?: number;
}

export type AgentRouteDecision =
  | { readonly action: 'generate_screen'; readonly routedBy: AgentRoutedBy }
  | { readonly action: 'edit_components'; readonly routedBy: AgentRoutedBy }
  | {
      readonly action: 'set_canvas';
      readonly routedBy: AgentRoutedBy;
      readonly patch: AgentCanvasPatch;
    }
  | {
      readonly action: 'unsupported';
      readonly routedBy: AgentRoutedBy;
      readonly reason: AgentUnsupportedReason;
      readonly suggestion?: string;
    };

const UNSUPPORTED_REASONS: readonly AgentUnsupportedReason[] = [
  'out_of_domain',
  'missing_reference',
  'unsafe_scope',
  'not_implemented',
  'model_unavailable',
];

const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_SUGGESTION_LENGTH = 120;

/** 生成意图的动词表。命中就不再花一次路由调用——这类句子本来就该整屏重做。 */
const GENERATION_INTENT =
  /^(?:请|帮我|帮忙|给我|麻烦)?\s*(?:生成|做|来|建|创建|新建|设计|重做|重新设计|换一版|出一张|出一屏|出个)/;

/**
 * 背景形态与结构：与契约 `ScreenCanvas.background` 同形。
 *
 * 后端是 CJS 且刻意不依赖契约包，所以这是一份"必须与契约一致"的副本——不一致的代价
 * 不是报错，而是模型在工具 schema 里看不到渐变，于是把"改成渐变"回答成"只支持纯色"。
 * 一致性由根级 `tests/examples/canvas-background-parity.test.ts` 逐类型比对：契约新增
 * 形态时那条测试直接红。
 */
export const AGENT_CANVAS_BACKGROUND_TYPES = [
  'solid',
  'linear-gradient',
  'radial-gradient',
] as const;

export const AGENT_CANVAS_BACKGROUND_SCHEMA = {
  type: 'object',
  description:
    '背景填充。纯色：{type:"solid",color}；线性渐变：{type:"linear-gradient",angle,stops}；径向渐变：{type:"radial-gradient",position:{x,y},stops}。stops 至少两个色标且 position 严格递增。用户说"渐变的某色"时用它，不要让用户改给图片 URL。',
  properties: {
    type: { type: 'string', enum: [...AGENT_CANVAS_BACKGROUND_TYPES] },
    color: { type: 'string', description: '仅 solid 使用：十六进制色值' },
    angle: {
      type: 'number',
      description: '仅 linear-gradient 使用：0-360 度，180 为自上而下（大屏常用默认）',
    },
    position: {
      type: 'object',
      description: '仅 radial-gradient 使用：圆心百分比坐标',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    stops: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          color: { type: 'string', description: '十六进制色值，例如 #87ceeb' },
          position: { type: 'number', description: '0-100，严格递增' },
        },
        required: ['color', 'position'],
        additionalProperties: false,
      },
    },
  },
  required: ['type'],
  additionalProperties: false,
} as const;

export const AGENT_ACTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'generate_screen',
      description: '重做整屏：用户要一屏新的内容或明确要求重新设计。会替换未锁定的组件。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_canvas',
      description:
        '只改画布：背景纯色、线性/径向渐变、背景图（含清除）。不新增、不删除、不修改任何组件。',
      parameters: {
        type: 'object',
        properties: {
          backgroundColor: {
            type: 'string',
            description: '纯色背景的十六进制颜色，例如 #0f172a。它不会清除已设置的渐变。',
          },
          background: AGENT_CANVAS_BACKGROUND_SCHEMA,
          backgroundImage: {
            type: ['string', 'null'],
            description: '背景图 URL；null 表示清除背景图',
          },
          backgroundImageFit: { type: ['string', 'null'], enum: ['cover', 'contain', null] },
        },
        additionalProperties: false,
        minProperties: 1,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unsupported',
      description: '做不到、缺信息，或需要用户先选中组件。不要用整屏生成来"猜"。',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['out_of_domain', 'missing_reference', 'unsafe_scope', 'not_implemented'],
          },
          suggestion: { type: 'string', description: '给用户的一句可执行建议' },
        },
        required: ['reason'],
        additionalProperties: false,
      },
    },
  },
] as const;

export function isGenerationIntent(text: string): boolean {
  return GENERATION_INTENT.test(text.trim());
}

export interface RouteAgentActionInput {
  readonly text: string;
  readonly scope: AgentIntentScope;
  /** 当前屏摘要；结构由 `describeDigest` 做有界读取，调用方不必先精确构造。 */
  readonly digest?: unknown;
  /** 画布当前值，用于判"改了等于没改"。 */
  readonly canvasState?: unknown;
  /** 没配置模型时传 null：规则仍然生效，长尾直接 unsupported。 */
  readonly settings: AgentLlmSettings | null;
  readonly logger: Logger;
}

export async function routeAgentAction(input: RouteAgentActionInput): Promise<AgentRouteDecision> {
  const text = input.text.trim();

  // 组件作用域没有歧义：用户已经选中了要改的东西，走既有编辑通道。
  if (input.scope === 'components') {
    return { action: 'edit_components', routedBy: 'rule' };
  }

  // 画布指令两种作用域都先过规则：命中就零模型执行，这也是"改背景不重生成"的保障。
  const canvasPatch = matchCanvasInstruction(text, readCanvasState(input.canvasState));
  if (canvasPatch !== null) {
    return { action: 'set_canvas', routedBy: 'rule', patch: canvasPatch };
  }

  // 语义明确但"没有变化"（例如当前没有背景图却要求去掉）：直接说明，不必再花一次模型调用。
  if (isCanvasInstruction(text)) {
    return {
      action: 'unsupported',
      routedBy: 'rule',
      reason: 'not_implemented',
      suggestion: '画布没有变化：换个颜色（例如 #87ceeb）、换一种渐变，或给出 https 背景图地址。',
    };
  }

  // 画布作用域只允许 set_canvas：用户明确说了只改画布，不能借机重做内容。
  if (input.scope === 'canvas') {
    return routeWithModel(input, ['set_canvas', 'unsupported']);
  }

  if (isGenerationIntent(text)) {
    return { action: 'generate_screen', routedBy: 'rule' };
  }

  return routeWithModel(input, ['generate_screen', 'set_canvas', 'unsupported']);
}

async function routeWithModel(
  input: RouteAgentActionInput,
  allowed: readonly AgentActionName[],
): Promise<AgentRouteDecision> {
  if (input.settings === null) {
    return {
      action: 'unsupported',
      routedBy: 'rule',
      reason: 'model_unavailable',
      suggestion:
        '试试更直接的指令：把背景改成 #0f172a / 把背景改成渐变的天蓝色 / 做一张华东销售大屏 / 先选中组件再改文案。',
    };
  }

  const tools = AGENT_ACTION_TOOLS.filter((tool) => allowed.includes(tool.function.name));
  const system = buildRouteSystemPrompt(input.digest, allowed);
  const user = buildRouteUserPrompt(input.text, input.scope, input.digest);

  const toolResult = await requestAgentToolCall(
    { ...input.settings, timeoutMs: AGENT_ROUTE_TIMEOUT_MS },
    { system, user, tools, maxTokens: 300 },
    input.logger,
  );

  const fromTool = readToolDecision(toolResult.toolCall, input.scope);
  if (fromTool !== null) return fromTool;

  const fromText = readTextDecision(toolResult.text, input.scope);
  if (fromText !== null) return fromText;

  // 网关可能不支持 `tools` / `tool_choice: required`（直接 400）。退化成一次普通 JSON 路由，
  // 仍然不猜动作：两次都拿不到就明确说"路由不可用"。
  if (toolResult.ok === false && toolResult.failure !== undefined) {
    const fallback = await routeWithJsonPrompt(input, allowed, system);
    if (fallback !== null) return fallback;
    return {
      action: 'unsupported',
      routedBy: 'model',
      reason: 'model_unavailable',
      suggestion: describeRouteFailure(toolResult.failure),
    };
  }

  return {
    action: 'unsupported',
    routedBy: 'model',
    reason: 'not_implemented',
    suggestion:
      '没听懂要改哪里。可以选中组件后再说，或直接说"把背景改成 #0f172a""背景改成渐变的天蓝色"。',
  };
}

async function routeWithJsonPrompt(
  input: RouteAgentActionInput,
  allowed: readonly AgentActionName[],
  system: string,
): Promise<AgentRouteDecision | null> {
  if (input.settings === null) return null;
  const result = await requestAgentCompletion(
    { ...input.settings, timeoutMs: AGENT_ROUTE_TIMEOUT_MS },
    `${system}

只输出一个 JSON 对象，不要解释。可用 action：${allowed.join('、')}。
示例：{"action":"generate_screen"} / {"action":"set_canvas","backgroundColor":"#0f172a"} /
{"action":"set_canvas","background":{"type":"linear-gradient","angle":180,"stops":[{"color":"#87ceeb","position":0},{"color":"#a8ddf5","position":100}]}} /
{"action":"unsupported","reason":"not_implemented","suggestion":"先选中组件再改文案"}。`,
    buildRouteUserPrompt(input.text, input.scope, input.digest),
    input.logger,
  );
  if (!result.ok || result.text === undefined) return null;
  return readTextDecision(result.text, input.scope);
}

function readToolDecision(
  call: AgentToolCall | undefined,
  scope: AgentIntentScope,
): AgentRouteDecision | null {
  if (call === undefined) return null;
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(call.arguments === '' ? '{}' : call.arguments) as unknown;
    if (isRecord(parsed)) args = parsed;
  } catch {
    return null;
  }
  return readDecision(call.name, args, scope, 'model');
}

function readTextDecision(
  text: string | undefined,
  scope: AgentIntentScope,
): AgentRouteDecision | null {
  if (text === undefined) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const action = typeof parsed.action === 'string' ? parsed.action : '';
  return readDecision(action, parsed, scope, 'model');
}

function readDecision(
  action: string,
  args: Record<string, unknown>,
  scope: AgentIntentScope,
  routedBy: AgentRoutedBy,
): AgentRouteDecision | null {
  if (action === 'generate_screen') {
    // 画布作用域下禁止整屏重生成：这是"只说改背景却重做一屏"的结构性防线。
    if (scope === 'canvas') return null;
    return { action: 'generate_screen', routedBy };
  }

  if (action === 'edit_components') {
    // 没有选中上下文时不可能编辑组件，宁可拒绝也不猜"改哪个"。
    if (scope !== 'components') return null;
    return { action: 'edit_components', routedBy };
  }

  if (action === 'set_canvas') {
    const patch = readCanvasPatch(args);
    if (patch === null) return null;
    return { action: 'set_canvas', routedBy, patch };
  }

  if (action === 'unsupported') {
    const reason =
      typeof args.reason === 'string' &&
      UNSUPPORTED_REASONS.includes(args.reason as AgentUnsupportedReason)
        ? (args.reason as AgentUnsupportedReason)
        : 'not_implemented';
    const suggestion =
      typeof args.suggestion === 'string' && args.suggestion.trim() !== ''
        ? args.suggestion.trim().slice(0, MAX_SUGGESTION_LENGTH)
        : undefined;
    return {
      action: 'unsupported',
      routedBy,
      reason,
      ...(suggestion === undefined ? {} : { suggestion }),
    };
  }

  return null;
}

function readCanvasPatch(args: Record<string, unknown>): AgentCanvasPatch | null {
  const patch: {
    backgroundColor?: string;
    background?: AgentCanvasBackground | null;
    backgroundImage?: string | null;
    backgroundImageFit?: 'cover' | 'contain' | null;
  } = {};

  if (args.background !== undefined) {
    // null 表示清除背景填充（回到 backgroundColor）；非法结构明确拒绝，
    // 不能悄悄丢掉——丢掉的后果是用户看到"画布已经是你说的样子"。
    const background = args.background === null ? null : readCanvasBackground(args.background);
    if (args.background !== null && background === null) return null;
    patch.background = background;
  }

  if (args.backgroundColor !== undefined) {
    if (typeof args.backgroundColor !== 'string') return null;
    const color = parseCanvasColor(args.backgroundColor);
    if (color === null) return null;
    patch.backgroundColor = color;
  }

  if (args.backgroundImage === null) {
    patch.backgroundImage = null;
    patch.backgroundImageFit = null;
  } else if (args.backgroundImage !== undefined) {
    if (typeof args.backgroundImage !== 'string') return null;
    const url = args.backgroundImage;
    if (!/^https?:\/\//i.test(url) || url.length > MAX_IMAGE_URL_LENGTH) return null;
    patch.backgroundImage = url;
    const fit = args.backgroundImageFit;
    if (fit === 'cover' || fit === 'contain') patch.backgroundImageFit = fit;
    else if (fit !== undefined && fit !== null) return null;
  } else if (args.backgroundImageFit !== undefined) {
    return null;
  }

  return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * 模型给的背景结构 → 契约同形的值；任何一处不合法都返回 null。
 *
 * 规则与契约 schema 一一对应（类型、角度 0-360、色标 2-8 个且 position 严格递增、
 * 色值必须是合法十六进制），因为越界的值进文档后只会被 core 拒绝或渲染成透明。
 */
function readCanvasBackground(value: unknown): AgentCanvasBackground | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (type === 'solid') {
    const color = typeof value.color === 'string' ? parseCanvasColor(value.color) : null;
    return color === null ? null : { type: 'solid', color };
  }
  const stops = readColorStops(value.stops);
  if (stops === null) return null;
  if (type === 'linear-gradient') {
    const angle = readBoundedNumber(value.angle, 0, 360);
    return angle === null ? null : { type: 'linear-gradient', angle, stops };
  }
  if (type === 'radial-gradient') {
    if (!isRecord(value.position)) return null;
    const x = readBoundedNumber(value.position.x, 0, 100);
    const y = readBoundedNumber(value.position.y, 0, 100);
    if (x === null || y === null) return null;
    return { type: 'radial-gradient', position: { x, y }, stops };
  }
  return null;
}

function readColorStops(value: unknown): readonly { color: string; position: number }[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_GRADIENT_STOPS) return null;
  const stops: { color: string; position: number }[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return null;
    const color = typeof item.color === 'string' ? parseCanvasColor(item.color) : null;
    const position = readBoundedNumber(item.position, 0, 100);
    if (color === null || position === null) return null;
    const previous = stops[index - 1];
    if (previous !== undefined && previous.position >= position) return null;
    stops.push({ color, position });
  }
  return stops;
}

function readBoundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function buildRouteSystemPrompt(digest: unknown, allowed: readonly AgentActionName[]): string {
  const actionHints = allowed
    .map((action) => {
      if (action === 'generate_screen')
        return '- generate_screen：用户要一屏新内容，或明确要求重新设计';
      if (action === 'set_canvas')
        return '- set_canvas：只改画布（背景纯色、线性/径向渐变、背景图），不动组件';
      if (action === 'edit_components') return '- edit_components：只改当前选中的组件';
      return '- unsupported：做不到、缺信息，或需要用户先选中组件';
    })
    .join('\n');

  return `你是大屏编辑器的指令路由。判断用户这句话要执行哪一个动作，只选一个，不要解释。

可选动作：
${actionHints}

${describeDigest(digest)}

约束：
- 只改背景（纯色、渐变）或背景图，选 set_canvas；不要因为"改"字就选 generate_screen。
- 画布支持纯色、线性渐变、径向渐变三种背景填充，"改成渐变"是合法需求，不要回答不支持，
  也不要让用户改用背景图片。
- 要新内容、新主题、重新设计，才选 generate_screen。
- 语气模糊、缺少对象（"再大一点""改好看点"）选 unsupported，并在 suggestion 里给出可执行说法。
- 不确定时选 unsupported，禁止用 generate_screen 试探。`;
}

function buildRouteUserPrompt(text: string, scope: AgentIntentScope, digest: unknown): string {
  const scopeLabel = scope === 'canvas' ? '画布' : scope === 'components' ? '选中组件' : '整屏';
  return `作用域：${scopeLabel}\n指令：${text}\n${describeDigest(digest)}`;
}

/** 摘要渲染得克制些：只写路由需要的判断依据，不把整份文档塞进提示词。 */
export function describeDigest(digest: unknown): string {
  if (!isRecord(digest)) return '';
  const lines: string[] = [];
  const canvas = isRecord(digest.canvas) ? digest.canvas : undefined;
  if (canvas !== undefined) {
    const width = typeof canvas.width === 'number' ? Math.round(canvas.width) : undefined;
    const height = typeof canvas.height === 'number' ? Math.round(canvas.height) : undefined;
    if (width !== undefined && height !== undefined) {
      const background =
        typeof canvas.backgroundColor === 'string' ? `，底色 ${canvas.backgroundColor}` : '';
      // 渐变存在与否直接决定"改成渐变"是不是有效指令，提示词里必须说清楚。
      const fill =
        typeof canvas.backgroundType === 'string' ? `，填充 ${canvas.backgroundType}` : '';
      const image = canvas.hasBackgroundImage === true ? '，已有背景图' : '';
      lines.push(`当前画布：${width}×${height}${background}${fill}${image}`);
    }
  }
  const componentCount =
    typeof digest.componentCount === 'number' ? Math.round(digest.componentCount) : undefined;
  const types = Array.isArray(digest.types)
    ? digest.types
        .filter(isRecord)
        .slice(0, 8)
        .flatMap((item) =>
          typeof item.type === 'string' && typeof item.count === 'number'
            ? [`${item.type} ${Math.round(item.count)}`]
            : [],
        )
    : [];
  if (componentCount !== undefined) {
    lines.push(
      `当前屏已有 ${componentCount} 个组件${types.length === 0 ? '' : `（${types.join('、')}）`}`,
    );
  }
  const selection = Array.isArray(digest.selection)
    ? digest.selection
        .filter(isRecord)
        .slice(0, 12)
        .flatMap((item) =>
          typeof item.name === 'string' && typeof item.type === 'string'
            ? [`${item.name}(${item.type})`]
            : [],
        )
    : [];
  lines.push(selection.length === 0 ? '当前未选中组件' : `当前选中：${selection.join('、')}`);
  const locked =
    typeof digest.lockedCount === 'number' ? Math.round(digest.lockedCount) : undefined;
  if (locked !== undefined && locked > 0) {
    lines.push(`其中 ${locked} 个组件已锁定，整屏生成会保留它们`);
  }
  return lines.length === 0 ? '' : `\n${lines.join('\n')}\n`;
}

function readCanvasState(value: unknown): AgentCanvasState {
  if (!isRecord(value)) return {};
  return {
    ...(typeof value.backgroundColor === 'string'
      ? { backgroundColor: value.backgroundColor }
      : {}),
    ...(isRecord(value.background) ? { background: value.background } : {}),
    ...(typeof value.hasBackgroundImage === 'boolean'
      ? { hasBackgroundImage: value.hasBackgroundImage }
      : {}),
  };
}

function describeRouteFailure(failure: string): string {
  if (failure === 'AGENT_TIMEOUT')
    return '指令路由超时。可以换更直接的说法，例如"把背景改成 #0f172a"。';
  if (failure === 'AGENT_UNREACHABLE') return '连不上模型服务，暂时只能识别直接的画布/生成指令。';
  if (failure.startsWith('AGENT_HTTP_')) return '模型服务拒绝了路由请求（可能不支持工具调用）。';
  return '没能判断这条指令要做什么，未生成任何变更。';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
