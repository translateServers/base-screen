import type { ScreenJsonValue } from '@base-screen/contracts';
import type { IntentCatalog, IntentCatalogMaterial } from './intent-catalog.js';
import type { Box, IntentReferences, PushExtra, TextToken } from './intent-compile-types.js';
import type { IntentStylePalette } from './intent-style.js';
import type { IntentBlock, IntentDiagnostic, IntentTable } from './intent-types.js';

/**
 * 块的编译：目录里的物料 + 取值 → 一个组件（外加块标题与说明）。
 *
 * 从示例后端的 `agent-compose.ts` 原样迁入（ADR-0113 S2，行为等价）。S4 起一个块会被编成
 * 「外壳 + 原子物料」的组合，这里的 `inset` / 标题位置届时一并调整。
 */

/** 落一个组件并返回它的 id（外壳要用它当子组件的父级）。 */
export type PushFn = (
  material: IntentCatalogMaterial,
  name: string,
  box: Box,
  extra?: PushExtra,
) => string;

export type PushTextFn = (name: string, value: string, box: Box, token?: TextToken) => void;

/** 编译过程中收集的降级与数据源。 */
export interface CompileSink {
  /** 阻断性诊断：出现任意一条就整份失败。 */
  readonly diagnostics: IntentDiagnostic[];
  /** 非阻断诊断：块降级但屏仍然产出。 */
  readonly warnings: IntentDiagnostic[];
  readonly dataSources: Record<string, unknown>[];
}

export interface BlockContext {
  readonly catalog: IntentCatalog;
  readonly textMaterial: IntentCatalogMaterial | undefined;
  readonly references: IntentReferences | undefined;
  readonly palette: IntentStylePalette;
  readonly push: PushFn;
  readonly pushText: PushTextFn;
  /**
   * 打开 / 关闭一个组合外壳：之后落的组件都以它为父级（ADR-0113 §2.4）。
   * 目录里没有可用外壳时 `beginShell` 什么也不做，组件平铺。
   */
  readonly beginShell: (name: string, box: Box) => void;
  readonly endShell: () => void;
}

export interface BlockTarget {
  readonly sink: CompileSink;
  readonly onAsset: () => void;
}

interface BlockPayload {
  readonly style?: Record<string, ScreenJsonValue>;
  readonly dataValue?: Record<string, unknown> | null;
  readonly dataBinding?: Record<string, unknown>;
}

