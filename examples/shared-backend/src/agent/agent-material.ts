/**
 * 让智能体起草 L2 模板物料（base-screen-docs ADR-0116 D7 / S6）：组件工坊入口，后端只做「模型 ⇄ 规格」。
 *
 * 解析、体检（SDK 的 `auditBaseScreenMaterialSpec`，含 TPL1–TPL10）与修复回环都在宿主前端
 * （`component-workshop.ts` 的 `draftTemplateMaterialWithAgent`）；这里负责提示词、few-shot、
 * 把前端整理好的体检结论翻成修复提示。结果只进工坊草稿，发布仍由人做，智能体不能发布。
 *
 * 示例后端是 CJS 工程、不依赖仅 ESM 的 plugin-sdk（见 agent-repair.ts），所以图元、函数与限额在
 * 提示词里写成文字；权威仍是 `packages/plugin-sdk/src/material-template*.ts`，那边改了这里要同步。
 */

/** 用户一句话的上限：与 `/agent/act` 的 `text` 同一上限。 */
export const AGENT_MATERIAL_INSTRUCTION_MAX = 300;

const MAX_REPAIR_OUTPUT_CHARS = 64_000;
const MAX_REPAIR_ISSUES = 40;
const REPAIR_RULE = /^[A-Z][A-Z0-9]{0,15}$/;
/** 规格内路径：`template.nodes[2].children[0].fill`、`fields[3].key`，空串表示整份。 */
const REPAIR_PATH = /^[A-Za-z0-9_.[\]]{0,160}$/;

export interface AgentMaterialRepairIssue {
  readonly rule: string;
  readonly path: string;
  readonly message: string;
}

export interface AgentMaterialRepairRequest {
  readonly output: string;
  readonly issues: readonly AgentMaterialRepairIssue[];
}

/** 前端带回来的修复请求：形状不对返回 null（由调用方报 400），不猜。 */
export function readMaterialRepairRequest(input: unknown): AgentMaterialRepairRequest | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const { output, issues } = input as { output?: unknown; issues?: unknown };
  if (typeof output !== 'string' || output.trim() === '' || output.length > MAX_REPAIR_OUTPUT_CHARS)
    return null;
  if (!Array.isArray(issues) || issues.length === 0 || issues.length > MAX_REPAIR_ISSUES)
    return null;
  const read: AgentMaterialRepairIssue[] = [];
  for (const item of issues) {
    if (typeof item !== 'object' || item === null) return null;
    const { rule, path, message } = item as { rule?: unknown; path?: unknown; message?: unknown };
    if (typeof rule !== 'string' || !REPAIR_RULE.test(rule)) return null;
    if (typeof path !== 'string' || !REPAIR_PATH.test(path)) return null;
    if (typeof message !== 'string' || message.trim() === '' || message.length > 400) return null;
    read.push({ rule, path, message: message.trim() });
  }
  return { output, issues: read };
}

export function buildMaterialUserPrompt(instruction: string): string {
  return `用户要的组件：${instruction}\n\n只输出一个 JSON 对象 {"spec": {...}}，不要解释、不要代码围栏。`;
}

/** 修复轮：把体检结论按规格路径逐条列出，要求整份重写（不是补丁）。 */
export function buildMaterialRepairPrompt(
  issues: readonly AgentMaterialRepairIssue[],
  instruction: string,
): string {
  const lines = issues.map(
    (issue) => `- [${issue.rule}] ${issue.path === '' ? '（整份）' : issue.path}：${issue.message}`,
  );
  return [
    '上一份规格没有通过组件体检，问题如下（路径相对 spec 根）：',
    ...lines,
    '',
    `逐条改正后输出完整的 {"spec": {...}}（整份重写，不是补丁），仍然满足用户原话：${instruction}`,
    '没被点到的部分保持不变；不要为了消除错误删掉用户要的功能，确实做不到就用最接近的写法。',
  ].join('\n');
}

/**
 * few-shot：改写自 `tooling/verification/browser-harness/template-materials.ts`（ADR-0116 S5 对照用的
 * 6 种模板物料，均已通过体检）。挑单值仪表、多行折线、枚举状态灯三种，覆盖 arc / ticks / repeat /
 * polyline / pick / 动画 / 事件。那边的写法变了，这里要一起改；`tests/examples/material-draft-agent.test.ts`
 * 用 SDK 体检锁定它们零错误，提示词里的图元与函数清单也对照 SDK 常量。
 */
