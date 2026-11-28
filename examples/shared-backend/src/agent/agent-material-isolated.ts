/**
 * 让智能体起草 L3 隔离代码物料（base-screen-docs ADR-0117 D12）：组件工坊「代码组件（隔离）」的
 * 「让智能体起草」入口，与 L2 的入口并列；后端只做「模型 ⇄ 规格+代码」。
 *
 * 解析、体检（SDK 的 `auditBaseScreenMaterialSpec`）、代码词法检查（`scanIsolatedSource`，只警告）、
 * 沙箱试运行（`trialRunIsolatedMaterial`）与修复回环都在宿主前端（`component-workshop.ts` 的
 * `draftIsolatedMaterialWithAgent`）；这里负责提示词、few-shot，把前端整理好的体检 + 试运行结论
 * 翻成修复提示。结果只进工坊草稿，发布仍由人工做；智能体不能走到发布这一步。
 *
 * 示例后端是 CJS 工程、不依赖仅 ESM 的 plugin-sdk（见 `agent-repair.ts`），所以图元、函数与限额在
 * 提示词里写成文字；权威仍是 `packages/plugin-sdk/src/material-isolated*.ts`，那边改了这里要同步。
 */

/** 用户一句话的上限：与 `/agent/act` 的 `text` 同一上限。 */
export const AGENT_MATERIAL_ISOLATED_INSTRUCTION_MAX = 300;

const MAX_REPAIR_OUTPUT_CHARS = 64_000;
const MAX_REPAIR_ISSUES = 40;
const REPAIR_RULE = /^[A-Z][A-Z0-9]{0,15}$/;
/** 规格/代码内路径：`fields[3].key`、代码级问题用空字符串表示整份。 */
const REPAIR_PATH = /^[A-Za-z0-9_.[\]]{0,160}$/;

export interface AgentMaterialIsolatedRepairIssue {
  readonly rule: string;
  readonly path: string;
  readonly message: string;
}

export interface AgentMaterialIsolatedRepairRequest {
  readonly output: string;
  readonly issues: readonly AgentMaterialIsolatedRepairIssue[];
}

/** 前端带回来的修复请求：形状不对返回 null（由调用方报 400），不猜。 */
export function readIsolatedMaterialRepairRequest(
  input: unknown,
): AgentMaterialIsolatedRepairRequest | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const { output, issues } = input as { output?: unknown; issues?: unknown };
  if (typeof output !== 'string' || output.trim() === '' || output.length > MAX_REPAIR_OUTPUT_CHARS)
    return null;
  if (!Array.isArray(issues) || issues.length === 0 || issues.length > MAX_REPAIR_ISSUES)
    return null;
  const read: AgentMaterialIsolatedRepairIssue[] = [];
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

export function buildIsolatedMaterialUserPrompt(instruction: string): string {
  return `用户要的组件：${instruction}\n\n只输出一个 JSON 对象 {"spec": {...}, "source": "..."}，不要解释、不要代码围栏。`;
}

/** 修复轮：把体检 + 沙箱试运行的结论按路径逐条列出，要求整份重写（不是补丁）。 */
export function buildIsolatedMaterialRepairPrompt(
  issues: readonly AgentMaterialIsolatedRepairIssue[],
  instruction: string,
): string {
  const lines = issues.map(
    (issue) =>
      `- [${issue.rule}] ${issue.path === '' ? '（整份 / 代码）' : issue.path}：${issue.message}`,
  );
  return [
    '上一份规格 + 代码没有通过体检或沙箱试运行，问题如下：',
    ...lines,
    '',
    `逐条改正后输出完整的 {"spec": {...}, "source": "..."}（整份重写，不是补丁），仍然满足用户原话：${instruction}`,
    '没被点到的部分保持不变；不要为了消除错误删掉用户要的功能，确实做不到就用最接近的写法。',
  ].join('\n');
}

