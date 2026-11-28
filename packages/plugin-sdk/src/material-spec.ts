import {
  isScreenMaterialType,
  SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY,
  type ScreenDatasetField,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenSize,
} from '@base-screen/contracts';
import {
  BASE_SCREEN_RESERVED_STYLE_SCHEMAS,
  type BaseScreenMaterialDataBindingRole,
  type BaseScreenMaterialEditorFieldInput,
  type BaseScreenMaterialEditorSectionInput,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialPropSchema,
  type BaseScreenMaterialTabularDataAdapter,
  isBaseScreenBoundedName,
  parseBaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import {
  type BaseScreenNumberFormatConfigOptions,
  createBaseScreenNumberFormatConfig,
} from './material-config-groups.js';
import {
  type BaseScreenMaterialSpecEvent,
  type BaseScreenMaterialTemplate,
  compileBaseScreenMaterialTemplate,
  parseBaseScreenMaterialSpecEvents,
} from './material-template.js';

/**
 * 物料规格（base-screen-docs ADR-0105 §2.2）：作者只写「这个组件有哪些可调项、读什么数据」，
 * Manifest、检查器描述符、数据契约与表格适配器都从这里派生。
 *
 * 范式内建为默认（ADR-0099 §2.7 预告的作者面辅助）：
 * - 字段按分区声明，分区决定落在 props 还是 style（§2.2 判据：会随告警 / 主题变化的视觉量进 style），
 *   分区顺序固定为 §2.4 的「读数格式 → 结构 → 文字 → 填充与描边 → 语义色（收起）→ 动效（仅全量）」；
 * - 字段不写控件，由 ADR-0102 的推导表决定；读数格式走通用配置组；
 * - 数据只有三种形状（T2）：无数据、单值、多行（按角色绑定列）。
 *
 * 规格是 JSON 安全的纯数据，可存储、可回读编辑；它不包含渲染代码。
 */
export type BaseScreenMaterialSpecSection =
  | 'format'
  | 'structure'
  | 'text'
  | 'surface'
  | 'semantic'
  | 'motion';

export type BaseScreenMaterialSpecFieldKind = 'number' | 'text' | 'boolean' | 'color' | 'choice';

export interface BaseScreenMaterialSpecField {
  /** 文档键：小驼峰 ASCII，组件内唯一。 */
  readonly key: string;
  readonly label: string;
  readonly section: BaseScreenMaterialSpecSection;
  readonly kind: BaseScreenMaterialSpecFieldKind;
  /** 新插入组件的取值；类型须与 `kind` 一致（颜色、文本是字符串，选项是 `options` 之一）。 */
  readonly default: string | number | boolean;
  /** 仅 number：两端都给出时才是有界数值（滑杆 / 步进器）。 */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** 仅 number：单位不写进标签（ADR-0099 R5）。 */
  readonly unit?: string;
  /** 仅 choice：2–12 个取值。 */
  readonly options?: readonly string[];
  /** 仅 color：允许渐变。 */
  readonly allowGradient?: boolean;
  /** 只在另一个字段取某值时显示（引用更早声明的开关或选项字段）。 */
  readonly visibleWhen?: {
    readonly key: string;
    readonly equals: string | number | boolean;
  };
  readonly help?: string;
}

export interface BaseScreenMaterialSpecRole {
  /** 角色 id：同时是渲染函数里每行记录的键。 */
  readonly id: string;
  readonly label: string;
  readonly valueType: 'number' | 'string';
  readonly optional?: boolean;
}

export type BaseScreenMaterialSpecData =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'scalar';
      readonly valueType: 'number' | 'string';
      readonly sample: number | string;
    }
  | {
      readonly kind: 'rows';
      readonly roles: readonly BaseScreenMaterialSpecRole[];
      /** 示例行：键为角色 id。新插入组件的静态数据与预览都用它。 */
      readonly sample: readonly ScreenJsonObject[];
    };

/** 读数格式配置组的开关；`visibleWhen` 让整组跟随「显示读数」这类开关（引用读数格式分区里的字段）。 */
export interface BaseScreenMaterialSpecNumberFormat extends BaseScreenNumberFormatConfigOptions {
  readonly visibleWhen?: BaseScreenMaterialSpecField['visibleWhen'];
}

