/**
 * 智能体可用目录：宿主设计器里**真实**装了哪些物料、手上有哪些静态素材。
 *
 * 之前这张清单是写死在 `agent-compose.ts` 里的三种 type（`base.text` / `base.rectangle` /
 * `base.image`），模型看不到宿主装的图表、表格、宿主自有物料与外围插件物料，图片也只能写死
 * 外链。现在改成：宿主把「当前设计器 catalog + 素材库」压成一份有界摘要随请求带来，
 * 后端只按这份摘要构造提示词与校验产物——目录里没有的 type 一律拒绝，不猜、不补。
 *
 * 摘要刻意只保留编译需要的东西（不含 tagName、属性面板、事件、完整 schema）：
 * - `data` 来自物料 manifest 的 `staticData.kind`，决定这一块要不要数据、数据长什么样；
 * - `props` 只留 key + 值类型 + 枚举值，够模型填参、够后端校验；
 * - `defaults` 是 manifest 的 `defaultProps` / `defaultStyle`，编译时直接用，避免猜样式；
 * - `roles` 是 `dataBinding.roles`，用来把表格列分配到宿主声明的绑定角色上。
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const AGENT_CATALOG_LIMITS = {
  materials: 32,
  assets: 200,
  propsPerMaterial: 12,
  enumValues: 8,
  rolesPerMaterial: 8,
  labelLength: 40,
  typeLength: 64,
  assetNameLength: 60,
  defaultKeys: 40,
} as const;

export type AgentCatalogData = 'scalar' | 'tabular' | 'none';

export interface AgentCatalogProp {
  readonly kind: 'string' | 'number' | 'boolean' | 'enum';
  readonly values?: readonly string[];
}

export interface AgentCatalogRole {
  readonly id: string;
  readonly min: number;
  readonly max: number;
}

export interface AgentCatalogMaterial {
  readonly type: string;
  readonly name: string;
  readonly category: string;
  /** manifest 的 `staticData.kind`：没有 `staticData` 的物料记 `none`（只做装饰）。 */
  readonly data: AgentCatalogData;
  /** manifest 的 `hostResourceSelection`：该物料能被素材身份直接赋值。 */
  readonly asset: boolean;
  readonly size: { readonly width: number; readonly height: number };
  readonly props: Readonly<Record<string, AgentCatalogProp>>;
  readonly roles: readonly AgentCatalogRole[];
  readonly defaults: {
    readonly props: Readonly<Record<string, JsonValue>>;
    readonly style: Readonly<Record<string, JsonValue>>;
  };
}

export interface AgentCatalogAsset {
  readonly id: string;
  readonly name: string;
}

export interface AgentCatalog {
  readonly materials: readonly AgentCatalogMaterial[];
  readonly assets: readonly AgentCatalogAsset[];
  /** `client` = 宿主随请求带来的真实目录；`fallback` = 没带目录时的最小内置集。 */
  readonly source: 'client' | 'fallback';
}

export interface AgentCatalogDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type AgentCatalogParseResult =
  | { readonly ok: true; readonly value: AgentCatalog }
  | { readonly ok: false; readonly diagnostics: readonly AgentCatalogDiagnostic[] };

/**
 * 物料 type 的稳定身份：小写字母开头，允许 `-` 与 `.` 分段。
 * 宿主物料与在线包的 type 都带连字符（`host-app.metric-value`、`host.online.kpi-7c81`），
 * 这里不能只放行 `base.text` 那种写法。
 */
const TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)+$/;
const ROLE_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const PROP_KINDS = new Set(['string', 'number', 'boolean', 'enum']);
const DATA_KINDS = new Set(['scalar', 'tabular', 'none']);

/**
 * 没带目录时的兜底：就是升级前那三种 type，保证 `curl` 与既有测试仍然可用。
 * 它不是「设计器里有什么」，所以响应里会把 `catalogSource` 标成 `fallback`。
 */
