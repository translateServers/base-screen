import {
  isScreenMaterialType,
  type ScreenComponentDataSource,
  type ScreenComponentNode,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenPosition,
} from '@base-screen/contracts';
import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { roundScreenGeometry } from '../element/designer-geometry.js';

/**
 * 由物料 manifest 构造组件节点的唯一实现。
 *
 * 在此之前，同一段「manifest → ScreenComponentNode」在物料库拖放、工具绘制、面板点击添加与
 * 分组创建里各写了一遍，`nextComponentId` 更是复制了五份。宿主也正因此无法程序化创建实例——
 * 公开入口只有 `executeCommand({type:'add-component'})`，调用方必须自己把 manifest 的默认值
 * 重新展开一遍。这里收敛成一处，供内部各路径与 `insertComponent` 公开 API 共用。
 */

const INSERTION_INTENT_FIELDS = new Set(['materialType', 'name', 'position']);
const POSITION_FIELDS = new Set(['x', 'y']);
const MAX_INSERTION_NAME_CODE_POINTS = 256;

export interface BaseScreenComponentInsertionIntent {
  readonly materialType: string;
  /** 省略时用 manifest.name。 */
  readonly name?: string;
  /** 省略时由调用方决定位置（公开 API 取画布中心）。 */
  readonly position?: ScreenPosition;
}

/**
 * 初始数据源来自 `defaultData`：tabular 物料额外带上默认绑定，其余为纯静态值。
 * 没有 `defaultData` 的物料初始无数据源，与物料库拖放行为一致。
 */
export function createInitialMaterialDataSource(
  manifest: BaseScreenMaterialManifest | undefined,
): ScreenComponentDataSource | null {
  return manifest?.defaultData === undefined
    ? null
    : {
        type: 'static',
        value: manifest.defaultData,
        ...(manifest.staticData?.kind === 'tabular'
          ? { binding: manifest.staticData.defaultBinding }
          : {}),
      };
}

/** 生成不与文档现有 id 冲突的组件 id：`<type 归一化>-<序号>`。 */
export function nextMaterialComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

export interface MaterialComponentPlacement {
  readonly position: ScreenPosition;
  readonly name?: string;
  readonly dataSource?: ScreenComponentDataSource | null;
}

/**
 * 按 manifest 默认值构造节点。位置由调用方给出且不做画布裁剪——拖放/绘制路径自行处理吸附与
 * 边界，公开 API 与宿主资源路径另外经 {@link clipMaterialPositionToCanvas} 收进画布。
 */
export function createMaterialComponent(
  document: ScreenDocument,
  manifest: BaseScreenMaterialManifest,
  placement: MaterialComponentPlacement,
): ScreenComponentNode {
  return {
    id: nextMaterialComponentId(document, manifest.type),
    type: manifest.type,
    name: placement.name ?? manifest.name,
    parentId: null,
    position: placement.position,
    size: manifest.defaultSize,
    rotation: 0,
    zIndex:
      document.components.reduce((maximum, component) => Math.max(maximum, component.zIndex), -1) +
      1,
    status: { locked: false, hidden: false },
    props: manifest.defaultProps,
    style: manifest.defaultStyle,
    dataSource:
      placement.dataSource === undefined
        ? createInitialMaterialDataSource(manifest)
        : placement.dataSource,
  };
}

/** 把位置与尺寸收进画布范围；超出右/下边界时贴边而不是溢出。 */
export function clipMaterialPositionToCanvas(
  document: ScreenDocument,
  manifest: BaseScreenMaterialManifest,
  position: ScreenPosition,
): ScreenPosition {
  return {
    x: roundScreenGeometry(
      Math.max(
        0,
        Math.min(position.x, Math.max(0, document.canvas.width - manifest.defaultSize.width)),
      ),
    ),
    y: roundScreenGeometry(
      Math.max(
        0,
        Math.min(position.y, Math.max(0, document.canvas.height - manifest.defaultSize.height)),
      ),
    ),
  };
}

export function parseBaseScreenComponentInsertionIntent(
  input: unknown,
): ScreenParseResult<BaseScreenComponentInsertionIntent> {
  if (!isRecord(input) || !hasExactKeys(input, INSERTION_INTENT_FIELDS)) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Component insertion intent must be a strict object.',
    );
  }
  if (!isScreenMaterialType(input.materialType)) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Component insertion materialType must be a canonical material type.',
      ['materialType'],
    );
  }
  if (input.name !== undefined && !isBoundedName(input.name)) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      `Component name must contain 1 to ${MAX_INSERTION_NAME_CODE_POINTS} code points without control characters.`,
      ['name'],
    );
  }
  const position = parseInsertionPosition(input.position);
  if (position !== undefined && 'diagnostics' in position) return position;
  return {
    ok: true,
    value: {
      materialType: input.materialType,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(position === undefined ? {} : { position }),
    },
    diagnostics: [],
  };
}

/** 返回收窄后的坐标；非法时返回失败结果；缺省时返回 undefined。 */
function parseInsertionPosition(
  value: unknown,
): ScreenPosition | ScreenParseResult<never> | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, POSITION_FIELDS) ||
    !isFiniteCoordinate(value.x) ||
    !isFiniteCoordinate(value.y)
  ) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Component insertion position must be finite canvas coordinates.',
      ['position'],
    );
  }
  return { x: value.x, y: value.y };
}

/**
 * 失败关闭：物料必须存在于已配置目录、不是隐藏物料，且带默认尺寸/属性/样式——
 * 三者是构造节点的最小前提，缺失时明确报错而不是产出半成品节点。
 */
export function validateInsertableMaterial(
  manifest: BaseScreenMaterialManifest | undefined,
  intent: BaseScreenComponentInsertionIntent,
): ScreenParseResult<BaseScreenMaterialManifest> {
  if (
    manifest === undefined ||
    manifest.type !== intent.materialType ||
    manifest.libraryVisible === false
  ) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Component material is not available in the configured catalog.',
      ['materialType'],
    );
  }
  return { ok: true, value: manifest, diagnostics: [] };
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoundedName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /\S/.test(value) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    [...value].length <= MAX_INSERTION_NAME_CODE_POINTS
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