export interface BaseScreenMaterialSpec {
  readonly type: string;
  readonly name: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly defaultSize: ScreenSize;
  /** 是否允许旋转，缺省允许。原子物料不容纳子节点（L3 结构由容器承担）。 */
  readonly rotate?: boolean;
  /** 开启读数格式配置组（ADR-0102 §11）；渲染函数用 `formatNumber` 读取。 */
  readonly numberFormat?: BaseScreenMaterialSpecNumberFormat;
  readonly fields: readonly BaseScreenMaterialSpecField[];
  readonly data: BaseScreenMaterialSpecData;
  /**
   * L2 受限图元模板（ADR-0116）：给出时物料不需要渲染代码，在线包只有规格；
   * 与渲染函数互斥（`createBaseScreenSpecMaterialDefinition` 同时收到两者即失败）。
   */
  readonly template?: BaseScreenMaterialTemplate;
  /**
   * L3 隔离代码物料（ADR-0117）：给出时渲染代码只在沙箱 iframe 里运行，由
   * `createBaseScreenIsolatedMaterialDefinition` 注册。与 `template` 互斥，也不能交给
   * `createBaseScreenSpecMaterialDefinition`（同 realm 渲染函数）。
   */
  readonly isolated?: BaseScreenMaterialSpecIsolated;
  /** 模板节点可派发的事件（ADR-0116 §2.6），进蓝图事件列表。 */
  readonly events?: readonly BaseScreenMaterialSpecEvent[];
  /** 状态外观预置会改写的样式字段（ADR-0115 D8），须是样式分区里声明的字段。 */
  readonly statePresetKeys?: readonly string[];
}

export interface BaseScreenMaterialSpecIsolated {
  /** 用到的宿主预置库名（如 `echarts`），最多 4 个、不重复；包不能自带依赖（ADR-0117 D9）。 */
  readonly libraries?: readonly string[];
}

/** 分区词汇：顺序、标签与落点（props / style）只在这里定义一份。 */
export const BASE_SCREEN_MATERIAL_SPEC_SECTIONS: readonly {
  readonly id: BaseScreenMaterialSpecSection;
  readonly label: string;
  readonly target: 'props' | 'style';
  readonly collapsed?: true;
  readonly advanced?: true;
}[] = [
  { id: 'format', label: '读数格式', target: 'props' },
  { id: 'structure', label: '结构', target: 'props' },
  { id: 'text', label: '文字', target: 'style' },
  { id: 'surface', label: '填充与描边', target: 'style' },
  { id: 'semantic', label: '语义色', target: 'style', collapsed: true },
  { id: 'motion', label: '动效', target: 'props', advanced: true },
];

const SECTION_IDS: ReadonlySet<string> = new Set(
  BASE_SCREEN_MATERIAL_SPEC_SECTIONS.map((section) => section.id),
);
const FIELD_KINDS: ReadonlySet<string> = new Set(['number', 'text', 'boolean', 'color', 'choice']);
const SPEC_KEYS = new Set([
  'type',
  'name',
  'category',
  'keywords',
  'defaultSize',
  'rotate',
  'numberFormat',
  'fields',
  'data',
  'template',
  'isolated',
  'events',
  'statePresetKeys',
]);
const FIELD_KEYS = new Set([
  'key',
  'label',
  'section',
  'kind',
  'default',
  'min',
  'max',
  'step',
  'unit',
  'options',
  'allowGradient',
  'visibleWhen',
  'help',
]);
const NUMBER_FORMAT_KEYS = new Set([
  'decimals',
  'maxDecimals',
  'thousandsSeparator',
  'prefix',
  'unit',
  'visibleWhen',
]);
/** 读数格式配置组占用的 props 键：手写同名字段会和配置组冲突（ADR-0102 R14）。 */
const NUMBER_FORMAT_PROP_KEYS: ReadonlySet<string> = new Set([
  'decimals',
  'prefix',
  'unit',
  'thousandsSeparator',
]);
const KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,39}$/;
const MAX_FIELDS = 24;
const MAX_KEYWORDS = 16;
const MAX_ROLES = 6;
const MAX_SAMPLE_ROWS = 200;
const MAX_OPTIONS = 12;
const MAX_NAME = 64;
const MAX_LABEL = 32;
const MAX_HELP = 200;
const MAX_UNIT = 8;
const MAX_TEXT = 512;
const MIN_SIZE = 8;
const MAX_SIZE = 4096;

