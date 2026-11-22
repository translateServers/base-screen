import {
  type BaseScreenAuthoringFinding,
  sortBaseScreenAuthoringFindings,
} from './authoring-finding.js';
import { auditBaseScreenMaterialEditorForm } from './material-editor-audit.js';
import {
  type BaseScreenMaterialSpec,
  type BaseScreenMaterialSpecField,
  BASE_SCREEN_MATERIAL_SPEC_SECTIONS,
  compileBaseScreenMaterialSpec,
  parseBaseScreenMaterialSpec,
} from './material-spec.js';
import {
  BASE_SCREEN_DESCRIPTIVE_TEXT_KEYS,
  BASE_SCREEN_REGISTERED_STYLE_KEYS,
  BASE_SCREEN_STYLE_KEY_DICTIONARY,
} from './material-style-keys.js';

export interface AuditBaseScreenMaterialSpecOptions {
  /** 渲染函数源码：给出时一并做静态检查（`RENDER`）。 */
  readonly renderSource?: string;
}

/** 体检编译时用的占位标签：只为让 Manifest 解析通过，不注册。 */
const AUDIT_TAG_NAME = 'base-screen-spec-audit';
const DESCRIPTIVE_KEYS: ReadonlySet<string> = new Set([...BASE_SCREEN_DESCRIPTIVE_TEXT_KEYS, 'label']);
const DESCRIPTIVE_LABEL = /标题|副标题|说明|描述|备注|注释/;
const STATE_TEXT_KEY = /^(?:empty|loading|error)(?:Text|Label|Message)$/;
const LARGE_WIDTH = 1920;
const LARGE_HEIGHT = 1080;

/**
 * 原子组件体检（base-screen-docs ADR-0105 §2.5）：把 ADR-0099 / ADR-0102 的门禁搬到运行时，
 * 在线作者发布前就能看到与仓库物料同一口径的结论。
 *
 * - `SPEC`：规格形状错误（来自 `parseBaseScreenMaterialSpec`，含保留键 R6、配置组键 R14）；
 * - `T4`：描述性文案键或标签（标题 / 说明 …）→ 用 `base.text` 组合；
 * - `R4`：词典外样式键 → 警告，优先复用词典键；
 * - `R7`：以 Column / Field 结尾的键 → 用数据角色；
 * - `R8`：空态 / 加载态文案键 → 由 SDK 状态视图提供；
 * - `P2`：颜色落在 props 分区（读数格式 / 结构 / 动效）→ 颜色是视觉量，放 style 分区（ADR-0099 §2.2）；
 * - 编译后 Manifest 的表单审计（R9 警告，R11–R15 错误）；
 * - `D1`：多行组件没有示例行（预览与新插入组件只能显示空态）；
 * - `S1`：默认尺寸超过一整屏；
 * - `RENDER`：渲染代码自行取数、读写浏览器存储、改宿主元素、用 innerHTML 拼数据、开定时器。
 */
export function auditBaseScreenMaterialSpec(
  input: unknown,
  options: AuditBaseScreenMaterialSpecOptions = {},
): readonly BaseScreenAuthoringFinding[] {
  const parsed = parseBaseScreenMaterialSpec(input);
  if (!parsed.ok) {
    return parsed.diagnostics.map((item) => ({
      rule: 'SPEC',
      severity: 'error',
      message: item.message,
      path: item.path,
    }));
  }
  const spec = parsed.value;
  const findings: BaseScreenAuthoringFinding[] = [];
  spec.fields.forEach((field, index) => auditField(field, index, findings));
  const compiled = compileBaseScreenMaterialSpec(spec, { tagName: AUDIT_TAG_NAME });
  if (!compiled.ok) {
    for (const item of compiled.diagnostics) {
      findings.push({ rule: 'SPEC', severity: 'error', message: item.message, path: item.path });
    }
  } else {
    for (const violation of auditBaseScreenMaterialEditorForm(compiled.value)) {
      findings.push({
        rule: violation.rule,
        severity: violation.rule === 'R9' ? 'warning' : 'error',
        message: violation.message,
        ...(violation.field === undefined ? {} : { path: fieldPath(spec, violation.field) }),
      });
    }
  }
  if (spec.data.kind === 'rows' && spec.data.sample.length === 0) {
    findings.push({
      rule: 'D1',
      severity: 'warning',
      message: '多行组件没有示例行：预览与新插入的组件只能显示空态。',
      path: ['data', 'sample'],
    });
  }
  if (spec.defaultSize.width > LARGE_WIDTH || spec.defaultSize.height > LARGE_HEIGHT) {
    findings.push({
      rule: 'S1',
      severity: 'warning',
      message: '默认尺寸超过一整屏：组件是设计稿上的一块，通常在 600×300 以内。',
      path: ['defaultSize'],
    });
  }
  if (options.renderSource !== undefined) auditRenderSource(options.renderSource, spec, findings);
  return sortBaseScreenAuthoringFindings(findings);
}

