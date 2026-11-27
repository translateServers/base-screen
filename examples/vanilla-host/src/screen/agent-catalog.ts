import { readDesignerStatePresetSource } from 'base-screen/engine';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialObjectSchema,
} from 'base-screen/plugin-core';
import { describeBaseScreenMaterialStyleForAi } from 'base-screen/plugin-core';
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
 * 只搬编译需要的东西：物料 type / 名称 / 数据形态 / 参数（含枚举）/ 绑定角色 / 默认值，
 * 以及由 styleSchema + editorDescriptor 确定性派生的带注释样式签名（stylePrompt）。
 * 事件只搬名称、可读名与负载顶层字段的形态（ADR-0115 D3，联动要用）。
 * 不搬 tagName、构造函数、属性面板 DOM、完整 schema 原文——这些对生成没有用，
 * 反而会把宿主内部结构带出边界。
 *
 * 三端（vanilla / react / vue）逐字共享，与 `host-intent.ts` 同一对等约定。
 */

export function buildAgentCatalog(catalog: BaseScreenMaterialCatalog): AgentCatalogShape {
  const materials = catalog
    .list()
    // 物料库不展示的容器也要进目录：它是编译器组合卡片与块的外壳（`children`），不会列给模型。
    .filter(
      (entry) =>
        entry.manifest.libraryVisible !== false ||
        entry.manifest.designCapabilities.children === true,
    )
    .map((entry) => readMaterial(entry.manifest))
    .filter((material): material is AgentCatalogMaterialShape => material !== null)
    .sort((left, right) => left.type.localeCompare(right.type));

  return { materials };
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
    asset:
      manifest.hostResourceSelection === true &&
      manifest.dataCapabilities.includes('host-resource'),
    ...(manifest.designCapabilities.children === true ? { children: true as const } : {}),
    size: {
      width: Math.round(manifest.defaultSize.width),
      height: Math.round(manifest.defaultSize.height),
    },
    props: readProps(manifest.propsSchema),
    roles: (manifest.dataBinding?.roles ?? []).map((role) => ({
      id: role.id,
      min: role.minFields,
      max: role.maxFields,
      // 显式绑定的字段闸按它校验字段类型（ADR-0114 S1 ③）；旧物料没声明就不带。
      ...(Array.isArray(role.valueTypes) ? { valueTypes: [...role.valueTypes] } : {}),
    })),
    events: readEvents(manifest),
    // 状态外观预置的键表（ADR-0115 D8）：从外观区读，规则在 core。
    statePreset: readDesignerStatePresetSource(manifest),
    defaults: {
      props: scalarOnly(manifest.defaultProps),
      style: scalarOnly(manifest.defaultStyle),
    },
    // 嵌套 object/array 参数不进浅层摘要，改由带注释的类型签名表达，模型无从编造字段名。
    stylePrompt: describeBaseScreenMaterialStyleForAi(manifest),
  };
}

/**
 * 物料事件（ADR-0115 D3）：manifest 的 `events` 是事件名清单，负载形状来自编辑器描述符里同名事件的
 * `payloadSchema`（只取顶层字段的形态）。没声明负载的事件照样列出：能触发显隐，不能带值筛选。
 */
function readEvents(
  manifest: BaseScreenMaterialManifest,
): NonNullable<AgentCatalogMaterialShape['events']> {
  const declared = manifest.editorDescriptor?.events ?? [];
  // 测试与宿主替身里的 manifest 可能不带 `events`：缺省当作没有事件。
  return (manifest.events ?? []).map((name) => {
    const descriptor = declared.find((event) => event.name === name);
    const payload: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'> = {};
    for (const [key, schema] of Object.entries(descriptor?.payloadSchema?.properties ?? {})) {
      const kind = schema.kind === 'enum' ? 'string' : schema.kind;
      if (
        kind === 'string' ||
        kind === 'number' ||
        kind === 'boolean' ||
        kind === 'object' ||
        kind === 'array'
      ) {
        payload[key] = kind;
      }
    }
    return {
      name,
      ...(descriptor?.label === undefined ? {} : { label: descriptor.label.slice(0, 40) }),
      payload,
    };
  });
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
    if (property.kind === 'string' || property.kind === 'number' || property.kind === 'boolean') {
      output[key] = { kind: property.kind };
      continue;
    }
    if (property.kind === 'enum') {
      // 只把字符串枚举带进提示词：数值/布尔枚举没法用「取值列表」表达，留给默认值。
      const values = (property.values ?? []).filter(
        (value): value is string => typeof value === 'string',
      );
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
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      output[key] = value;
      continue;
    }
    if (typeof value === 'boolean') output[key] = value;
  }
  return output;
}