/** 规格形状的失败关闭解析：所有问题一次报全，路径相对规格根。 */
export function parseBaseScreenMaterialSpec(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialSpec> {
  const diagnostics: ScreenDiagnostic[] = [];
  const add = (path: readonly (string | number)[], message: string): void => {
    diagnostics.push({
      severity: 'error',
      code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      message,
    });
  };
  if (!isRecord(input)) {
    add([], '组件规格必须是对象。');
    return { ok: false, diagnostics };
  }
  for (const key of Object.keys(input)) if (!SPEC_KEYS.has(key)) add([key], `未知字段 ${key}。`);
  if (!isScreenMaterialType(input.type))
    add(['type'], '物料类型不合法（形如 host.online.gauge-1a2b）。');
  if (!isBaseScreenBoundedName(input.name, MAX_NAME))
    add(['name'], `名称为 1–${MAX_NAME} 个字符。`);
  if (!isBaseScreenBoundedName(input.category, MAX_NAME)) {
    add(['category'], `分类为 1–${MAX_NAME} 个字符。`);
  }
  if (
    !Array.isArray(input.keywords) ||
    input.keywords.length > MAX_KEYWORDS ||
    input.keywords.some((keyword) => !isBaseScreenBoundedName(keyword, MAX_LABEL))
  ) {
    add(['keywords'], `关键词最多 ${MAX_KEYWORDS} 个，每个 1–${MAX_LABEL} 个字符。`);
  }
  const size = input.defaultSize;
  if (
    !isRecord(size) ||
    !isSizeValue(size.width) ||
    !isSizeValue(size.height) ||
    Object.keys(size).some((key) => key !== 'width' && key !== 'height')
  ) {
    add(['defaultSize'], `默认尺寸的宽高为 ${MIN_SIZE}–${MAX_SIZE} 的数字。`);
  }
  if (input.rotate !== undefined && typeof input.rotate !== 'boolean') {
    add(['rotate'], 'rotate 必须是布尔值。');
  }
  const fields = Array.isArray(input.fields) ? input.fields : undefined;
  if (fields === undefined) add(['fields'], 'fields 必须是数组。');
  else if (fields.length > MAX_FIELDS) add(['fields'], `字段最多 ${MAX_FIELDS} 个。`);
  else parseFields(fields, add);
  if (input.numberFormat !== undefined) {
    parseNumberFormat(input.numberFormat, fields ?? [], add);
  }
  parseData(input.data, add);
  parseBaseScreenMaterialSpecEvents(input.events, add);
  if (input.statePresetKeys !== undefined) {
    const styleKeys = new Set(
      (fields ?? []).flatMap((field) =>
        isRecord(field) &&
        typeof field.key === 'string' &&
        typeof field.section === 'string' &&
        BASE_SCREEN_MATERIAL_SPEC_SECTIONS.find((section) => section.id === field.section)
          ?.target === 'style'
          ? [field.key]
          : [],
      ),
    );
    if (
      !Array.isArray(input.statePresetKeys) ||
      input.statePresetKeys.length > 8 ||
      input.statePresetKeys.some((key) => typeof key !== 'string' || !styleKeys.has(key))
    ) {
      add(['statePresetKeys'], 'statePresetKeys 最多 8 个，每个都要是样式分区里声明的字段。');
    }
  }
  if (input.isolated !== undefined) {
    const isolated = input.isolated;
    const libraries = isRecord(isolated) ? isolated.libraries : undefined;
    if (
      !isRecord(isolated) ||
      Object.keys(isolated).some((key) => key !== 'libraries') ||
      (libraries !== undefined &&
        (!Array.isArray(libraries) ||
          libraries.length > 4 ||
          new Set(libraries).size !== libraries.length ||
          libraries.some(
            (name) => typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(name),
          )))
    ) {
      add(['isolated'], 'isolated 只能有 libraries：最多 4 个不重复的预置库名。');
    }
    if (input.template !== undefined) {
      add(
        ['isolated'],
        'MATERIAL_ISOLATED_CONFLICT：template 与 isolated 互斥（L2 与 L3 只能二选一）。',
      );
    }
  }
  if (input.template !== undefined && diagnostics.length === 0) {
    // 模板只在规格其余部分合法时编译：引用范围依赖字段、角色与事件。
    const spec = input as unknown as BaseScreenMaterialSpec;
    const template = compileBaseScreenMaterialTemplate(input.template, {
      fields: spec.fields,
      data: spec.data,
      ...(spec.events === undefined ? {} : { events: spec.events }),
      sectionTarget: (section) => sectionTarget(section as BaseScreenMaterialSpecSection),
    });
    if (!template.ok) diagnostics.push(...template.diagnostics);
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, value: input as unknown as BaseScreenMaterialSpec, diagnostics: [] };
}

type AddDiagnostic = (path: readonly (string | number)[], message: string) => void;

function parseNumberFormat(value: unknown, fields: readonly unknown[], add: AddDiagnostic): void {
  if (!isRecord(value)) {
    add(['numberFormat'], 'numberFormat 必须是对象。');
    return;
  }
  if (value.visibleWhen !== undefined) {
    const condition = value.visibleWhen;
    const dependency = fields.find(
      (field): field is Record<string, unknown> =>
        isRecord(field) && isRecord(condition) && field.key === condition.key,
    );
    if (
      !isRecord(condition) ||
      Object.keys(condition).some((item) => item !== 'key' && item !== 'equals') ||
      dependency === undefined ||
      dependency.section !== 'format' ||
      (dependency.kind !== 'boolean' && dependency.kind !== 'choice') ||
      !sameKindValue(dependency, condition.equals)
    ) {
      add(
        ['numberFormat', 'visibleWhen'],
        'visibleWhen 只能引用读数格式分区里的开关或选项字段，equals 取该字段的合法值。',
      );
    }
  }
  for (const key of Object.keys(value)) {
    if (!NUMBER_FORMAT_KEYS.has(key)) add(['numberFormat', key], `未知字段 ${key}。`);
  }
  for (const key of ['decimals', 'maxDecimals'] as const) {
    const item = value[key];
    if (
      item !== undefined &&
      (!Number.isInteger(item) || (item as number) < 0 || (item as number) > 6)
    ) {
      add(['numberFormat', key], `${key} 是 0–6 的整数。`);
    }
  }
  if (value.thousandsSeparator !== undefined && typeof value.thousandsSeparator !== 'boolean') {
    add(['numberFormat', 'thousandsSeparator'], 'thousandsSeparator 必须是布尔值。');
  }
  for (const key of ['prefix', 'unit'] as const) {
    const item = value[key];
    if (
      item !== undefined &&
      typeof item !== 'boolean' &&
      (typeof item !== 'string' || [...item].length > 16)
    ) {
      add(['numberFormat', key], `${key} 是布尔值，或不超过 16 个字符的默认值。`);
    }
  }
}

function parseFields(fields: readonly unknown[], add: AddDiagnostic): void {
  const seen = new Map<string, Record<string, unknown>>();
  const reserved = new Set(Object.keys(BASE_SCREEN_RESERVED_STYLE_SCHEMAS));
  fields.forEach((field, index) => {
    const path = ['fields', index] as const;
    if (!isRecord(field)) {
      add(path, '字段必须是对象。');
      return;
    }
    for (const key of Object.keys(field)) {
      if (!FIELD_KEYS.has(key)) add([...path, key], `未知字段 ${key}。`);
    }
    const key = field.key;
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      add([...path, 'key'], '键名为小驼峰 ASCII（字母开头，最多 40 个字符）。');
    } else if (seen.has(key)) {
      add([...path, 'key'], `键名 ${key} 重复。`);
    } else if (reserved.has(key)) {
      add(
        [...path, 'key'],
        `${key} 是引擎保留样式（公共区统一提供），物料不再声明（ADR-0099 R6）。`,
      );
    } else if (NUMBER_FORMAT_PROP_KEYS.has(key)) {
      add(
        [...path, 'key'],
        `${key} 属于读数格式配置组：开启 numberFormat，不要手写同名字段（ADR-0102 R14）。`,
      );
    }
    if (!isBaseScreenBoundedName(field.label, MAX_LABEL))
      add([...path, 'label'], '标签为 1–32 个字符。');
    if (typeof field.section !== 'string' || !SECTION_IDS.has(field.section)) {
      add(
        [...path, 'section'],
        '分区只能是 format / structure / text / surface / semantic / motion。',
      );
    }
    const kind = field.kind;
    if (typeof kind !== 'string' || !FIELD_KINDS.has(kind)) {
      add([...path, 'kind'], '类型只能是 number / text / boolean / color / choice。');
    } else {
      parseFieldValue(field, kind, path, add);
    }
    if (field.help !== undefined && !isBaseScreenBoundedName(field.help, MAX_HELP)) {
      add([...path, 'help'], `说明最多 ${MAX_HELP} 个字符。`);
    }
    if (field.visibleWhen !== undefined) {
      const condition = field.visibleWhen;
      const dependency =
        isRecord(condition) && typeof condition.key === 'string'
          ? seen.get(condition.key)
          : undefined;
      if (
        !isRecord(condition) ||
        Object.keys(condition).some((item) => item !== 'key' && item !== 'equals') ||
        dependency === undefined ||
        (dependency.kind !== 'boolean' && dependency.kind !== 'choice') ||
        !sameKindValue(dependency, condition.equals)
      ) {
        add(
          [...path, 'visibleWhen'],
          'visibleWhen 只能引用更早声明的开关或选项字段，equals 取该字段的合法值。',
        );
      }
    }
    if (typeof key === 'string' && !seen.has(key)) seen.set(key, field);
  });
}