function auditField(
  field: BaseScreenMaterialSpecField,
  index: number,
  findings: BaseScreenAuthoringFinding[],
): void {
  const path = ['fields', index];
  if (DESCRIPTIVE_KEYS.has(field.key) || DESCRIPTIVE_LABEL.test(field.label)) {
    findings.push({
      rule: 'T4',
      severity: 'error',
      message: `「${field.label}」是描述性文案：组件只呈现读数，标题与说明用相邻的文本组件组合。`,
      path,
    });
  }
  if (/(?:Column|Field)$/.test(field.key)) {
    findings.push({
      rule: 'R7',
      severity: 'error',
      message: `${field.key} 像是在手填列名：改成多行数据的一个角色，由数据面板绑定列。`,
      path: [...path, 'key'],
    });
  }
  if (STATE_TEXT_KEY.test(field.key)) {
    findings.push({
      rule: 'R8',
      severity: 'error',
      message: `${field.key} 是状态文案：空态 / 加载态 / 错误态由 SDK 状态视图统一提供。`,
      path: [...path, 'key'],
    });
  }
  const target = BASE_SCREEN_MATERIAL_SPEC_SECTIONS.find((item) => item.id === field.section)?.target;
  if (field.kind === 'color' && target === 'props') {
    findings.push({
      rule: 'P2',
      severity: 'error',
      message: `颜色「${field.label}」是视觉量，放进文字 / 填充与描边 / 语义色分区，告警与主题才能改变它。`,
      path: [...path, 'section'],
    });
  }
  if (
    target === 'style' &&
    !BASE_SCREEN_STYLE_KEY_DICTIONARY.has(field.key) &&
    !BASE_SCREEN_REGISTERED_STYLE_KEYS.has(field.key)
  ) {
    findings.push({
      rule: 'R4',
      severity: 'warning',
      message: `${field.key} 不在样式键词典里：能复用 color / fillColor / trackColor 等通用键时优先复用。`,
      path: [...path, 'key'],
    });
  }
}

const RENDER_RULES: readonly {
  readonly pattern: RegExp;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}[] = [
  {
    pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|\bimport\s*\(/,
    severity: 'error',
    message: '渲染代码不自行取数或加载代码：数据经数据源进入 value / rows。',
  },
  {
    pattern: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie/,
    severity: 'error',
    message: '渲染代码不读写浏览器存储：组件状态只来自 props / style / 数据。',
  },
  {
    pattern: /getRootNode\s*\(|\.host\b|ownerDocument\.body|document\.(?:body|head|documentElement)/,
    severity: 'error',
    message: '只在 root 里绘制：宿主元素与页面归渲染器所有（物料渲染盒不变式）。',
  },
  {
    pattern: /\bsetInterval\s*\(|\brequestAnimationFrame\s*\(/,
    severity: 'warning',
    message: '每次数据或配置变化都会整体重绘：定时器与动画帧不会随之清理，动画请用 CSS。',
  },
  {
    pattern: /\b(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/,
    severity: 'warning',
    message: '用 textContent 呈现数据，避免把读数当作 HTML 解释。',
  },
];

function auditRenderSource(
  source: string,
  spec: BaseScreenMaterialSpec,
  findings: BaseScreenAuthoringFinding[],
): void {
  const code = stripComments(source);
  for (const rule of RENDER_RULES) {
    if (rule.pattern.test(code)) {
      findings.push({ rule: 'RENDER', severity: rule.severity, message: rule.message });
    }
  }
  if (code.trim() === '') {
    findings.push({ rule: 'RENDER', severity: 'error', message: '渲染代码为空。' });
  }
  if (spec.data.kind === 'none' && /\b(?:value|rows)\b/.test(code)) {
    findings.push({
      rule: 'RENDER',
      severity: 'warning',
      message: '组件声明为无数据，渲染代码却读了 value / rows：它们恒为空。',
    });
  }
  if (spec.numberFormat !== undefined && !/\bformatNumber\b/.test(code)) {
    findings.push({
      rule: 'RENDER',
      severity: 'warning',
      message: '开启了读数格式，但渲染代码没有调用 formatNumber：检查器里的小数位、单位不会生效。',
    });
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function fieldPath(spec: BaseScreenMaterialSpec, key: string): readonly (string | number)[] {
  const index = spec.fields.findIndex((field) => field.key === key);
  return index < 0 ? ['numberFormat'] : ['fields', index];
}