export const AGENT_MATERIAL_FEW_SHOT_SPECS: readonly unknown[] = [
  {
    type: 'host.online.example-gauge',
    name: '环形仪表',
    category: '指标',
    keywords: ['仪表盘', '环形', '进度'],
    defaultSize: { width: 220, height: 220 },
    numberFormat: { decimals: 0, unit: '%' },
    fields: [
      { key: 'min', label: '最小值', section: 'structure', kind: 'number', default: 0 },
      { key: 'max', label: '最大值', section: 'structure', kind: 'number', default: 100 },
      { key: 'warnAt', label: '告警线', section: 'structure', kind: 'number', default: 80 },
      { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#e2e8f0' },
      {
        key: 'fontSize',
        label: '字号',
        section: 'text',
        kind: 'number',
        default: 36,
        min: 12,
        max: 72,
        unit: 'px',
      },
      {
        key: 'backgroundColor',
        label: '背景色',
        section: 'surface',
        kind: 'color',
        default: '#0b1220',
      },
      { key: 'trackColor', label: '轨道色', section: 'surface', kind: 'color', default: '#1e293b' },
      { key: 'fillColor', label: '主色', section: 'semantic', kind: 'color', default: '#22d3ee' },
      {
        key: 'warningColor',
        label: '告警色',
        section: 'semantic',
        kind: 'color',
        default: '#f87171',
      },
    ],
    statePresetKeys: ['fillColor'],
    data: { kind: 'scalar', valueType: 'number', sample: 72 },
    events: [
      {
        name: 'valueClick',
        label: '点击读数',
        payload: { value: { type: 'number', value: 'value' } },
      },
    ],
    template: {
      viewBox: [0, 0, 220, 220],
      nodes: [
        {
          kind: 'rect',
          id: 'bg',
          x: 0,
          y: 0,
          width: 220,
          height: 220,
          fill: 'style.backgroundColor',
        },
        {
          kind: 'ticks',
          id: 'scale',
          cx: 110,
          cy: 116,
          r: 70,
          length: 7,
          count: 11,
          start: -135,
          end: 135,
          stroke: 'style.trackColor',
          strokeWidth: 2,
        },
        {
          kind: 'arc',
          id: 'track',
          cx: 110,
          cy: 116,
          r: 88,
          thickness: 14,
          start: -135,
          end: 135,
          stroke: 'style.trackColor',
        },
        {
          kind: 'arc',
          id: 'fill',
          cx: 110,
          cy: 116,
          r: 88,
          thickness: 14,
          start: -135,
          end: '-135 + pct(value, props.min, props.max) * 270',
          stroke: 'value >= props.warnAt ? style.warningColor : style.fillColor',
          on: 'valueClick',
        },
        {
          kind: 'text',
          id: 'reading',
          x: 110,
          y: 116,
          fontSize: 'style.fontSize',
          fontWeight: 700,
          anchor: 'middle',
          baseline: 'middle',
          content: 'format(value)',
          fill: 'style.color',
          backdrop: 'bg',
        },
      ],
      animations: [{ kind: 'change', target: 'fill', attributes: ['end'], duration: 700 }],
    },
  },
  {
    type: 'host.online.example-line',
    name: '迷你折线',
    category: '图表',
    keywords: ['折线', '趋势'],
    defaultSize: { width: 420, height: 220 },
    fields: [
      {
        key: 'showPoints',
        label: '显示数据点',
        section: 'structure',
        kind: 'boolean',
        default: true,
      },
      { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#94a3b8' },
      {
        key: 'fontSize',
        label: '字号',
        section: 'text',
        kind: 'number',
        default: 16,
        min: 12,
        max: 32,
        unit: 'px',
      },
      {
        key: 'backgroundColor',
        label: '背景色',
        section: 'surface',
        kind: 'color',
        default: '#0b1220',
      },
      { key: 'gridColor', label: '网格色', section: 'surface', kind: 'color', default: '#1e293b' },
      {
        key: 'strokeColor',
        label: '线条色',
        section: 'surface',
        kind: 'color',
        default: '#38bdf8',
      },
    ],
    data: {
      kind: 'rows',
      roles: [
        { id: 'category', label: '类目', valueType: 'string' },
        { id: 'amount', label: '数值', valueType: 'number' },
      ],
      sample: [
        { category: '1月', amount: 120 },
        { category: '2月', amount: 168 },
        { category: '3月', amount: 142 },
        { category: '4月', amount: 205 },
      ],
    },
    events: [
      {
        name: 'pointClick',
        label: '点击数据点',
        payload: { category: { type: 'string', value: 'row.category' } },
      },
    ],
    template: {
      viewBox: [0, 0, 420, 220],
      nodes: [
        {
          kind: 'rect',
          id: 'bg',
          x: 0,
          y: 0,
          width: 420,
          height: 220,
          fill: 'style.backgroundColor',
        },
        {
          kind: 'repeat',
          id: 'grid',
          source: { range: 4 },
          children: [
            {
              kind: 'line',
              id: 'grid-line',
              x1: 40,
              y1: '24 + index * 50',
              x2: 404,
              y2: '24 + index * 50',
              stroke: 'style.gridColor',
              strokeWidth: 1,
            },
          ],
        },
        {
          kind: 'polyline',
          id: 'line',
          points: {
            source: 'rows',
            x: '48 + index * 348 / max(count - 1, 1)',
            y: "174 - scale(row.amount, minOf(rows, 'amount'), maxOf(rows, 'amount'), 0, 140)",
          },
          stroke: 'style.strokeColor',
          strokeWidth: 3,
          strokeLinecap: 'round',
        },
        {
          kind: 'when',
          id: 'points-on',
          test: 'props.showPoints',
          children: [
            {
              kind: 'repeat',
              id: 'points',
              source: 'rows',
              children: [
                {
                  kind: 'circle',
                  id: 'point',
                  r: 5,
                  cx: '48 + index * 348 / max(count - 1, 1)',
                  cy: "174 - scale(row.amount, minOf(rows, 'amount'), maxOf(rows, 'amount'), 0, 140)",
                  fill: 'style.backgroundColor',
                  stroke: 'style.strokeColor',
                  strokeWidth: 3,
                  on: 'pointClick',
                },
              ],
            },
          ],
        },
        {
          kind: 'repeat',
          id: 'labels',
          source: 'rows',
          children: [
            {
              kind: 'text',
              id: 'label',
              x: '48 + index * 348 / max(count - 1, 1)',
              y: 204,
              fontSize: 'style.fontSize',
              anchor: 'middle',
              baseline: 'middle',
              content: 'row.category',
              fill: 'style.color',
              backdrop: 'bg',
            },
          ],
        },
      ],
    },
  },
  {
    type: 'host.online.example-lamp',
    name: '状态灯',
    category: '状态',
    keywords: ['状态', '指示灯', '告警'],
    defaultSize: { width: 96, height: 96 },
    rotate: false,
    fields: [
      {
        key: 'offlineColor',
        label: '离线色',
        section: 'semantic',
        kind: 'color',
        default: '#64748b',
      },
      {
        key: 'runningColor',
        label: '正常色',
        section: 'semantic',
        kind: 'color',
        default: '#22c55e',
      },
      {
        key: 'warningColor',
        label: '预警色',
        section: 'semantic',
        kind: 'color',
        default: '#f59e0b',
      },
      {
        key: 'criticalColor',
        label: '告警色',
        section: 'semantic',
        kind: 'color',
        default: '#ef4444',
      },
    ],
    data: { kind: 'scalar', valueType: 'string', sample: 'alarm' },
    template: {
      viewBox: [0, 0, 96, 96],
      nodes: [
        {
          kind: 'circle',
          id: 'halo',
          cx: 48,
          cy: 48,
          r: 40,
          opacity: 0.28,
          fill: "pick(value, 'normal', style.runningColor, 'warning', style.warningColor, 'alarm', style.criticalColor, style.offlineColor)",
        },
        {
          kind: 'circle',
          id: 'core',
          cx: 48,
          cy: 48,
          r: 24,
          fill: "pick(value, 'normal', style.runningColor, 'warning', style.warningColor, 'alarm', style.criticalColor, style.offlineColor)",
          stroke: 'rgba(255,255,255,0.35)',
          strokeWidth: 2,
        },
      ],
      animations: [
        {
          kind: 'loop',
          target: 'halo',
          property: 'scale',
          from: 0.8,
          to: 1.15,
          duration: 900,
          easing: 'ease-in-out',
          alternate: true,
          enabledBy: "value == 'alarm'",
        },
      ],
    },
  },
];

const FEW_SHOT = AGENT_MATERIAL_FEW_SHOT_SPECS.map(
  (spec, index) => `示例 ${index + 1}：\n${JSON.stringify({ spec })}`,
).join('\n\n');

/**
 * 系统提示词：规格形状、组件范式（ADR-0099 / ADR-0102）、模板图元与表达式（ADR-0116 §2.2–§2.6）、限额。
 * 规则写成「要 / 不要」的短句，模型照着写；体检兜底，违反了由修复轮指回具体路径。
 */
export const AGENT_MATERIAL_SYSTEM_PROMPT = `你是大屏设计器的组件作者。根据用户的一句话，写一个「L2 模板物料」的规格：用受限的 SVG 图元模板描述外观，不写任何代码。
只输出一个 JSON 对象 {"spec": {...}}。

## spec 的字段
- type：照抄 "host.online.draft"（宿主会换成真实类型）。
- name：组件名（中文，≤ 16 字）；category：分类（如 指标 / 图表 / 状态 / 装饰）；keywords：2–5 个关键词数组。
- defaultSize：{ width, height } 默认像素尺寸，通常在 600×300 以内。
- rotate：可省略；不该旋转的（指示灯、读数）写 false。
- numberFormat（可选，单值数字读数才用）：{ decimals, unit?: true | "%", prefix?, thousandsSeparator?: true }。开启后模板里用 format(value) 显示读数。小数位、前缀、单位、千分位只在这里声明，fields 里不要再写 decimals / prefix / unit / thousandsSeparator 字段。
- fields：可调项数组（≤ 24），每项 { key, label, section, kind, default, min?, max?, step?, unit?, options?, visibleWhen? }。
  - key 小驼峰 ASCII；label 中文 ≤ 8 字，单位写进 unit 不写进 label；颜色字段的 label 以「色」结尾（如「描边色」）。
  - section 决定落点：format（读数格式开关）/ structure（结构，进 props）/ text（文字，进 style）/ surface（填充与描边，进 style）/ semantic（语义色，进 style）/ motion（动效开关，进 props）。
  - kind：number / text / boolean / color / choice（choice 要 options，2–12 个）。颜色只能放 text / surface / semantic。
  - 样式键优先复用：color、fontSize、backgroundColor、fillColor、trackColor、strokeColor、strokeWidth、borderColor、accentColor、gridColor、labelColor、valueColor、waterColor、waveColor、runningColor、warningColor、criticalColor、offlineColor、positiveColor、negativeColor。
  - 不要描述性文案字段（title / subtitle / caption / description / label 之类）：组件只呈现读数，标题由别的文本组件组合。
  - 不要空态 / 加载态 / 错误态文案字段（emptyText 等），不要以 Column / Field 结尾的键（列由数据角色绑定）。
- data：只有三种形状，选一种：
  - { "kind": "none" }：纯装饰；
  - { "kind": "scalar", "valueType": "number" | "string", "sample": 示例值 }：一个读数；
  - { "kind": "rows", "roles": [{ "id", "label", "valueType": "number" | "string", "optional"? }], "sample": [示例行…] }：一张表，≤ 6 个角色，示例行的键是角色 id，给 3–8 行。
- events（可选，≤ 4）：[{ "name": 小驼峰, "label": 中文, "payload"?: { 键: { "type": "number" | "string" | "boolean", "value": 表达式 } } }]；模板节点写 "on": 事件名 表示点它触发。
- statePresetKeys（可选）：状态外观会改写的颜色字段 key（必须是 text / surface / semantic 里声明的颜色字段）。
- template：见下。不要写 render、code、script 之类的字段。

## template
{ "viewBox": [0, 0, 宽, 高], "fit"?: "contain" | "cover" | "stretch", "defs"?: [渐变…], "nodes": [节点…], "animations"?: [动画…] }
- viewBox 与 defaultSize 同比例最省事；有文字时不要用 stretch（文字会被拉伸）。
- 每个节点都要 "kind" 与全模板唯一的 "id"（小写字母开头，字母数字与连字符）。节点总数 ≤ 300。
- 结构节点：
  - g：{ children, x?, y?, scale?, rotate?, opacity? }；
  - repeat：{ source: "rows" 或 { "range": 次数(≤200) }, children }，里面可用 index、count；遍历 rows 时可用 row.<角色id>；
  - when：{ test: 表达式, children }；
  - clip：{ shape: 一个 rect / circle / ellipse / path 节点, children }，用形状裁剪子树。
- 图形节点（都可带 fill、stroke、strokeWidth、strokeDasharray(数组)、strokeLinecap、opacity、on）：
  - rect { x, y, width, height, rx? }；circle { cx, cy, r }；ellipse { cx, cy, rx, ry }；line { x1, y1, x2, y2 }；
  - polyline { points: { source: "rows" 或 { "range": n }, x: 表达式, y: 表达式 }, closed? }；
  - path { d: [["M", x, y], ["L", x, y], ["H", x], ["V", y], ["C", …6 个], ["Q", …4 个], ["A", …7 个], ["Z"]] }，每个数可以是表达式，≤ 64 段；
  - arc { cx, cy, r, thickness, start, end, linecap? }：圆弧，角度单位是度，0 在正上方、顺时针；颜色写在 stroke；
  - ticks { cx, cy, r, length, count, start, end }：一圈刻度；颜色写在 stroke；
  - wave { x, y, width, height, amplitude, wavelength, phase? }：波浪填充（水位、液面）。
  - text { x, y, fontSize, content, fontWeight?: 400|500|600|700, anchor?: start|middle|end, baseline?: auto|middle|hanging, fill, backdrop }。
- 文字规则：fontSize 写屏幕像素，每一段文字（含副标注、刻度值）换算后都要 ≥ 16——不要写 style.fontSize * 0.4 这种缩小系数，副文字另声明一个 labelFontSize 字段（min ≥ 16）；fontSize 只能是数字或 props / style 数字字段的四则运算；必须写 backdrop：文字底下那个填充节点的 id，或 "container"。文字与底板颜色要有足够对比度。
- 颜色规则：fill / stroke / 色标只能是字面量颜色（#rrggbb、rgba(...)、none）、style.<颜色字段>、{ "gradient": "渐变 id" }，或用 pick(...) / 三元表达式在它们之间选；不能由数据算出颜色字符串，不能写 url(...)。
- 渐变写在 defs：{ "kind": "linearGradient", "id", "x1"?, "y1"?, "x2"?, "y2"?, "stops": [{ "offset": 0–1, "color": 颜色, "opacity"? }…] }，radialGradient 用 cx / cy / r。
- 动画（≤ 8，只在预览与运行时播放）：
  - { "kind": "loop", "target": 节点 id, "property": translateX | translateY | rotate | scale | opacity, "from", "to", "duration": 100–20000, "easing"?, "alternate"?, "enabledBy"?: 表达式 }；duration 必须是数字字面量，不能引用字段；
  - { "kind": "change", "target": 节点 id, "attributes": [该节点的数值参数…], "duration" }：读数变化时补间。
- 不存在的东西：foreignObject、image、use、style、filter、script、href、任何 on 开头的属性。

## 表达式（字符串）
- 数值属性、content、test、动画参数都可以写成表达式字符串；字面量数字直接写数字。
- 引用的根由字段所在分区决定：structure / format / motion 的字段写 props.<键>，text / surface / semantic 的字段写 style.<键>，写错根同样算未声明。用到的每个字段都要先在 fields 里声明。
- row.<角色id> 只能写在 source 为 "rows" 的 repeat（或 polyline 的 points）里面；要单独强调某一行（如最后一个点），在 repeat 里用 when 判断 index == count - 1，或用 maxOf / minOf 取值。
- 能引用的只有：value（单值读数）、rows（全部行，只能交给聚合函数）、row.<角色id> / index / count（repeat 里）、props.<structure/format/motion 字段>、style.<text/surface/semantic 字段>、size.width / size.height。引用未声明的字段或角色会报错。
- 运算：+ - * / %、比较、&& || !、三元 a ? b : c。+ 只做数值加法，拼字符串用 concat(...)。字符串字面量用单引号。
- 函数：min max clamp(v, lo, hi) abs round(v, 位数?) floor ceil sqrt sin cos、scale(v, d0, d1, r0, r1) 线性映射、pct(v, lo?, hi?) 归一到 0–1、format(v) 按读数格式格式化、fixed(v, 位数)、concat(...)、len(s)、charAt(s, i)、pick(key, k1, v1, k2, v2, …, 缺省)、maxOf(rows, '角色') minOf(rows, '角色') sumOf(rows, '角色')。没有循环、变量、自定义函数。
- 单个表达式 ≤ 400 字符。

## 写法建议
- 先画底板（rect 或 circle，填 style.backgroundColor），文字的 backdrop 指向它。
- 读数用 text + format(value)；百分比、进度用 pct(...) 换算后乘长度或角度。
- 多行数据用 repeat 或 polyline 的 points，坐标用 index 与 scale(...) 算，留出边距。
- 横排重复（逐位数字、一排灯）时按最多会出现的个数排版：单元宽 × 个数 + 间距不能超过 viewBox 宽，必要时把 defaultSize 与 viewBox 一起放宽；按示例数据画出来的所有节点都要在 viewBox 里。
- 告警变色写成 pick(...) 或三元，在 semantic 分区声明对应颜色字段。

## 示例（照这个形状写，不要照抄内容）
${FEW_SHOT}`;