function parseFieldValue(
  field: Record<string, unknown>,
  kind: string,
  path: readonly (string | number)[],
  add: AddDiagnostic,
): void {
  const value = field.default;
  const onlyFor = (keys: readonly string[], allowed: string): void => {
    for (const key of keys) {
      if (field[key] !== undefined && kind !== allowed)
        add([...path, key], `${key} 只用于 ${allowed} 字段。`);
    }
  };
  onlyFor(['min', 'max', 'step', 'unit'], 'number');
  onlyFor(['options'], 'choice');
  onlyFor(['allowGradient'], 'color');
  switch (kind) {
    case 'number': {
      for (const key of ['min', 'max', 'step'] as const) {
        if (field[key] !== undefined && !isFiniteNumber(field[key]))
          add([...path, key], `${key} 必须是数字。`);
      }
      const min = field.min as number | undefined;
      const max = field.max as number | undefined;
      if (min !== undefined && max !== undefined && min >= max)
        add([...path, 'max'], 'max 必须大于 min。');
      if (field.step !== undefined && (field.step as number) <= 0)
        add([...path, 'step'], 'step 必须大于 0。');
      if (field.unit !== undefined && !isBaseScreenBoundedName(field.unit, MAX_UNIT)) {
        add([...path, 'unit'], `单位最多 ${MAX_UNIT} 个字符。`);
      }
      if (
        !isFiniteNumber(value) ||
        (min !== undefined && value < min) ||
        (max !== undefined && value > max)
      ) {
        add([...path, 'default'], '默认值必须是范围内的数字。');
      }
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') add([...path, 'default'], '默认值必须是布尔值。');
      return;
    case 'text':
    case 'color':
      if (typeof value !== 'string' || [...value].length > MAX_TEXT) {
        add([...path, 'default'], `默认值必须是不超过 ${MAX_TEXT} 个字符的字符串。`);
      }
      if (field.allowGradient !== undefined && typeof field.allowGradient !== 'boolean') {
        add([...path, 'allowGradient'], 'allowGradient 必须是布尔值。');
      }
      return;
    case 'choice': {
      const options = field.options;
      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        options.length > MAX_OPTIONS ||
        options.some((option) => !isBaseScreenBoundedName(option, MAX_LABEL)) ||
        new Set(options).size !== options.length
      ) {
        add([...path, 'options'], `选项为 2–${MAX_OPTIONS} 个互不相同的字符串。`);
      } else if (typeof value !== 'string' || !options.includes(value)) {
        add([...path, 'default'], '默认值必须是选项之一。');
      }
    }
  }
}