export const FALLBACK_AGENT_CATALOG: AgentCatalog = {
  source: 'fallback',
  assets: [],
  materials: [
    {
      type: 'base.text',
      name: '文本',
      category: '基础',
      data: 'scalar',
      asset: false,
      size: { width: 320, height: 72 },
      props: { autoWidth: { kind: 'boolean' } },
      roles: [],
      defaults: {
        props: { autoWidth: false },
        style: {
          color: '#e9eef5',
          fontSize: 20,
          fontWeight: '400',
          textAlign: 'left',
          verticalAlign: 'top',
          letterSpacing: 0,
          lineSpacing: 0,
          opacity: 1,
          flipX: false,
          flipY: false,
        },
      },
    },
    {
      type: 'base.rectangle',
      name: '矩形',
      category: '基础',
      data: 'none',
      asset: false,
      size: { width: 240, height: 160 },
      props: {},
      roles: [],
      defaults: {
        props: {},
        style: {
          fill: '#141b24',
          borderColor: '#243244',
          borderWidth: 0,
          opacity: 1,
          flipX: false,
          flipY: false,
          borderRadius: 12,
          shadowColor: '',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
        },
      },
    },
    {
      type: 'base.chart',
      name: '图表',
      category: '数据',
      data: 'tabular',
      asset: false,
      size: { width: 480, height: 280 },
      props: {},
      roles: [
        { id: 'dimension', min: 1, max: 1 },
        { id: 'measures', min: 1, max: 8 },
      ],
      defaults: {
        props: {},
        style: {
          backgroundColor: '#111827',
          color: '#f9fafb',
          gridColor: '#374151',
          lineWidth: 2,
          opacity: 1,
          flipX: false,
          flipY: false,
        },
      },
    },
    {
      type: 'base.image',
      name: '图片',
      category: '基础',
      data: 'scalar',
      asset: true,
      size: { width: 240, height: 160 },
      props: {},
      roles: [],
      defaults: {
        props: {},
        style: { objectFit: 'cover', opacity: 1, flipX: false, flipY: false },
      },
    },
  ],
};

/**
 * 严格解析宿主带来的目录。未知字段、越界数量、非法 type 一律拒绝——
 * 目录是编译器唯一的事实来源，不能"尽量用"。
 */
