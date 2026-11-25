/** 组件库（ADR-0106）的后端形状。规格、渲染代码与分片定义只存储、不执行，权威校验在宿主前端。 */
export interface ComponentDraftShape {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  /** 规格模块源码（ADR-0105 §2.4 的在线包格式）。 */
  readonly source: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ComponentFragmentShape {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** 完整分片定义（BaseScreenFragmentDefinition）。 */
  readonly definition: Readonly<Record<string, unknown>>;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ComponentScreenReference {
  readonly id: string;
  readonly name: string;
}

export const MAX_COMPONENT_SOURCE_BYTES = 200 * 1024;
/** 与 plugin-core 的分片 JSON 上限一致（64 KiB 字符），留出元数据余量。 */
export const MAX_FRAGMENT_DEFINITION_BYTES = 96 * 1024;