function parseData(data: unknown, add: AddDiagnostic): void {
  if (!isRecord(data)) {
    add(['data'], 'data 必须是对象。');
    return;
  }
  const allow = (keys: readonly string[]): void => {
    for (const key of Object.keys(data))
      if (!keys.includes(key)) add(['data', key], `未知字段 ${key}。`);
  };
  switch (data.kind) {
    case 'none':
      allow(['kind']);
      return;
    case 'scalar':
      allow(['kind', 'valueType', 'sample']);
      if (data.valueType !== 'number' && data.valueType !== 'string') {
        add(['data', 'valueType'], '单值类型只能是 number 或 string。');
      } else if (
        data.valueType === 'number' ? !isFiniteNumber(data.sample) : typeof data.sample !== 'string'
      ) {
        add(['data', 'sample'], '示例值的类型须与单值类型一致。');
      }
      return;
    case 'rows': {
      allow(['kind', 'roles', 'sample']);
      const roles = data.roles;
      const ids = new Set<string>();
      if (!Array.isArray(roles) || roles.length === 0 || roles.length > MAX_ROLES) {
        add(['data', 'roles'], `角色为 1–${MAX_ROLES} 个。`);
      } else {
        roles.forEach((role, index) => {
          const path = ['data', 'roles', index] as const;
          if (
            !isRecord(role) ||
            Object.keys(role).some((key) => !['id', 'label', 'valueType', 'optional'].includes(key))
          ) {
            add(path, '角色只包含 id / label / valueType / optional。');
            return;
          }
          if (typeof role.id !== 'string' || !KEY_PATTERN.test(role.id) || ids.has(role.id)) {
            add([...path, 'id'], '角色 id 为互不相同的小驼峰 ASCII。');
          } else {
            ids.add(role.id);
          }
          if (!isBaseScreenBoundedName(role.label, MAX_LABEL))
            add([...path, 'label'], '角色名为 1–32 个字符。');
          if (role.valueType !== 'number' && role.valueType !== 'string') {
            add([...path, 'valueType'], '角色类型只能是 number 或 string。');
          }
          if (role.optional !== undefined && typeof role.optional !== 'boolean') {
            add([...path, 'optional'], 'optional 必须是布尔值。');
          }
        });
        if (roles.every((role) => isRecord(role) && role.optional === true)) {
          add(['data', 'roles'], '至少有一个必填角色。');
        }
      }
      const sample = data.sample;
      if (
        !Array.isArray(sample) ||
        sample.length > MAX_SAMPLE_ROWS ||
        sample.some((row) => !isRecord(row))
      ) {
        add(['data', 'sample'], `示例行是最多 ${MAX_SAMPLE_ROWS} 个对象的数组。`);
      } else {
        sample.forEach((row, index) => {
          for (const [key, cell] of Object.entries(row as Record<string, unknown>)) {
            if (!ids.has(key))
              add(['data', 'sample', index, key], `示例行的键 ${key} 不是角色 id。`);
            else if (cell !== null && typeof cell !== 'string' && !isFiniteNumber(cell)) {
              add(['data', 'sample', index, key], '示例单元格只能是字符串、数字或 null。');
            }
          }
        });
      }
      return;
    }
    default:
      add(['data', 'kind'], '数据形状只能是 none / scalar / rows。');
  }
}

