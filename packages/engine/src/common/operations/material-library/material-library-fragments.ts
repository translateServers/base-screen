// 物料库分片条目（ADR-0100）：宿主 `materialLibraryFragments` 的失败关闭解析，以及
// 「宿主分片 + 插件 fragment 贡献」对当前 catalog 的一致性试运行。
//
// 形状错误是宿主/插件的编程错误，解析期失败关闭；试运行失败只与 catalog 有关（物料缺失、
// 被隐藏、默认值不再满足 schema），因此只隐藏该分片并产出 warning 诊断，不让整个物料库失败。

import {
  parseScreenDocument,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import {
  type BaseScreenFragmentBody,
  type BaseScreenFragmentDefinition,
  type BaseScreenMaterialCatalog,
  parseBaseScreenFragmentDefinition,
} from '@base-screen/plugin-core';
import { createBaseScreenComponentFragmentTransaction } from '../material-component/material-component-fragment.js';

/** 物料库卡片键前缀：分片与物料条目共用收藏/最近使用集合，前缀保证两个命名空间不相撞。 */
export const MATERIAL_LIBRARY_FRAGMENT_KEY_PREFIX = 'fragment:' as const;

const MAX_HOST_FRAGMENTS = 512;
// 试运行画布取文档契约允许的最大边长：只验证「能否按 catalog 展开」，真正插入时仍按目标文档画布失败关闭。
const TRIAL_CANVAS_EXTENT = 100_000;

export interface BaseScreenFragmentWireframeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly shell: boolean;
}

/** 缺省封面：试运行展开后的节点几何（以包围盒左上角为原点）。 */
export interface BaseScreenFragmentWireframe {
  readonly width: number;
  readonly height: number;
  readonly boxes: readonly BaseScreenFragmentWireframeBox[];
}

export interface BaseScreenResolvedFragmentLibraryItem {
  /** 分片 id（F7：跨构建稳定）。 */
  readonly id: string;
  /** 物料库卡片键：`fragment:<id>`，收藏、最近使用与卡片筛选都按它区分。 */
  readonly key: string;
  readonly fragment: BaseScreenFragmentDefinition;
  /** 外壳与节点引用的物料类型（去重、声明顺序），用于不可用状态投影。 */
  readonly materialTypes: readonly string[];
  readonly wireframe: BaseScreenFragmentWireframe;
}