/**
 * few-shot：两个过体检与沙箱试运行的示例（改写自组件工坊内置的「动画仪表」「ECharts 柱状图」模板，
 * 见 `examples/vanilla-host/src/screen/component-library.ts` 的 `ISO_CANVAS_SOURCE` /
 * `ISO_ECHARTS_SOURCE`；两边的写法改了要一起改）。一个纯 canvas 逐帧动画，一个用宿主预置库 echarts。
 */
const FEW_SHOT_CANVAS_SOURCE = `export function create(env) {
  const canvas = env.canvas;
  const context = canvas.getContext('2d');
  let s = env;
  let shown = typeof env.value === 'number' ? env.value : 0;
  return {
    update(next) {
      s = next;
    },
    frame(now) {
      const target = typeof s.value === 'number' ? s.value : 0;
      shown += (target - shown) * 0.12;
      const { width, height } = canvas;
      const k = s.dpr;
      const radius = Math.min(width, height) / 2 - 16 * k;
      const cx = width / 2;
      const cy = height / 2;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = s.style.backgroundColor;
      context.fillRect(0, 0, width, height);
      context.lineCap = 'round';
      context.lineWidth = 14 * k;
      context.strokeStyle = s.style.trackColor;
      context.beginPath();
      context.arc(cx, cy, radius, 0.75 * Math.PI, 2.25 * Math.PI);
      context.stroke();
      const span = s.props.max - s.props.min || 1;
      const ratio = Math.max(0, Math.min(1, (shown - s.props.min) / span));
      context.strokeStyle = shown >= s.props.warnAt ? s.style.warningColor : s.style.fillColor;
      context.beginPath();
      context.arc(cx, cy, radius, 0.75 * Math.PI, (0.75 + 1.5 * ratio) * Math.PI);
      context.stroke();
      context.fillStyle = s.style.color;
      context.font = \`700 \${Math.round(s.style.fontSize * k)}px system-ui, sans-serif\`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(env.formatNumber(Math.round(shown)), cx, cy);
      return true;
    },
    click() {
      env.emit('valueClick', { value: s.value });
    },
  };
}`;

const FEW_SHOT_ECHARTS_SOURCE = `export function create(env) {
  const echarts = env.libraries.echarts;
  const container = env.createContainer();
  let s = env;
  const chart = echarts.init(container, null, {
    renderer: 'canvas',
    width: s.size.width,
    height: s.size.height,
    devicePixelRatio: s.dpr,
  });
  let dirty = true;
  chart.getZr().on('rendered', () => {
    dirty = true;
  });
  const option = () => ({
    animation: s.mode !== 'design',
    backgroundColor: s.style.backgroundColor,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: s.rows.map((row) => row.name),
      axisLabel: { color: s.style.color, fontSize: s.style.fontSize },
      axisLine: { lineStyle: { color: s.style.trackColor } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: s.style.color, fontSize: s.style.fontSize, formatter: (v) => env.formatNumber(v) },
      splitLine: { lineStyle: { color: s.style.trackColor } },
    },
    series: [
      {
        type: 'bar',
        data: s.rows.map((row) => row.value),
        itemStyle: { color: s.style.fillColor, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
    ],
  });
  chart.setOption(option());
  return {
    update(next) {
      const resized =
        next.size.width !== s.size.width || next.size.height !== s.size.height || next.dpr !== s.dpr;
      s = next;
      if (resized) chart.resize({ width: s.size.width, height: s.size.height, devicePixelRatio: s.dpr });
      chart.setOption(option(), true);
    },
    frame() {
      const painted = dirty;
      dirty = false;
      return painted;
    },
    surface() {
      return container.querySelector('canvas');
    },
    click(x, y) {
      const point = chart.convertFromPixel({ seriesIndex: 0 }, [x, y]);
      const index = Math.round(Array.isArray(point) ? point[0] : Number.NaN);
      const row = s.rows[index];
      if (row !== undefined) env.emit('barClick', { name: String(row.name), value: Number(row.value) });
    },
    dispose() {
      chart.dispose();
    },
  };
}`;