export interface CompileBaseScreenMaterialSpecOptions {
  /** 构建产物的标签名（ADR-0090 §5：随每次构建变化）。 */
  readonly tagName: string;
  /** 软下架时为 false（ADR-0090 §6）。 */
  readonly libraryVisible?: boolean;
  readonly cover?: string;
}

/**
 * 规格 → Manifest。结果经 `parseBaseScreenMaterialManifest` 严格解析（描述符字段补齐推导的控件），
 * 与手写 Manifest 同一套校验；派生规则见文件头注释。
 */
export function compileBaseScreenMaterialSpec(
  input: unknown,
  options: CompileBaseScreenMaterialSpecOptions,
): ScreenParseResult<BaseScreenMaterialManifest> {
  const parsed = parseBaseScreenMaterialSpec(input);
  if (!parsed.ok) return parsed;
  const spec = parsed.value;
  const format =
    spec.numberFormat === undefined
      ? undefined
      : createBaseScreenNumberFormatConfig(numberFormatOptions(spec.numberFormat));
  const props: Record<string, BaseScreenMaterialPropSchema> = { ...format?.properties };
  const style: Record<string, BaseScreenMaterialPropSchema> = {};
  const defaultProps: Record<string, ScreenJsonValue> = { ...format?.defaults };
  const defaultStyle: Record<string, ScreenJsonValue> = {};
  const targets = new Map<string, 'props' | 'style'>();
  for (const field of spec.fields) {
    const target = sectionTarget(field.section);
    targets.set(field.key, target);
    (target === 'props' ? props : style)[field.key] = fieldSchema(field);
    (target === 'props' ? defaultProps : defaultStyle)[field.key] = field.default;
  }
  const appearance: BaseScreenMaterialEditorSectionInput[] = [];
  for (const section of BASE_SCREEN_MATERIAL_SPEC_SECTIONS) {
    // 作者字段在前：「显示读数」这类开关是读数格式的总闸，配置组字段跟在它后面。
    const fields: BaseScreenMaterialEditorFieldInput[] = [
      ...spec.fields
        .filter((field) => field.section === section.id)
        .map((field) => editorField(field, section.target, targets)),
      ...(section.id === 'format' ? formatFields(format?.fields ?? [], spec.numberFormat) : []),
    ];
    if (fields.length === 0) continue;
    appearance.push({
      id: section.id,
      label: section.label,
      fields,
      ...(section.collapsed === true ? { collapsed: true } : {}),
      ...(section.advanced === true ? { advanced: true } : {}),
    });
  }
  const manifest = {
    type: spec.type,
    tagName: options.tagName,
    name: spec.name,
    category: spec.category,
    keywords: [...spec.keywords],
    defaultSize: { width: spec.defaultSize.width, height: spec.defaultSize.height },
    defaultProps,
    defaultStyle,
    propsSchema: { kind: 'object', properties: props, required: Object.keys(props) },
    propertyPanel: [],
    styleSchema: { kind: 'object', properties: style, required: Object.keys(style) },
    stylePanel: [],
    ...(appearance.length === 0 && (spec.events ?? []).length === 0
      ? {}
      : {
          editorDescriptor: {
            ...(appearance.length === 0 ? {} : { appearance }),
            ...((spec.events ?? []).length === 0
              ? {}
              : { events: (spec.events ?? []).map(eventDescriptor) }),
          },
        }),
    events: (spec.events ?? []).map((event) => event.name),
    ...(spec.statePresetKeys === undefined || spec.statePresetKeys.length === 0
      ? {}
      : { statePresetKeys: [...spec.statePresetKeys] }),
    designCapabilities: { resize: true, rotate: spec.rotate ?? true, children: false },
    ...dataContract(spec.data),
    ...(options.libraryVisible === false ? { libraryVisible: false } : {}),
    ...(options.cover === undefined ? {} : { cover: options.cover }),
  };
  return parseBaseScreenMaterialManifest(manifest);
}