export interface BaseScreenFragmentLibraryResolution {
  readonly items: readonly BaseScreenResolvedFragmentLibraryItem[];
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export function materialLibraryFragmentKey(fragmentId: string): string {
  return `${MATERIAL_LIBRARY_FRAGMENT_KEY_PREFIX}${fragmentId}`;
}

/** 宿主分片列表：逐条走分片定义的唯一解析器，id 在列表内唯一。 */
export function parseBaseScreenMaterialLibraryFragments(
  input: unknown,
): ScreenParseResult<readonly BaseScreenFragmentDefinition[]> {
  if (!Array.isArray(input)) {
    return failure([], 'Material library fragments must be an array.');
  }
  if (input.length > MAX_HOST_FRAGMENTS) {
    return failure(
      [],
      `Material library fragments must contain at most ${MAX_HOST_FRAGMENTS} entries.`,
    );
  }
  const diagnostics: ScreenDiagnostic[] = [];
  const identities = new Set<string>();
  const fragments: BaseScreenFragmentDefinition[] = [];
  for (const [index, candidate] of input.entries()) {
    const parsed = parseBaseScreenFragmentDefinition(candidate);
    if (!parsed.ok) {
      diagnostics.push(
        ...parsed.diagnostics.map((item) => ({ ...item, path: [index, ...item.path] })),
      );
      continue;
    }
    if (identities.has(parsed.value.id)) {
      diagnostics.push(diagnostic([index, 'id'], 'Material library fragment id must be unique.'));
      continue;
    }
    identities.add(parsed.value.id);
    fragments.push(parsed.value);
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, value: Object.freeze(fragments), diagnostics: [] };
}

/**
 * 宿主分片在前、插件贡献在后（声明顺序）；同 id 只保留第一份。每份分片在空文档上试运行一次，
 * 与插入走同一个事务构建器——能出现在物料库里的分片，就一定能插进同一 catalog 的文档。
 */
export function resolveBaseScreenFragmentLibraryItems(input: {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly hostFragments?: readonly BaseScreenFragmentDefinition[];
  readonly pluginFragments?: readonly BaseScreenFragmentDefinition[];
}): BaseScreenFragmentLibraryResolution {
  const diagnostics: ScreenDiagnostic[] = [];
  const items: BaseScreenResolvedFragmentLibraryItem[] = [];
  const identities = new Set<string>();
  const candidates = [...(input.hostFragments ?? []), ...(input.pluginFragments ?? [])];
  for (const candidate of candidates) {
    const fragment = projectFragmentDefinition(candidate);
    if (identities.has(fragment.id)) {
      diagnostics.push(
        warning(
          ['fragments', fragment.id],
          `Fragment "${fragment.id}" is declared more than once; only the first declaration is listed.`,
          'PLUGIN_CORE_LIFECYCLE_INVALID',
        ),
      );
      continue;
    }
    identities.add(fragment.id);
    const document = trialDocument();
    const built = createBaseScreenComponentFragmentTransaction({
      document,
      catalog: input.catalog,
      intent: fragmentBody(fragment),
      anchor: { x: 0, y: 0 },
    });
    // 事务构建只校验物料与 schema；展开结果再按整份文档校验一次（数据源引用、蓝图关系的形状与
    // 端点、环判定），与真正插入后 Core 的判定同一口径。
    const trial = built.ok
      ? validateTrialDocument(document, built.value.transaction, built)
      : built;
    if (!trial.ok) {
      diagnostics.push(
        ...trial.diagnostics.map((item) =>
          warning(
            ['fragments', fragment.id, ...item.path],
            `Fragment "${fragment.id}" is hidden from the material library: ${item.message}`,
            item.code,
          ),
        ),
      );
      continue;
    }
    const components = trial.value.transaction.commands.flatMap((command) =>
      command.type === 'add-component' ? [command.component] : [],
    );
    const shellId = fragment.shell === undefined ? undefined : trial.value.componentIds[0];
    items.push(
      Object.freeze({
        id: fragment.id,
        key: materialLibraryFragmentKey(fragment.id),
        fragment,
        materialTypes: Object.freeze([...new Set(components.map((component) => component.type))]),
        wireframe: wireframeOf(components, shellId),
      }),
    );
  }
  return { items: Object.freeze(items), diagnostics };
}

/** 分片定义里与插入意图同构的组合部分（不含物料库展示信息）。 */
export function fragmentBody(fragment: BaseScreenFragmentBody): BaseScreenFragmentBody {
  return {
    ...(fragment.shell === undefined ? {} : { shell: fragment.shell }),
    nodes: fragment.nodes,
    ...(fragment.dataSources === undefined ? {} : { dataSources: fragment.dataSources }),
    ...(fragment.blueprint === undefined ? {} : { blueprint: fragment.blueprint }),
  };
}

function validateTrialDocument<T>(
  document: ScreenDocument,
  transaction: ScreenDocumentTransaction,
  built: ScreenParseResult<T>,
): ScreenParseResult<T> {
  let candidate: ScreenDocument = document;
  for (const command of transaction.commands) {
    if (command.type === 'add-component') {
      candidate = { ...candidate, components: [...candidate.components, command.component] };
    } else if (command.type === 'replace-data-sources') {
      candidate = { ...candidate, dataSources: command.dataSources };
    } else if (command.type === 'replace-blueprint') {
      candidate = { ...candidate, blueprint: command.blueprint };
    }
  }
  const parsed = parseScreenDocument(candidate);
  return parsed.ok ? built : { ok: false, diagnostics: parsed.diagnostics };
}

function projectFragmentDefinition(
  candidate: BaseScreenFragmentDefinition,
): BaseScreenFragmentDefinition {
  // 插件贡献带 `kind` 等清单字段；物料库只保留分片定义本身，避免把贡献外形泄露给宿主。
  return Object.freeze({
    id: candidate.id,
    name: candidate.name,
    category: candidate.category,
    keywords: candidate.keywords,
    ...(candidate.cover === undefined ? {} : { cover: candidate.cover }),
    ...fragmentBody(candidate),
  });
}

function wireframeOf(
  components: readonly {
    readonly id: string;
    readonly position: { readonly x: number; readonly y: number };
    readonly size: { readonly width: number; readonly height: number };
  }[],
  shellId: string | undefined,
): BaseScreenFragmentWireframe {
  const left = Math.min(...components.map((component) => component.position.x));
  const top = Math.min(...components.map((component) => component.position.y));
  const right = Math.max(
    ...components.map((component) => component.position.x + component.size.width),
  );
  const bottom = Math.max(
    ...components.map((component) => component.position.y + component.size.height),
  );
  return Object.freeze({
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    boxes: Object.freeze(
      components.map((component) =>
        Object.freeze({
          x: component.position.x - left,
          y: component.position.y - top,
          width: component.size.width,
          height: component.size.height,
          shell: component.id === shellId,
        }),
      ),
    ),
  });
}

function trialDocument(): ScreenDocument {
  return {
    canvas: { width: TRIAL_CANVAS_EXTENT, height: TRIAL_CANVAS_EXTENT, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function warning(
  path: ScreenDiagnostic['path'],
  message: string,
  code: ScreenDiagnostic['code'],
): ScreenDiagnostic {
  return { severity: 'warning', code, path, message };
}

function failure<T>(path: ScreenDiagnostic['path'], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(path, message)] };
}

function diagnostic(path: ScreenDiagnostic['path'], message: string): ScreenDiagnostic {
  return { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path, message };
}