/** few-shot 的规格部分：字段写法与 L2 的 `AGENT_MATERIAL_FEW_SHOT_SPECS` 一致，只是换成 `isolated`。 */
export const AGENT_MATERIAL_ISOLATED_FEW_SHOT_SPECS: readonly unknown[] = [
  {
    type: 'host.online.example-iso-gauge',
    name: '动画仪表',
    category: '指标',
    keywords: ['仪表盘', '环形', '动画', '隔离'],
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
        default: '#f97316',
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
    isolated: { libraries: [] },
  },
  {
    type: 'host.online.example-iso-bar',
    name: '柱状图',
    category: '图表',
    keywords: ['柱状图', '图表', 'echarts', '隔离'],
    defaultSize: { width: 360, height: 220 },
    numberFormat: { decimals: 0, thousandsSeparator: true },
    fields: [
      { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#94a3b8' },
      {
        key: 'fontSize',
        label: '字号',
        section: 'text',
        kind: 'number',
        default: 12,
        min: 10,
        max: 24,
        unit: 'px',
      },
      {
        key: 'backgroundColor',
        label: '背景色',
        section: 'surface',
        kind: 'color',
        default: '#0b1220',
      },
      { key: 'trackColor', label: '网格色', section: 'surface', kind: 'color', default: '#1e293b' },
      { key: 'fillColor', label: '柱色', section: 'surface', kind: 'color', default: '#38bdf8' },
    ],
    data: {
      kind: 'rows',
      roles: [
        { id: 'name', label: '名称', valueType: 'string' },
        { id: 'value', label: '数值', valueType: 'number' },
      ],
      sample: [
        { name: '华东', value: 4820 },
        { name: '华南', value: 3960 },
        { name: '华北', value: 3410 },
      ],
    },
    events: [
      {
        name: 'barClick',
        label: '点击柱子',
        payload: {
          name: { type: 'string', value: 'name' },
          value: { type: 'number', value: 'value' },
        },
      },
    ],
    isolated: { libraries: ['echarts'] },
  },
];

const FEW_SHOT = [
  `示例 1（纯 canvas，不用预置库）：\n${JSON.stringify({ spec: AGENT_MATERIAL_ISOLATED_FEW_SHOT_SPECS[0], source: FEW_SHOT_CANVAS_SOURCE })}`,
  `示例 2（用宿主预置库 echarts）：\n${JSON.stringify({ spec: AGENT_MATERIAL_ISOLATED_FEW_SHOT_SPECS[1], source: FEW_SHOT_ECHARTS_SOURCE })}`,
].join('\n\n');

/**
 * 系统提示词：先判断能不能用不含代码的 L2 模板表达（ADR-0117 D12），能就在顶层加
 * `suggestTemplate: true` 提示用户改用模板物料（更快、不用沙箱），但仍然给出一份可用的 L3 方案，
 * 不能因为「建议改用模板」就不交作业。
 */
export const AGENT_MATERIAL_ISOLATED_SYSTEM_PROMPT = `你是大屏设计器的组件作者，写的是「代码组件（隔离代码）」：组件代码只在沙箱 iframe 里运行，不能联网、不能碰页面。
只输出一个 JSON 对象 {"spec": {...}, "source": "..."}，不要解释、不要代码围栏。

## 先判断一下
如果用户要的东西只是几何图形随数据变化、简单的颜色/角度/长度映射，不需要逐帧动画、不需要第三方图表库，这类东西「受限图元模板（L2）」就能做，不需要代码。这种情况下在顶层加 "suggestTemplate": true 和一句 "suggestReason"，但仍然按下面的要求交一份可用的代码方案——建议是给用户看的，不是让你偷懒。

## spec 的字段
- type：照抄 "host.online.draft"（宿主会换成真实类型）。
- name：组件名（中文，≤ 16 字）；category：分类（如 指标 / 图表 / 状态 / 装饰）；keywords：2～5 个关键词数组。
- defaultSize：{ width, height } 默认像素尺寸，通常在 600×300 以内。
- rotate：可省略；不该旋转的（指示灯、读数）写 false。
- numberFormat（可选，单值数字读数才用）：{ decimals, unit?: true | "%", prefix?, thousandsSeparator?: true }。
- fields：可调项数组（≤ 24），每项 { key, label, section, kind, default, min?, max?, step?, unit?, options?, visibleWhen? }。
  - key 小驼峰 ASCII；label 中文 ≤ 8 字，单位写进 unit 不写进 label；颜色字段的 label 以「色」结尾（如「描边色」）。
  - section 决定落点：format（读数格式开关）/ structure（结构，进 props）/ text（文字，进 style）/ surface（填充与描边，进 style）/ semantic（语义色，进 style）/ motion（动效开关，进 props）。
  - kind：number / text / boolean / color / choice（choice 要 options，2～12 个）。颜色只能放 text / surface / semantic。
  - 样式键优先复用：color、fontSize、backgroundColor、fillColor、trackColor、strokeColor、strokeWidth、warningColor、criticalColor、offlineColor、positiveColor、negativeColor。
- data：只有三种形状，选一种：
  - { "kind": "none" }：纯装饰；
  - { "kind": "scalar", "valueType": "number" | "string", "sample": 示例值 }：一个读数；
  - { "kind": "rows", "roles": [{ "id", "label", "valueType": "number" | "string", "optional"? }], "sample": [示例行…] }：一张表，≤ 6 个角色，给 3～8 行。
- events（可选，≤ 4）：[{ "name": 小驼峰, "label": 中文, "payload"?: { 键: { "type": "number" | "string" | "boolean", "value": 表达式 } } }]。
- statePresetKeys（可选）：状态外观会改写的颜色字段 key。
- isolated：{ "libraries": [库名…] }，库名只能是下面「宿主预置库」里列出的；不需要库就写空数组。

## source：组件代码全文
导出一个工厂：
\`\`\`js
export function create(env) {
  // env: canvas, size, dpr, props, style, mode, value, rows, formatNumber(v), emit(name, payload),
  //      libraries, createContainer()
  return {
    update(next) {},        // props / style / size / dpr / mode / value / rows 变化时调用
    frame(now) { return true; }, // 画了就返回 true；没变化返回 false（省流）
    click(x, y) {},         // 可选：预览 / 查看时被点击（组件坐标）
    dispose() {},           // 可选：组件移除时清理
    surface() {},           // 可选：要交给页面显示的画布/元素，默认是 env.canvas
  };
}
\`\`\`
- env.canvas 是 OffscreenCanvas，像素尺寸 = size × dpr；画字号、线宽时记得乘 dpr。
- env.mode === 'design' 时画面要静止（不要用 now 推进动画）；env.mode 是 'preview' 或 'viewer' 时才播动画。
- 要用 DOM 型库（如 echarts）时用 env.createContainer() 拿一个沙箱里的离屏容器，库自己管理内部渲染。
- 绝对不能出现：fetch / XMLHttpRequest / WebSocket / sendBeacon；eval / Function(...)；动态 import()；
  localStorage / sessionStorage / indexedDB / document.cookie；window.postMessage / window.parent；
  任何凭证或长编码字符串。这些在沙箱里会被拦下，且会被静态检查标记。
- 想触发事件只能用 env.emit(name, payload)，name 必须在 spec.events 里声明过。

## 宿主预置库
- echarts：env.libraries.echarts，ECharts 6，canvas 渲染器。暂时只有这一个。

## 格式与写法建议
- 读数用 env.formatNumber(value) 格式化，不要自己拼小数位/千分位。
- 多行数据遍历 env.rows，坐标按索引均匀分布，留出边距。
- 字号、线宽等尺寸相关的量都乘 env.dpr；颜色从 env.style 里取，不要写死十六进制（除非是半透明描边这类装饰色）。
- 横排重复元素（逐位数字、一排灯）时数量 × 单元宽 + 间距不要超过 env.size.width。

## 示例（照这个形状写，不要照抄内容）
${FEW_SHOT}`;