/** 规格事件 → 编辑器事件描述（只在蓝图里可用，负载形状由 payload 的类型决定）。 */
function eventDescriptor(event: BaseScreenMaterialSpecEvent) {
  return {
    name: event.name,
    label: event.label,
    maxPayloadBytes: 4096,
    triggerContexts: ['blueprint' as const],
    requiredCapability: SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY,
    payloadSchema: {
      kind: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(event.payload ?? {}).map(([key, item]) => [key, { kind: item.type }]),
      ),
      required: [],
    },
  };
}

function numberFormatOptions(
  options: BaseScreenMaterialSpecNumberFormat,
): BaseScreenNumberFormatConfigOptions {
  const { visibleWhen: _visibleWhen, ...rest } = options;
  return rest;
}

function formatFields(
  fields: readonly BaseScreenMaterialEditorFieldInput[],
  options: BaseScreenMaterialSpecNumberFormat | undefined,
): readonly BaseScreenMaterialEditorFieldInput[] {
  const condition = options?.visibleWhen;
  if (condition === undefined) return fields;
  // 依赖字段与配置组同在读数格式分区（props），条件同侧，不写 target。
  return fields.map((field) => ({
    ...field,
    when: [{ path: [condition.key], operator: 'eq' as const, value: condition.equals }],
  }));
}

function sectionTarget(section: BaseScreenMaterialSpecSection): 'props' | 'style' {
  return BASE_SCREEN_MATERIAL_SPEC_SECTIONS.find((item) => item.id === section)?.target ?? 'props';
}

function fieldSchema(field: BaseScreenMaterialSpecField): BaseScreenMaterialPropSchema {
  switch (field.kind) {
    case 'number':
      return {
        kind: 'number',
        ...(field.min === undefined ? {} : { minimum: field.min }),
        ...(field.max === undefined ? {} : { maximum: field.max }),
      };
    case 'boolean':
      return { kind: 'boolean' };
    case 'choice':
      return { kind: 'enum', values: [...(field.options ?? [])] };
    case 'text':
    case 'color':
      return { kind: 'string', maxLength: MAX_TEXT };
  }
}

function editorField(
  field: BaseScreenMaterialSpecField,
  target: 'props' | 'style',
  targets: ReadonlyMap<string, 'props' | 'style'>,
): BaseScreenMaterialEditorFieldInput {
  const condition = field.visibleWhen;
  const conditionTarget = condition === undefined ? undefined : targets.get(condition.key);
  return {
    id: field.key,
    target,
    path: [field.key],
    label: field.label,
    // 颜色键不一定符合 `xxxColor` 命名（例如 `fill`）：显式声明取色器，其余交给推导。
    ...(field.kind === 'color' ? { control: 'color' as const } : {}),
    ...(field.kind === 'color' && field.allowGradient === true ? { allowGradient: true } : {}),
    ...(field.unit === undefined ? {} : { unit: field.unit }),
    ...(field.step === undefined ? {} : { step: field.step }),
    ...(field.help === undefined ? {} : { help: field.help }),
    ...(condition === undefined
      ? {}
      : {
          when: [
            {
              // 跨侧依赖显式写出（ADR-0105 P1）：同侧时省略，与手写描述符一致。
              ...(conditionTarget !== undefined && conditionTarget !== target
                ? { target: conditionTarget }
                : {}),
              path: [condition.key],
              operator: 'eq' as const,
              value: condition.equals,
            },
          ],
        }),
  };
}

function dataContract(data: BaseScreenMaterialSpecData): Partial<BaseScreenMaterialManifest> {
  switch (data.kind) {
    case 'none':
      return { dataCapabilities: [] };
    case 'scalar':
      return {
        dataCapabilities: ['static', 'variable', 'dataset'],
        staticData: { kind: 'scalar', valueType: data.valueType },
        defaultData: data.sample,
        dataBinding: {
          roles: [
            {
              id: SCALAR_ROLE,
              minFields: 1,
              maxFields: 1,
              valueTypes:
                data.valueType === 'number' ? ['number', 'string'] : ['string', 'number', 'date'],
            },
          ],
        },
      };
    case 'rows':
      return {
        dataCapabilities: ['static', 'dataset'],
        staticData: {
          kind: 'tabular',
          defaultBinding: {
            fields: Object.fromEntries(data.roles.map((role) => [role.id, [role.id]])),
          },
        },
        defaultData: createBaseScreenMaterialSpecSampleDataset(data),
        dataBinding: {
          roles: data.roles.map(
            (role): BaseScreenMaterialDataBindingRole => ({
              id: role.id,
              minFields: role.optional === true ? 0 : 1,
              maxFields: 1,
              valueTypes:
                role.valueType === 'number' ? ['number'] : ['string', 'number', 'date', 'boolean'],
            }),
          ),
        },
      };
  }
}