export function parseAgentCatalog(input: unknown): AgentCatalogParseResult {
  if (input === undefined || input === null) {
    return { ok: true, value: FALLBACK_AGENT_CATALOG };
  }
  const diagnostics: AgentCatalogDiagnostic[] = [];
  const record = asRecord(input);
  if (record === null) {
    return fail('AGENT_CATALOG_INVALID', '', '目录必须是对象。');
  }
  const materialsInput = Array.isArray(record.materials) ? record.materials : null;
  if (materialsInput === null || materialsInput.length === 0) {
    return fail('AGENT_CATALOG_INVALID', 'materials', '目录至少需要一个物料。');
  }
  if (materialsInput.length > AGENT_CATALOG_LIMITS.materials) {
    return fail(
      'AGENT_CATALOG_TOO_LARGE',
      'materials',
      `物料数量超过上限 ${AGENT_CATALOG_LIMITS.materials}。`,
    );
  }
  const materials: AgentCatalogMaterial[] = [];
  const seen = new Set<string>();
  materialsInput.forEach((item, index) => {
    const material = readMaterial(item, index, diagnostics);
    if (material === null) return;
    if (seen.has(material.type)) {
      diagnostics.push({
        code: 'AGENT_CATALOG_DUPLICATE_TYPE',
        path: `materials[${index}].type`,
        message: `物料 type 重复：${material.type}`,
      });
      return;
    }
    seen.add(material.type);
    materials.push(material);
  });

  const assetsInput = record.assets === undefined ? [] : record.assets;
  const assets: AgentCatalogAsset[] = [];
  if (Array.isArray(assetsInput)) {
    if (assetsInput.length > AGENT_CATALOG_LIMITS.assets) {
      diagnostics.push({
        code: 'AGENT_CATALOG_TOO_LARGE',
        path: 'assets',
        message: `素材数量超过上限 ${AGENT_CATALOG_LIMITS.assets}。`,
      });
    }
    assetsInput.slice(0, AGENT_CATALOG_LIMITS.assets).forEach((item, index) => {
      const asset = readAsset(item, index, diagnostics);
      if (asset !== null) assets.push(asset);
    });
  } else if (assetsInput !== undefined) {
    diagnostics.push({
      code: 'AGENT_CATALOG_INVALID',
      path: 'assets',
      message: 'assets 必须是数组。',
    });
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      source: 'client',
      materials: [...materials].sort((left, right) => left.type.localeCompare(right.type)),
      assets: [...assets].sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

export function findMaterial(
  catalog: AgentCatalog,
  type: string,
): AgentCatalogMaterial | undefined {
  return catalog.materials.find((material) => material.type === type);
}

/** 目录摘要进不了提示词的兜底：标题类文本物料。 */
export function pickTextMaterial(catalog: AgentCatalog): AgentCatalogMaterial | undefined {
  return catalog.materials.find(
    (material) =>
      material.data === 'scalar' && typeof material.defaults.style.fontSize === 'number',
  );
}

/** 卡片底板：无数据、且默认样式里带纯色填充的装饰物料。 */
export function pickSurfaceMaterial(catalog: AgentCatalog): AgentCatalogMaterial | undefined {
  return catalog.materials.find(
    (material) => material.data === 'none' && typeof material.defaults.style.fill === 'string',
  );
}

/** 素材物料：能被素材身份赋值（manifest 声明了 hostResourceSelection）。 */
export function pickAssetMaterial(catalog: AgentCatalog): AgentCatalogMaterial | undefined {
  return catalog.materials.find((material) => material.asset && material.data === 'scalar');
}

/**
 * 把目录渲染成系统提示词里的一段。只写模型做决定需要的信息：
 * type、中文名、数据形态、参数（含枚举）、默认尺寸、可用素材 id。
 */
export function renderCatalogPrompt(catalog: AgentCatalog): string {
  const lines = catalog.materials.map((material) => {
    const parts = [`- ${material.type} ｜ ${material.name}`];
    parts.push(dataLabel(material));
    const props = Object.entries(material.props);
    if (props.length > 0) {
      parts.push(
        `参数：${props
          .map(([key, prop]) =>
            prop.kind === 'enum' && prop.values !== undefined
              ? `${key}(${prop.values.join('/')})`
              : `${key}(${prop.kind})`,
          )
          .join('、')}`,
      );
    }
    return parts.join(' ｜ ');
  });
  const assetLines =
    catalog.assets.length === 0
      ? ['（宿主没有可用素材，不要写 assetId，图片类组件用 assetId 以外的数据或跳过）']
      : catalog.assets.slice(0, 40).map((asset) => `- ${asset.id} ｜ ${asset.name}`);
  return [
    '可用组件（来自宿主设计器的真实物料目录，只能使用这里列出的 type）：',
    ...lines,
    '',
    '可用静态素材（assetId）：',
    ...assetLines,
  ].join('\n');
}

function dataLabel(material: AgentCatalogMaterial): string {
  if (material.data === 'tabular') {
    const roles = material.roles.map((role) => role.id).join('/');
    return roles === '' ? '数据型：需要 table' : `数据型：需要 table（绑定角色 ${roles}）`;
  }
  if (material.data === 'scalar') {
    return material.asset ? '值型：text 或 assetId' : '值型：需要 text';
  }
  return '无数据：只要 type 与位置';
}

function readMaterial(
  input: unknown,
  index: number,
  diagnostics: AgentCatalogDiagnostic[],
): AgentCatalogMaterial | null {
  const path = `materials[${index}]`;
  const record = asRecord(input);
  if (record === null) {
    diagnostics.push({ code: 'AGENT_CATALOG_INVALID', path, message: '物料必须是对象。' });
    return null;
  }
  const type = readString(
    record.type,
    `${path}.type`,
    AGENT_CATALOG_LIMITS.typeLength,
    diagnostics,
  );
  if (type === null) return null;
  if (!TYPE_PATTERN.test(type)) {
    diagnostics.push({
      code: 'AGENT_CATALOG_TYPE_INVALID',
      path: `${path}.type`,
      message: `物料 type 不合法：${type}`,
    });
    return null;
  }
  const name = readString(
    record.name,
    `${path}.name`,
    AGENT_CATALOG_LIMITS.labelLength,
    diagnostics,
  );
  const category = readString(
    record.category,
    `${path}.category`,
    AGENT_CATALOG_LIMITS.labelLength,
    diagnostics,
  );
  if (name === null || category === null) return null;

  const data = typeof record.data === 'string' ? record.data : '';
  if (!DATA_KINDS.has(data)) {
    diagnostics.push({
      code: 'AGENT_CATALOG_INVALID',
      path: `${path}.data`,
      message: 'data 只能是 scalar / tabular / none。',
    });
    return null;
  }

  const size = asRecord(record.size);
  const width = readPositiveInteger(size?.width, `${path}.size.width`, diagnostics);
  const height = readPositiveInteger(size?.height, `${path}.size.height`, diagnostics);
  if (width === null || height === null) return null;

  const props: Record<string, AgentCatalogProp> = {};
  const propsRecord = asRecord(record.props) ?? {};
  const propEntries = Object.entries(propsRecord);
  if (propEntries.length > AGENT_CATALOG_LIMITS.propsPerMaterial) {
    diagnostics.push({
      code: 'AGENT_CATALOG_TOO_LARGE',
      path: `${path}.props`,
      message: `物料参数超过上限 ${AGENT_CATALOG_LIMITS.propsPerMaterial}。`,
    });
    return null;
  }
  for (const [key, rawProp] of propEntries) {
    const prop = asRecord(rawProp);
    const kind = typeof prop?.kind === 'string' ? prop.kind : '';
    if (!PROP_KINDS.has(kind)) {
      diagnostics.push({
        code: 'AGENT_CATALOG_INVALID',
        path: `${path}.props.${key}`,
        message: '参数 kind 不合法。',
      });
      return null;
    }
    if (kind === 'enum') {
      const values = Array.isArray(prop?.values) ? prop.values : [];
      const bounded = values
        .filter((value): value is string => typeof value === 'string' && value.length <= 24)
        .slice(0, AGENT_CATALOG_LIMITS.enumValues);
      if (bounded.length === 0) {
        diagnostics.push({
          code: 'AGENT_CATALOG_INVALID',
          path: `${path}.props.${key}.values`,
          message: '枚举参数必须给出取值。',
        });
        return null;
      }
      props[key] = { kind: 'enum', values: bounded };
      continue;
    }
    props[key] = { kind: kind as 'string' | 'number' | 'boolean' };
  }

  const roles: AgentCatalogRole[] = [];
  const rolesInput = Array.isArray(record.roles) ? record.roles : [];
  if (rolesInput.length > AGENT_CATALOG_LIMITS.rolesPerMaterial) {
    diagnostics.push({
      code: 'AGENT_CATALOG_TOO_LARGE',
      path: `${path}.roles`,
      message: `绑定角色超过上限 ${AGENT_CATALOG_LIMITS.rolesPerMaterial}。`,
    });
    return null;
  }
  for (const [roleIndex, rawRole] of rolesInput.entries()) {
    const role = asRecord(rawRole);
    const id = typeof role?.id === 'string' ? role.id : '';
    if (!ROLE_PATTERN.test(id) || id.length > 32) {
      diagnostics.push({
        code: 'AGENT_CATALOG_INVALID',
        path: `${path}.roles[${roleIndex}].id`,
        message: '绑定角色 id 不合法。',
      });
      return null;
    }
    const min = readPositiveInteger(role?.min, `${path}.roles[${roleIndex}].min`, diagnostics);
    const max = readPositiveInteger(role?.max, `${path}.roles[${roleIndex}].max`, diagnostics);
    if (min === null || max === null || max < min) return null;
    roles.push({ id, min, max });
  }

  const defaultsRecord = asRecord(record.defaults);
  const defaultProps = readDefaultObject(
    defaultsRecord?.props,
    `${path}.defaults.props`,
    diagnostics,
  );
  const defaultStyle = readDefaultObject(
    defaultsRecord?.style,
    `${path}.defaults.style`,
    diagnostics,
  );
  if (defaultProps === null || defaultStyle === null) return null;

  return {
    type,
    name,
    category,
    data: data as AgentCatalogData,
    asset: record.asset === true,
    size: { width, height },
    props,
    roles,
    defaults: { props: defaultProps, style: defaultStyle },
  };
}

function readAsset(
  input: unknown,
  index: number,
  diagnostics: AgentCatalogDiagnostic[],
): AgentCatalogAsset | null {
  const path = `assets[${index}]`;
  const record = asRecord(input);
  if (record === null) {
    diagnostics.push({ code: 'AGENT_CATALOG_INVALID', path, message: '素材必须是对象。' });
    return null;
  }
  const id = readString(record.id, `${path}.id`, 80, diagnostics);
  const name = readString(
    record.name,
    `${path}.name`,
    AGENT_CATALOG_LIMITS.assetNameLength,
    diagnostics,
  );
  if (id === null || name === null) return null;
  return { id, name };
}

/** 默认 props / style 只接受浅层标量，避免把宿主内部结构原样搬进编译器。 */
function readDefaultObject(
  input: unknown,
  path: string,
  diagnostics: AgentCatalogDiagnostic[],
): Record<string, JsonValue> | null {
  if (input === undefined) return {};
  const record = asRecord(input);
  if (record === null) {
    diagnostics.push({ code: 'AGENT_CATALOG_INVALID', path, message: '默认值必须是对象。' });
    return null;
  }
  const entries = Object.entries(record);
  if (entries.length > AGENT_CATALOG_LIMITS.defaultKeys) {
    diagnostics.push({
      code: 'AGENT_CATALOG_TOO_LARGE',
      path,
      message: `默认值键数超过上限 ${AGENT_CATALOG_LIMITS.defaultKeys}。`,
    });
    return null;
  }
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of entries) {
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      output[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      output[key] = value;
      continue;
    }
    diagnostics.push({
      code: 'AGENT_CATALOG_INVALID',
      path: `${path}.${key}`,
      message: '默认值只接受字符串、数字、布尔或 null。',
    });
    return null;
  }
  return output;
}

function readString(
  input: unknown,
  path: string,
  maxLength: number,
  diagnostics: AgentCatalogDiagnostic[],
): string | null {
  if (typeof input !== 'string' || input.trim() === '') {
    diagnostics.push({ code: 'AGENT_CATALOG_INVALID', path, message: '需要非空字符串。' });
    return null;
  }
  const value = input.trim();
  if (value.length > maxLength) {
    diagnostics.push({
      code: 'AGENT_CATALOG_INVALID',
      path,
      message: `长度超过上限 ${maxLength}。`,
    });
    return null;
  }
  return value;
}

function readPositiveInteger(
  input: unknown,
  path: string,
  diagnostics: AgentCatalogDiagnostic[],
): number | null {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    diagnostics.push({ code: 'AGENT_CATALOG_INVALID', path, message: '需要正数。' });
    return null;
  }
  return Math.round(input);
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function fail(
  code: string,
  path: string,
  message: string,
): { readonly ok: false; readonly diagnostics: readonly AgentCatalogDiagnostic[] } {
  return { ok: false, diagnostics: [{ code, path, message }] };
}
