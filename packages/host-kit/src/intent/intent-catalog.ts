import type { ScreenJsonValue } from '@base-screen/contracts';

/**
 * 意图层看到的组件目录（ADR-0113 §2.1）。
 *
 * 纯 JSON 形状，`host-kit` 不认识物料契约：把设计器真实的 `BaseScreenMaterialCatalog` 变成这份形状
 * 是宿主的事（示例宿主的 `buildAgentCatalog`）。这样意图层不依赖 `plugin-core`，也不随物料契约变。
 */

/** 物料的取值形态：manifest 的 `staticData.kind`；没有 `staticData` 的物料记 `none`。 */
export type IntentCatalogData = 'tabular' | 'scalar' | 'none';

export interface IntentCatalogProp {
  readonly kind: 'string' | 'number' | 'boolean' | 'enum';
  readonly values?: readonly string[];
}

export interface IntentCatalogRole {
  readonly id: string;
  readonly min: number;
  readonly max: number;
}

export interface IntentCatalogMaterial {
  readonly type: string;
  readonly name: string;
  readonly category: string;
  readonly data: IntentCatalogData;
  /** manifest 的 `hostResourceSelection`：该物料能被素材身份直接赋值。 */
  readonly asset: boolean;
  readonly size: { readonly width: number; readonly height: number };
  readonly props: Readonly<Record<string, IntentCatalogProp>>;
  readonly roles: readonly IntentCatalogRole[];
  readonly defaults: {
    readonly props: Readonly<Record<string, ScreenJsonValue>>;
    readonly style: Readonly<Record<string, ScreenJsonValue>>;
  };
}

export interface IntentCatalogAsset {
  readonly id: string;
  readonly name: string;
}

export interface IntentCatalog {
  readonly materials: readonly IntentCatalogMaterial[];
  readonly assets: readonly IntentCatalogAsset[];
}