/** 单值物料的数据角色 id。 */
const SCALAR_ROLE = 'value';

/** 示例行 → 静态表格数据集：列即角色，示例行只保留角色键。 */
export function createBaseScreenMaterialSpecSampleDataset(
  data: Extract<BaseScreenMaterialSpecData, { readonly kind: 'rows' }>,
): ScreenJsonObject {
  const fields: ScreenDatasetField[] = data.roles.map((role) => ({
    id: role.id,
    label: role.label,
    valueType: role.valueType,
    nullable: role.optional === true,
  }));
  return {
    fields: fields as unknown as ScreenJsonValue,
    rows: data.sample.map((row) =>
      Object.fromEntries(data.roles.map((role) => [role.id, row[role.id] ?? null])),
    ),
  };
}

/** 渲染函数看到的一行：键为角色 id，值已按角色类型规整（数字角色读不出数时为 null）。 */
export type BaseScreenMaterialSpecRow = Readonly<Record<string, string | number | null>>;

/** 规格派生的数据投影：单值 → 数字或字符串；多行 → `{ rows, total }`。 */
export function createBaseScreenMaterialSpecDataAdapter(
  data: BaseScreenMaterialSpecData,
): BaseScreenMaterialTabularDataAdapter | undefined {
  if (data.kind === 'none') return undefined;
  if (data.kind === 'scalar') {
    return {
      adapt({ dataset, fields }) {
        const field = fields[SCALAR_ROLE]?.[0];
        const row = dataset.rows[0];
        if (field === undefined) return bindingFailure('单值组件需要绑定一列。');
        if (row === undefined) return { ok: true, value: null, diagnostics: [] };
        return { ok: true, value: coerceCell(row[field.id], data.valueType), diagnostics: [] };
      },
    };
  }
  return {
    adapt({ dataset, fields }) {
      for (const role of data.roles) {
        if (role.optional !== true && (fields[role.id]?.length ?? 0) === 0) {
          return bindingFailure(`角色「${role.label}」需要绑定一列。`);
        }
      }
      const rows = dataset.rows.map((row) =>
        Object.fromEntries(
          data.roles.map((role) => {
            const field = fields[role.id]?.[0];
            return [
              role.id,
              field === undefined ? null : coerceCell(row[field.id], role.valueType),
            ];
          }),
        ),
      );
      return { ok: true, value: { rows, total: rows.length }, diagnostics: [] };
    },
  };
}

/** 渲染前把任意数据值规整成规格约定的形状（静态、变量、数据集三条通道到这里统一）。 */
export function normalizeBaseScreenMaterialSpecValue(
  data: BaseScreenMaterialSpecData,
  value: ScreenJsonValue | undefined,
): { readonly value: number | string | null; readonly rows: readonly BaseScreenMaterialSpecRow[] } {
  if (data.kind === 'none') return { value: null, rows: [] };
  if (data.kind === 'scalar') return { value: coerceCell(value, data.valueType), rows: [] };
  const source =
    isRecord(value) && Array.isArray(value.rows) ? value.rows : Array.isArray(value) ? value : [];
  const rows = source
    .filter(isRecord)
    .map((row) =>
      Object.fromEntries(
        data.roles.map((role) => [
          role.id,
          coerceCell(row[role.id] as ScreenJsonValue, role.valueType),
        ]),
      ),
    );
  return { value: null, rows };
}

function coerceCell(
  value: ScreenJsonValue | undefined,
  type: 'number' | 'string',
): number | string | null {
  if (value === null || value === undefined) return null;
  if (type === 'number') {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function bindingFailure(message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'HOST_DATASET_BINDING_INVALID', path: [], message }],
  };
}

function sameKindValue(field: Record<string, unknown>, value: unknown): boolean {
  if (field.kind === 'boolean') return typeof value === 'boolean';
  return Array.isArray(field.options) && typeof value === 'string' && field.options.includes(value);
}

function isSizeValue(value: unknown): boolean {
  return isFiniteNumber(value) && value >= MIN_SIZE && value <= MAX_SIZE;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
