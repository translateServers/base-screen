import {
  isScreenMaterialType,
  parseScreenDocument,
  parseScreenJsonValue,
  type ScreenComponentDataSource,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenSize,
} from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
  parseBaseScreenMaterialManifest,
} from '@base-screen/plugin-core';

export interface BaseScreenMaterialLibraryItem {
  /** 宿主侧稳定条目身份；收藏、最近使用与拖拽均按此区分。 */
  readonly id: string;
  /** 运行时仍由不可变 catalog 中的 canonical material type 提供。 */
  readonly materialType: string;
  readonly name?: string;
  readonly category?: string;
  readonly keywords?: readonly string[];
  readonly cover?: string;
  readonly defaultSize?: ScreenSize;
  /** 与 Manifest 默认值浅合并后再按 propsSchema 失败关闭校验。 */
  readonly defaultProps?: ScreenJsonObject;
  /** 与 Manifest 默认值浅合并后再按 styleSchema 失败关闭校验。 */
  readonly defaultStyle?: ScreenJsonObject;
  readonly defaultData?: ScreenJsonValue;
  /** 新实例的数据源模板；显式提供时优先于 Manifest.defaultData。 */
  readonly defaultDataSource?: ScreenComponentDataSource | null;
}

export interface BaseScreenResolvedMaterialLibraryItem {
  readonly id: string;
  readonly materialType: string;
  readonly manifest: BaseScreenMaterialManifest;
  readonly defaultDataSource?: ScreenComponentDataSource | null;
}

const ITEM_FIELDS = new Set([
  'id',
  'materialType',
  'name',
  'category',
  'keywords',
  'cover',
  'defaultSize',
  'defaultProps',
  'defaultStyle',
  'defaultData',
  'defaultDataSource',
]);
const ITEM_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const MAX_ITEMS = 2_048;

export function parseBaseScreenMaterialLibraryItems(
  input: unknown,
): ScreenParseResult<readonly BaseScreenMaterialLibraryItem[]> {
  const parsed = parseScreenJsonValue(input);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) return failure([], 'Material library items must be an array.');
  if (parsed.value.length > MAX_ITEMS) {
    return failure([], `Material library items must contain at most ${MAX_ITEMS} entries.`);
  }

  const diagnostics: ScreenDiagnostic[] = [];
  const identities = new Set<string>();
  const items: BaseScreenMaterialLibraryItem[] = [];
  for (const [index, candidate] of parsed.value.entries()) {
    if (!isRecord(candidate)) {
      diagnostics.push(diagnostic([index], 'Material library item must be an object.'));
      continue;
    }
    for (const field of Object.keys(candidate)) {
      if (!ITEM_FIELDS.has(field)) {
        diagnostics.push(
          diagnostic([index, field], 'Material library item contains an unknown field.'),
        );
      }
    }
    const id = candidate.id;
    if (typeof id !== 'string' || !ITEM_ID_PATTERN.test(id)) {
      diagnostics.push(diagnostic([index, 'id'], 'Material library item id is invalid.'));
    } else if (identities.has(id)) {
      diagnostics.push(diagnostic([index, 'id'], 'Material library item id must be unique.'));
    } else {
      identities.add(id);
    }
    if (!isScreenMaterialType(candidate.materialType)) {
      diagnostics.push(
        diagnostic([index, 'materialType'], 'Material library item type is not canonical.'),
      );
    }
    validateOptionalString(candidate, 'name', index, diagnostics);
    validateOptionalString(candidate, 'category', index, diagnostics);
    if (candidate.keywords !== undefined && !Array.isArray(candidate.keywords)) {
      diagnostics.push(
        diagnostic([index, 'keywords'], 'Material library item keywords must be an array.'),
      );
    }
    if (candidate.defaultProps !== undefined && !isRecord(candidate.defaultProps)) {
      diagnostics.push(
        diagnostic(
          [index, 'defaultProps'],
          'Material library item defaultProps must be an object.',
        ),
      );
    }
    if (candidate.defaultStyle !== undefined && !isRecord(candidate.defaultStyle)) {
      diagnostics.push(
        diagnostic(
          [index, 'defaultStyle'],
          'Material library item defaultStyle must be an object.',
        ),
      );
    }
    validateDefaultDataSource(candidate, index, diagnostics);
    if (
      typeof id === 'string' &&
      ITEM_ID_PATTERN.test(id) &&
      isScreenMaterialType(candidate.materialType)
    ) {
      items.push(candidate as unknown as BaseScreenMaterialLibraryItem);
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, value: deepFreeze(items), diagnostics: [] };
}

