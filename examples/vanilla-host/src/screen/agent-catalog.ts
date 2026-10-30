import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialObjectSchema,
} from '@base-screen/plugin-core';
import type {
  AgentCatalogMaterialShape,
  AgentCatalogPropShape,
  AgentCatalogShape,
} from '../lib/api';

/**
 * 把设计器的实时目录压成智能体可用的摘要。
 *
 * 摘要的权威来源是 `runtime.catalog`——官方物料、宿主自有物料、在线物料包与插件贡献
 * 三端合并后的结果（在线包发布/下架后宿主会 `refreshCatalog`，这里读到的就是最新一份）。
 * 所以「刚上线的组件」不需要导出快照、也不需要重启后端，下一句话就进了提示词。
 *
 * 只搬编译需要的东西：物料 type / 名称 / 数据形态 / 参数（含枚举）/ 绑定角色 / 默认值。
 * 不搬 tagName、构造函数、属性面板、事件、完整 schema——这些对生成没有用，反而会把
 * 宿主内部结构带出边界。
 *
 * 三端（vanilla / react / vue）逐字共享，与 `host-intent.ts` 同一对等约定。
 */

const MAX_MATERIALS = 32;
const MAX_ASSETS = 200;
const MAX_PROPS = 12;
const MAX_ENUM_VALUES = 8;
const MAX_ROLES = 8;
const MAX_DEFAULT_KEYS = 40;

export function buildAgentCatalog(
  catalog: BaseScreenMaterialCatalog,
  assets: readonly { readonly id: string; readonly name: string }[],
): AgentCatalogShape {
  const materials = catalog
    .list()
    .map((entry) => readMaterial(entry.manifest))
    .filter((material): material is AgentCatalogMaterialShape => material !== null)
    .sort((left, right) => left.type.localeCompare(right.type))
    .slice(0, MAX_MATERIALS);

  return {
    materials,
    assets: assets
      .map((asset) => ({ id: asset.id, name: asset.name.slice(0, 60) }))
      .slice(0, MAX_ASSETS),
  };
}

function readMaterial(manifest: BaseScreenMaterialManifest): AgentCatalogMaterialShape | null {
  const type = typeof manifest.type === 'string' ? manifest.type.trim() : '';
  if (type === '') return null;
  return {
    type,
    name: manifest.name.slice(0, 40),
    category: manifest.category.slice(0, 40),
    data: readDataKind(manifest),
    // 只有声明了「素材选择桥」的物料才允许被素材身份直接赋值，与数据面板的入口规则一致。
    asset: manifest.hostResourceSelection === true,
    size: {
      width: Math.round(manifest.defaultSize.width),
      height: Math.round(manifest.defaultSize.height),
    },
    props: readProps(manifest.propsSchema),
    roles: (manifest.dataBinding?.roles ?? []).slice(0, MAX_ROLES).map((role) => ({
      id: role.id,
      min: role.minFields,
      max: role.maxFields,
    })),
    defaults: {
      props: scalarOnly(manifest.defaultProps),
      style: scalarOnly(manifest.defaultStyle),
    },
  };
}

/** 物料吃哪种数据，由 manifest 的 `staticData` 声明决定，不按 type 猜。 */
function readDataKind(manifest: BaseScreenMaterialManifest): 'scalar' | 'tabular' | 'none' {
  const kind = manifest.staticData?.kind;
  if (kind === 'scalar' || kind === 'tabular') return kind;
  return 'none';
}

function readProps(
  schema: BaseScreenMaterialObjectSchema,
): Readonly<Record<string, AgentCatalogPropShape>> {
  const output: Record<string, AgentCatalogPropShape> = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    if (Object.keys(output).length >= MAX_PROPS) break;
    if (property.kind === 'string' || property.kind === 'number' || property.kind === 'boolean') {
      output[key] = { kind: property.kind };
      continue;
    }
    if (property.kind === 'enum') {
      // 只把字符串枚举带进提示词：数值/布尔枚举没法用「取值列表」表达，留给默认值。
      const values = (property.values ?? [])
        .filter((value): value is string => typeof value === 'string')
        .slice(0, MAX_ENUM_VALUES);
      if (values.length === 0) continue;
      output[key] = { kind: 'enum', values };
    }
    // object / array 参数无法在提示词里表达，也不让模型猜，直接不出现在摘要里。
  }
  return output;
}

/** 默认值只搬浅层标量：编译器只拿它当起点，复杂结构留给宿主自己的物料实现。 */
function scalarOnly(
  input: Readonly<Record<string, unknown>>,
): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (Object.keys(output).length >= MAX_DEFAULT_KEYS) break;
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      output[key] = value;
      continue;
    }
    if (typeof value === 'boolean') output[key] = value;
  }
  return output;
}