export function compileBlock(
  block: IntentBlock,
  box: Box,
  context: BlockContext,
  target: BlockTarget,
): void {
  const material = context.catalog.materials.find((item) => item.type === block.type);
  if (material === undefined) {
    target.sink.warnings.push(
      warning('AGENT_MATERIAL_UNKNOWN', block, `目录里没有物料 ${block.type}。`),
    );
    return;
  }

  // 先算出这一块到底能不能产出内容，再决定要不要画标题——否则被跳过的块会在画布上
  // 留下一个只有标题的空洞。
  const payload = resolveBlockPayload(material, block, context, target);
  if (payload === null) return;

  const isTextBlock =
    context.textMaterial !== undefined && material.type === context.textMaterial.type;
  // 文本块只有在「标题就是正文」时才省略块标题（那是把一句话当块用）；
  // 标题与正文不同（例如「结论与建议」+ 三行结论）时必须留着，否则整块的信息层级就丢了。
  const textValue = (block.bind.kind === 'text' ? block.bind.text : '').trim();
  const titleIsBody = isTextBlock && textValue !== '' && block.title.trim() === textValue;
  const hasTitle = block.title.trim() !== '' && !titleIsBody;
  const hasNote = hasTitle && (block.note ?? '').trim() !== '';
  const headerHeight = hasTitle ? (hasNote ? 64 : 36) : 0;

  // 模型用目录里有的物料替代了用户要的东西：不是错误，但必须如实说明（F4，不静默降级）。
  if (block.substituteFor !== undefined) {
    target.sink.warnings.push({
      severity: 'warning',
      code: 'INTENT_BLOCK_SUBSTITUTED',
      path: block.origin,
      message: `The model used "${material.name}" in place of "${block.substituteFor}", which the catalog does not offer.`,
      detail: { wanted: block.substituteFor, used: material.name },
    });
  }
  // 一个块 = 一个外壳 + 标题 / 说明 / 主体：整体移动、复制、删除。
  context.beginShell(block.title.trim() === '' ? material.name : block.title, box);
  if (hasTitle) {
    // 标题与卡片左边缘对齐（卡片由 inset 内缩 16，标题不再额外偏移），整列看起来是一条竖线。
    context.pushText(
      '块标题',
      block.title,
      { x: box.x, y: box.y, width: box.width, height: 28 },
      { fontSize: 21, fontWeight: '700' },
    );
    if (hasNote) {
      context.pushText(
        '块说明',
        block.note ?? '',
        { x: box.x, y: box.y + 30, width: box.width, height: 24 },
        { fontSize: 16, color: context.palette.muted },
      );
    }
  }

  const body: Box = {
    x: box.x,
    y: box.y + headerHeight,
    width: box.width,
    height: box.height - headerHeight,
  };
  const name = block.title.trim() === '' ? material.name : block.title;
  // 文本块也走同一内边距：同排的表格/图表卡片内容从 x+16 起，纯文字贴着块边会显得错位。
  const targetBox = inset(body);
  const style = { ...(payload.style ?? {}), ...fitRowHeight(material, block, targetBox.height) };
  context.push(material, name, targetBox, {
    props: sanitizeProps(material, block.props),
    ...payload,
    ...(Object.keys(style).length === 0 ? {} : { style }),
  });
  context.endShell();
}

/**
 * 按物料声明的数据形态校验并构造这一块的数据：产不出来就返回 null（调用方据此整块跳过）。
 * 素材身份在这里落成 `dataSources` 实例，组件只留 `data-source-field` 引用。
 */
