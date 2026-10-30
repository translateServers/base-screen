import type { ScreenHostDatasetPort } from './dataset-port.js';
import type { ScreenParseResult } from './diagnostics.js';
import type { ScreenDocument } from './document.js';
import type { ScreenProjectEnvelope } from './envelope.js';
import type { ScreenResourceExecutionContext } from './execution.js';
import type { ScreenJsonValue } from './json.js';
import type { ScreenHostCatalogDescriptor, ScreenHostCatalogPage } from './variable.js';

export interface ScreenProjectLoadRequest {
  readonly projectId: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectSaveRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly document: ScreenDocument;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectPublishRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectAdapter {
  readonly capabilities: { readonly publish: boolean };
  load(request: ScreenProjectLoadRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  save(request: ScreenProjectSaveRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  publish?(request: ScreenProjectPublishRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
}

export interface ScreenDesignerHostCapabilities {
  readonly projectCatalog: boolean;
  readonly projectPreview: boolean;
  readonly projectSnapshots: boolean;
  readonly resources: boolean;
  readonly datasets: boolean;
  /** 来源目录：`host-catalog` 与 `url-query` 两种来源共用这一个端口。 */
  readonly hostCatalog: boolean;
  readonly actions: boolean;
}

export interface ScreenDesignerHostAdapter {
  readonly capabilities: ScreenDesignerHostCapabilities;
  readonly projectCatalog?: ScreenProjectCatalogPort;
  readonly projectPreview?: ScreenProjectPreviewPort;
  readonly projectSnapshots?: ScreenProjectSnapshotPort;
  readonly resources?: ScreenHostResourcePort;
  readonly datasets?: ScreenHostDatasetPort;
  readonly hostCatalog?: ScreenHostCatalogPort;
  readonly actions?: ScreenBlueprintHostActionPort;
}

export interface ScreenProjectSummary {
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly revision: string;
  readonly published: boolean;
}

export interface ScreenProjectCatalogRequest {
  readonly query: string;
  readonly published: boolean | undefined;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectCreateRequest {
  readonly name: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectCloneRequest {
  readonly projectId: string;
  readonly name: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectDeleteRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectImportRequest {
  readonly name: string;
  readonly document: ScreenDocument;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectExportRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectCatalogPort {
  list(
    request: ScreenProjectCatalogRequest,
  ): Promise<ScreenParseResult<readonly ScreenProjectSummary[]>>;
  create(request: ScreenProjectCreateRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  clone(request: ScreenProjectCloneRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  delete(request: ScreenProjectDeleteRequest): Promise<ScreenParseResult<void>>;
  import(request: ScreenProjectImportRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  export(request: ScreenProjectExportRequest): Promise<ScreenParseResult<ScreenDocument>>;
}

export interface ScreenProjectPreviewRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly published: boolean;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectPreview {
  readonly label: string;
  readonly document: ScreenDocument;
}

export interface ScreenProjectPreviewPort {
  load(request: ScreenProjectPreviewRequest): Promise<ScreenParseResult<ScreenProjectPreview>>;
}

export interface ScreenProjectSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface ScreenProjectSnapshotCreateRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly name: string;
  readonly document: ScreenDocument;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectSnapshotPort {
  list(
    projectId: string,
    signal: ScreenAbortSignal,
  ): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>>;
  create(
    request: ScreenProjectSnapshotCreateRequest,
  ): Promise<ScreenParseResult<ScreenProjectSnapshot>>;
  restore(
    projectId: string,
    snapshotId: string,
    signal: ScreenAbortSignal,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  delete(
    projectId: string,
    snapshotId: string,
    signal: ScreenAbortSignal,
  ): Promise<ScreenParseResult<void>>;
}

export interface ScreenHostResourceRequest {
  /** 请求身份：文档级数据源实例 id。 */
  readonly dataSourceId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params: Readonly<Record<string, import('./json.js').ScreenJsonValue>>;
}

export interface ScreenAbortSignal {
  readonly aborted: boolean;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
}

export interface ScreenHostResourceResolveOptions {
  readonly signal: ScreenAbortSignal;
  /** 非持久化执行上下文（DRH-R8）：按次解析提供，不写入 ScreenDocument。 */
  readonly context?: ScreenResourceExecutionContext;
}

export interface ScreenHostResourcePort {
  resolve(
    request: ScreenHostResourceRequest,
    options: ScreenHostResourceResolveOptions,
  ): Promise<ScreenParseResult<ScreenJsonValue>>;
}

/** 意图通道的作用域：整屏，或画布上选中的组件集合。 */
export type ScreenIntentScope =
  | { readonly kind: 'screen' }
  | { readonly kind: 'components'; readonly componentIds: readonly string[] };

/**
 * 可被意图引用的实体类别。
 *
 * 引擎只认这两个枚举值，不解析 id 语义、不发请求——素材与数据集的目录由宿主端口提供，
 * 引擎负责选择器、chip 与结构化上送。
 */
export type ScreenIntentReferenceKind = 'asset' | 'dataset';

/**
 * 选择器里的一行。**只用于 UI**：不进 `ScreenIntentRequest`，更不会写进文档。
 *
 * `thumbnailUrl` 是瞬态展示数据（素材没有缩略图端点，宿主通常直接给内容地址），
 * 引擎只把它当 `<img src>` 用，不校验、不拼接、不落库。
 */
export interface ScreenIntentReferenceOption {
  readonly kind: ScreenIntentReferenceKind;
  /** 素材是 assetId，数据集是 datasetId。 */
  readonly id: string;
  readonly label: string;
  readonly note?: string;
  /** 数据集分组，用于选择器分段。 */
  readonly groupId?: string;
  readonly thumbnailUrl?: string;
}

/**
 * 引用目录端口：**分页 + 查询**，不要指望引擎本地过滤。
 *
 * 宿主素材动辄上千，一次性全量返回会让选择器首帧就渲染几千行。
 * 引擎首屏只取 `limit` 条，输入关键字时带 `query` 重新查，滚到底带 `offset` 取下一页。
 */
export interface ScreenIntentReferenceCatalogRequest {
  readonly kinds: readonly ScreenIntentReferenceKind[];
  /** 关键字；空串表示不筛。由宿主决定搜名称还是搜说明。 */
  readonly query?: string;
  /** 本页条数上限；引擎默认 20。 */
  readonly limit?: number;
  /** 跳过前 N 条（含已加载的）。 */
  readonly offset?: number;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenIntentReferenceCatalogPage {
  readonly items: readonly ScreenIntentReferenceOption[];
  /** 匹配 `query` 的总条数；宿主不知道时可以省略，此时引擎只按「本页是否满」判断还有没有下一页。 */
  readonly total?: number;
}

export interface ScreenIntentReferenceCatalogPort {
  catalog(
    request: ScreenIntentReferenceCatalogRequest,
  ): Promise<ScreenParseResult<ScreenIntentReferenceCatalogPage>>;
}

/**
 * 提交时携带的引用。字段按类别分开命名（`assetId` / `datasetId`）而不是通用 `id`：
 * 判别联合里同名会让「给错 id」在类型上失声。
 */
export type ScreenIntentReference =
  | { readonly kind: 'asset'; readonly assetId: string; readonly name?: string }
  | { readonly kind: 'dataset'; readonly datasetId: string; readonly name?: string };

/**
 * 一次意图提交：引擎只负责把「一句话 + 作用域 + 引用」结构化后交给宿主。
 * 不含模型、凭证或传输配置——这些都在宿主侧。
 */
export interface ScreenIntentRequest {
  readonly instanceId: string;
  readonly text: string;
  readonly scope: ScreenIntentScope;
  readonly startsFrom?: 'metrics' | 'template' | 'prompt';
  /** 用户显式引用的素材与数据集；没有引用时整键省略。 */
  readonly references?: readonly ScreenIntentReference[];
}

/**
 * 目标屏的物理呈现参数：由宿主（现场校准或平台资产库）提供，引擎只据此叠加标尺。
 * 它不写入 Screen Document——分辨率与拼接是渲染/校验输入，不是画布内容。
 */
export interface ScreenTargetDisplayProfile {
  readonly columns: number;
  readonly rows: number;
  /** 拼接缝宽（逻辑像素），只用于叠加显示。 */
  readonly seamPx?: number;
  /** 安全区内缩（逻辑像素）。 */
  readonly safeAreaPx?: number;
  /** 观距（米），用于 3m 视角的标注。 */
  readonly viewingDistanceM?: number;
  /** LED 点间距（毫米）：把逻辑像素换算成物理尺寸的唯一依据。 */
  readonly pixelPitchMm?: number;
  /** 屏体亮度（cd/m²）。只作为验收输入展示，引擎不做亮度渲染。 */
  readonly brightnessCdM2?: number;
  /** 现场环境照度（lux）。与亮度一起判断是否需要调高对比度。 */
  readonly ambientLux?: number;
}

export interface ScreenHostCatalogListRequest {
  readonly query: string;
  readonly cursor?: string;
  readonly limit: number;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenHostCatalogDescribeRequest {
  readonly sourceId: string;
  readonly signal: ScreenAbortSignal;
}

/** 按来源目录项解析当前值；参数与运行时一致，由文档级实例提供。 */
export interface ScreenHostCatalogResolveRequest {
  readonly sourceId: string;
  readonly params: Readonly<Record<string, ScreenJsonValue>>;
  readonly purpose: 'runtime' | 'authoring-preview';
  readonly signal: ScreenAbortSignal;
}

/** 来源目录：`host-catalog` 与 `url-query` 的唯一致值通道。 */
export interface ScreenHostCatalogPort {
  list(request: ScreenHostCatalogListRequest): Promise<ScreenParseResult<ScreenHostCatalogPage>>;
  describe(
    request: ScreenHostCatalogDescribeRequest,
  ): Promise<ScreenParseResult<ScreenHostCatalogDescriptor>>;
  resolve(request: ScreenHostCatalogResolveRequest): Promise<ScreenParseResult<ScreenJsonValue>>;
}

export interface ScreenBlueprintHostEvent {
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface ScreenBlueprintRuntimePort {
  emit(event: ScreenBlueprintHostEvent): void | Promise<void>;
}

export interface ScreenBlueprintHostActionPort {
  execute(action: ScreenBlueprintHostEvent): void | Promise<void>;
}

export function validateScreenDesignerHostAdapter(
  input: unknown,
): ScreenParseResult<ScreenDesignerHostAdapter> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return invalidDesignerHostAdapter('Designer host adapter must be an object.');
  }
  const adapter = input as Record<string, unknown>;
  const capabilities = adapter.capabilities;
  if (capabilities === null || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    return invalidDesignerHostAdapter('Designer host capabilities must be an object.');
  }
  const capabilityRecord = capabilities as Record<string, unknown>;
  const checks = [
    ['projectCatalog', 'projectCatalog', ['list', 'create', 'clone', 'delete', 'import', 'export']],
    ['projectPreview', 'projectPreview', ['load']],
    ['projectSnapshots', 'projectSnapshots', ['list', 'create', 'restore', 'delete']],
    ['resources', 'resources', ['resolve']],
    ['datasets', 'datasets', ['list', 'describe', 'query']],
    ['hostCatalog', 'hostCatalog', ['list', 'describe', 'resolve']],
    ['actions', 'actions', ['execute']],
  ] as const;
  for (const [capability, port, methods] of checks) {
    if (typeof capabilityRecord[capability] !== 'boolean') {
      return invalidDesignerHostAdapter(
        `Designer host capability "${capability}" must be boolean.`,
      );
    }
    const portValue = adapter[port];
    const hasValidPort =
      portValue !== null &&
      typeof portValue === 'object' &&
      methods.every(
        (method) => typeof (portValue as Record<string, unknown>)[method] === 'function',
      );
    if (
      (capabilityRecord[capability] === true && !hasValidPort) ||
      (capabilityRecord[capability] === false && portValue !== undefined)
    ) {
      return invalidDesignerHostAdapter(
        `Designer host capability "${capability}" does not match its port.`,
      );
    }
  }
  return { ok: true, value: adapter as unknown as ScreenDesignerHostAdapter, diagnostics: [] };
}

function invalidDesignerHostAdapter(message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'PROJECT_ADAPTER_INVALID', path: [], message }],
  };
}