export function resolveBaseScreenMaterialLibraryItems(
  catalog: BaseScreenMaterialCatalog,
  configured?: readonly BaseScreenMaterialLibraryItem[],
): ScreenParseResult<readonly BaseScreenResolvedMaterialLibraryItem[]> {
  const visibleEntries = catalog.list().filter((entry) => entry.manifest.libraryVisible !== false);
  if (configured === undefined) {
    return {
      ok: true,
      value: Object.freeze(
        visibleEntries.map((entry) =>
          Object.freeze({
            id: entry.manifest.type,
            materialType: entry.manifest.type,
            manifest: entry.manifest,
          }),
        ),
      ),
      diagnostics: [],
    };
  }

  const diagnostics: ScreenDiagnostic[] = [];
  const coveredTypes = new Set<string>();
  const resolved: BaseScreenResolvedMaterialLibraryItem[] = [];
  for (const [index, item] of configured.entries()) {
    const entry = catalog.get(item.materialType);
    if (entry === undefined) {
      diagnostics.push(
        diagnostic([index, 'materialType'], 'Material library item references a missing type.'),
      );
      continue;
    }
    if (entry.manifest.libraryVisible === false) {
      diagnostics.push(
        diagnostic([index, 'materialType'], 'Material library item references a hidden type.'),
      );
      continue;
    }
    coveredTypes.add(item.materialType);
    const manifest = projectManifest(entry.manifest, item);
    if (!manifest.ok) {
      diagnostics.push(
        ...manifest.diagnostics.map((itemDiagnostic) => ({
          ...itemDiagnostic,
          path: [index, ...itemDiagnostic.path],
        })),
      );
      continue;
    }
    if (
      Object.hasOwn(item, 'defaultDataSource') &&
      item.defaultDataSource !== null &&
      !manifest.value.dataCapabilities.includes(item.defaultDataSource!.type)
    ) {
      diagnostics.push(
        diagnostic(
          [index, 'defaultDataSource'],
          'Material library item defaultDataSource is not supported by the material.',
        ),
      );
      continue;
    }
    resolved.push(
      Object.freeze({
        id: item.id,
        materialType: item.materialType,
        manifest: manifest.value,
        ...(Object.hasOwn(item, 'defaultDataSource')
          ? { defaultDataSource: item.defaultDataSource ?? null }
          : {}),
      }),
    );
  }

  for (const entry of visibleEntries) {
    if (!coveredTypes.has(entry.manifest.type)) {
      diagnostics.push(
        diagnostic(
          [],
          `Material library items are missing visible material type "${entry.manifest.type}".`,
        ),
      );
    }
  }
  return diagnostics.length === 0
    ? { ok: true, value: Object.freeze(resolved), diagnostics: [] }
    : { ok: false, diagnostics };
}

/** 创建条目实例时解析初始数据源；显式模板优先，未配置时保持 Manifest 兼容语义。 */
export function createInitialDataSourceForMaterialLibraryItem(
  item: BaseScreenResolvedMaterialLibraryItem,
): ScreenComponentDataSource | null {
  if (Object.hasOwn(item, 'defaultDataSource')) return item.defaultDataSource ?? null;
  return item.manifest.defaultData === undefined
    ? null
    : {
        type: 'static',
        value: item.manifest.defaultData,
        ...(item.manifest.staticData?.kind === 'tabular'
          ? { binding: item.manifest.staticData.defaultBinding }
          : {}),
      };
}

function projectManifest(
  manifest: BaseScreenMaterialManifest,
  item: BaseScreenMaterialLibraryItem,
): ScreenParseResult<BaseScreenMaterialManifest> {
  return parseBaseScreenMaterialManifest({
    ...manifest,
    ...(item.name === undefined ? {} : { name: item.name }),
    ...(item.category === undefined ? {} : { category: item.category }),
    ...(item.keywords === undefined ? {} : { keywords: item.keywords }),
    ...(item.cover === undefined ? {} : { cover: item.cover }),
    ...(item.defaultSize === undefined ? {} : { defaultSize: item.defaultSize }),
    defaultProps: { ...manifest.defaultProps, ...(item.defaultProps ?? {}) },
    defaultStyle: { ...manifest.defaultStyle, ...(item.defaultStyle ?? {}) },
    ...(Object.hasOwn(item, 'defaultData') ? { defaultData: item.defaultData } : {}),
  });
}

function validateOptionalString(
  item: Record<string, ScreenJsonValue>,
  field: 'name' | 'category',
  index: number,
  diagnostics: ScreenDiagnostic[],
): void {
  const value = item[field];
  if (
    value !== undefined &&
    (typeof value !== 'string' || value.length === 0 || [...value].length > 256)
  ) {
    diagnostics.push(
      diagnostic([index, field], `Material library item ${field} must be a display string.`),
    );
  }
}

function validateDefaultDataSource(
  item: Record<string, ScreenJsonValue>,
  index: number,
  diagnostics: ScreenDiagnostic[],
): void {
  if (!Object.hasOwn(item, 'defaultDataSource')) return;
  const parsed = parseScreenDocument({
    canvas: { width: 1, height: 1, backgroundColor: '#000000' },
    components: [
      {
        id: 'library-item',
        type: 'base.placeholder',
        name: 'Library item',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: item.defaultDataSource,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  });
  if (parsed.ok) return;
  diagnostics.push(
    ...parsed.diagnostics.map((source) => ({
      ...source,
      path: [index, 'defaultDataSource'],
      code: 'PLUGIN_CORE_LIFECYCLE_INVALID' as const,
      message: 'Material library item defaultDataSource is invalid.',
    })),
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, ScreenJsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure<T>(path: readonly (string | number)[], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(path, message)] };
}

function diagnostic(path: readonly (string | number)[], message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
    path,
    message,
  };
}