function resolveBlockPayload(
  material: IntentCatalogMaterial,
  block: IntentBlock,
  context: BlockContext,
  target: BlockTarget,
): BlockPayload | null {
  const { sink } = target;
  if (material.data === 'tabular') {
    if (block.bind.kind === 'dataset') {
      const { datasetId } = block.bind;
      const dataset = context.references?.datasets.find((item) => item.datasetId === datasetId);
      if (dataset !== undefined) {
        const dataSourceId = `agent-ds-${sink.dataSources.length + 1}`;
        sink.dataSources.push({
          id: dataSourceId,
          name: dataset.name,
          source: { kind: 'dataset', datasetId: dataset.datasetId },
          params: {},
        });
        // 列类型来自数据集 describe，角色分配与表格走同一套算法，避免两条规则漂移。
        const binding = assignRoles(material, {
          columns: dataset.columns.map((column) => ({
            id: column.id,
            label: column.id,
            type: column.type === 'number' ? 'number' : 'string',
          })),
        });
        return {
          dataValue: { kind: 'data-source-field', dataSourceId, path: [] },
          ...(binding === null ? {} : { dataBinding: { fields: binding } }),
        };
      }
      // 引用的数据集不在本次上下文里（已下架或宿主没解析出来）：如实记。
      // 意图层的数据集引用不带回落表格，所以接着会因为没有数据而跳过这一块。
      sink.warnings.push(
        warning(
          'AGENT_DATASET_UNKNOWN',
          block,
          `数据集 ${datasetId} 不在本轮引用里，该块改用示例数据。`,
        ),
      );
    }
    const table = block.bind.kind === 'table' ? block.bind.table : undefined;
    if (table === undefined) {
      sink.warnings.push(
        warning(
          'AGENT_BLOCK_DATA_MISSING',
          block,
          `${material.type} 是数据型组件，但没有给 table。`,
        ),
      );
      return null;
    }
    const binding = assignRoles(material, table);
    if (binding === null) {
      // 列满足不了物料的绑定角色时不整屏失败：把这块退成「无数据」的组件，
      // 让物料自己渲染空态，同时把降级原因记进 warnings。
      sink.warnings.push(
        warning(
          'AGENT_BLOCK_BINDING_UNSATISFIED',
          block,
          `${material.type} 的绑定角色无法由这 ${table.columns.length} 列满足，该块已退化为无数据。`,
        ),
      );
      return {};
    }
    return {
      // 模型给的表格是示例数据，不是真实数据：带上标记，设计器显示徽标、发布前拦截（ADR-0112 §2.3）。
      dataValue: { kind: 'inline', value: toDataSet(table), sample: true },
      dataBinding: { fields: binding },
    };
  }

  if (material.data === 'scalar') {
    if (block.bind.kind === 'asset') {
      const { assetId } = block.bind;
      const asset = context.catalog.assets.find((item) => item.id === assetId);
      if (asset === undefined) {
        sink.warnings.push(
          warning('AGENT_ASSET_UNKNOWN', block, `素材 ${assetId} 不在宿主素材清单里。`),
        );
        return null;
      }
      const dataSourceId = `agent-ds-${sink.dataSources.length + 1}`;
      sink.dataSources.push({
        id: dataSourceId,
        name: asset.name,
        source: { kind: 'host-resource', resourceType: 'host_image', resourceId: asset.id },
        params: {},
      });
      target.onAsset();
      return {
        // 配图要铺满它占的那块地方：manifest 默认 contain，整块配图会留一圈黑边。
        ...(typeof material.defaults.style.objectFit === 'string'
          ? { style: { objectFit: 'cover' } }
          : {}),
        dataValue: { kind: 'data-source-field', dataSourceId, path: [] },
      };
    }
    if (material.asset) {
      // 素材型物料只认素材身份。模型偶尔会写 text（"拣选作业现场"）——那会变成一个
      // 不是地址的字符串塞进 img.src，渲染器只能报"图片地址无效"。宁可少这一块。
      sink.warnings.push(
        warning(
          'AGENT_BLOCK_ASSET_REQUIRED',
          block,
          `${material.type} 需要 assetId，本次只给了 text，该块已跳过。`,
        ),
      );
      return null;
    }
    const text = block.bind.kind === 'text' ? block.bind.text : '';
    if (text === '') {
      sink.warnings.push(
        warning('AGENT_BLOCK_DATA_MISSING', block, `${material.type} 是值型组件，但没有给 text。`),
      );
      return null;
    }
    const isTextBlock =
      context.textMaterial !== undefined && material.type === context.textMaterial.type;
    return {
      ...(isTextBlock
        ? {
            style: tokenStyle(material, {
              fontSize: 18,
              color: context.palette.text,
              // 多行结论按单行紧排会糊成一片；单行不动，避免把一句标题撑开。
              lineSpacing: text.includes('\n') ? 8 : 0,
            }),
          }
        : {}),
      dataValue: { kind: 'inline', value: text },
    };
  }

  return {};
}

function warning(code: string, block: IntentBlock, message: string): IntentDiagnostic {
  return { severity: 'warning', code, path: block.origin, message };
}

/**
 * 把表格列分配到物料的绑定角色。
 *
 * 角色 id 与上下限来自目录（`dataBinding.roles`），这里只按列的值类型匹配：
 * - `columns`：全部列；
 * - `dimension`：第一个非数值列（没有就退回第一列）；
 * - `value` / `measures` / 其它：所有数值列。
 */
export function assignRoles(
  material: IntentCatalogMaterial,
  table: Pick<IntentTable, 'columns'>,
): Record<string, string[]> | null {
  if (material.roles.length === 0) return null;
  const all = table.columns.map((column) => column.id);
  const numeric = table.columns
    .filter((column) => column.type === 'number')
    .map((column) => column.id);
  const nonNumeric = table.columns
    .filter((column) => column.type !== 'number')
    .map((column) => column.id);
  const binding: Record<string, string[]> = {};
  for (const role of material.roles) {
    const id = role.id.toLowerCase();
    let picked: string[];
    if (id === 'columns') picked = all;
    else if (id === 'dimension') picked = nonNumeric.length > 0 ? nonNumeric : all;
    else picked = numeric.length > 0 ? numeric : all;
    const bounded = picked.slice(0, role.max);
    if (bounded.length < role.min) return null;
    binding[role.id] = bounded;
  }
  return binding;
}

function toDataSet(table: IntentTable): ScreenJsonValue {
  return {
    fields: table.columns.map((column) => ({
      id: column.id,
      label: column.label,
      valueType: column.type,
      nullable: false,
    })),
    rows: table.rows.map((row) => {
      const output: Record<string, ScreenJsonValue> = {};
      for (const column of table.columns) {
        output[column.id] = row[column.id] ?? null;
      }
      return output;
    }),
  };
}

/** 模型给的参数只保留目录声明过的键，并按声明类型收敛。 */
function sanitizeProps(
  material: IntentCatalogMaterial,
  props: Readonly<Record<string, string | number | boolean>> | undefined,
): Record<string, ScreenJsonValue> {
  if (props === undefined) return {};
  const output: Record<string, ScreenJsonValue> = {};
  for (const [key, value] of Object.entries(props)) {
    const declared = material.props[key];
    if (declared === undefined) continue;
    if (declared.kind === 'enum') {
      if (typeof value === 'string' && declared.values?.includes(value) === true)
        output[key] = value;
      continue;
    }
    if (declared.kind === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
      continue;
    }
    if (declared.kind === 'boolean') {
      if (typeof value === 'boolean') output[key] = value;
      continue;
    }
    if (typeof value === 'string') output[key] = value.slice(0, 160);
  }
  return output;
}

/** 令牌只写物料本来就有的样式键：没有 `fontSize` 的物料不会被塞进字号。 */
export function tokenStyle(
  material: IntentCatalogMaterial,
  token: TextToken,
): Record<string, ScreenJsonValue> {
  const style = material.defaults.style;
  const output: Record<string, ScreenJsonValue> = {};
  if (token.fontSize !== undefined && 'fontSize' in style) output.fontSize = token.fontSize;
  if (token.fontWeight !== undefined && 'fontWeight' in style) output.fontWeight = token.fontWeight;
  if (token.color !== undefined && 'color' in style) output.color = token.color;
  if (token.lineSpacing !== undefined && 'lineSpacing' in style)
    output.lineSpacing = token.lineSpacing;
  return output;
}

/**
 * 表格行高按块高收紧。
 *
 * 物料默认行高（32px）是按「随手拖一个表格」定的；自动排版时块高由栅格决定，
 * 6 行数据 + 表头常常差几个像素就溢出成滚动条，右侧那条滚动条和半截行最显廉价。
 * 这里只在物料声明过 `rowHeight` 时按可用高度重算，且只缩不放，保持物料自己的上限。
 */
function fitRowHeight(
  material: IntentCatalogMaterial,
  block: IntentBlock,
  bodyHeight: number,
): Record<string, ScreenJsonValue> {
  if (!('rowHeight' in material.defaults.style)) return {};
  const rows = block.bind.kind === 'table' ? block.bind.table.rows.length : 0;
  if (rows === 0) return {};
  const declared = material.defaults.style.rowHeight;
  const max = typeof declared === 'number' && declared > 0 ? declared : 32;
  // 表头也占一行，再留 4px 余量，避免最后一行刚好被裁。
  const fitted = Math.floor((bodyHeight - 4) / (rows + 1));
  return { rowHeight: Math.min(max, Math.max(20, fitted)) };
}

/** 数据组件四周留 16px，避免贴到块标题与块边缘。 */
function inset(box: Box): Box {
  const padding = 16;
  return {
    x: box.x + padding,
    y: box.y + padding,
    width: Math.max(1, box.width - padding * 2),
    height: Math.max(1, box.height - padding * 2),
  };
}
