import type {
  ScreenAbortSignal,
  ScreenDatasetDefinition,
  ScreenHostDatasetPort,
  ScreenJsonObject,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import {
  enumerateScreenDataCandidates,
  profileScreenDataset,
  type ScreenCandidateMaterial,
  type ScreenDataCandidate,
  type ScreenDatasetProfile,
} from '@base-screen/core';
import type { IntentCatalog, IntentDataCandidate } from './intent-catalog.js';
import type { IntentReferenceDataset } from './intent-compile-types.js';
import type { IntentDiagnostic } from './intent-types.js';

/**
 * 从数据出发生成的数据上下文（ADR-0114 D1 / D2 / D3）：宿主前端按本轮引用的数据集
 * describe → 用默认参数取一份样本 → `core` 画像 → 枚举候选，把结果交给提示词与编译器。
 *
 * - 取数只经宿主的数据集端口，Base Screen 不直连数据源（上位设计 §2）；
 * - 必填又没有默认值的数据集不取样（运行时也取不到），画像只有 describe 部分，候选只剩明细；
 * - 单个数据集取样超时或失败不影响其他数据集，退为只有 describe 的画像并记 warning；
 * - 原始行不出这个函数：交给提示词的只有画像统计（D2）。
 */

export interface IntentDataContext {
  readonly profiles: readonly ScreenDatasetProfile[];
  /** 本轮候选表；块写 `candidate: 'c3'` 时据此展开（挂到目录的 `candidates` 上）。 */
  readonly candidates: readonly IntentDataCandidate[];
  /** 给编译器的引用：列带完整类型 / 名称 / 单位，参数带定义，行数取自画像。 */
  readonly references: readonly IntentReferenceDataset[];
  /**
   * 画像时取到的样本，键为 `intentDatasetQueryKey(datasetId, params)`。只留在宿主里：采纳前的样例验证
   * （`validateIntentData`）遇到同一组参数的实例直接复用，不再查一次；不进提示词，也不上送后端（D2）。
   */
  readonly samples: ReadonlyMap<string, ScreenTabularDataset>;
  readonly warnings: readonly IntentDiagnostic[];
}

/** 同一数据集 + 同一组参数的查询键：参数按名字排序，与声明顺序无关。 */
export function intentDatasetQueryKey(
  datasetId: string,
  params: Readonly<Record<string, ScreenJsonObject[string]>>,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((name) => [name, params[name]]);
  return JSON.stringify([datasetId, sorted]);
}

export interface PrepareIntentDataContextInput {
  readonly datasetIds: readonly string[];
  readonly port: ScreenHostDatasetPort;
  readonly catalog: IntentCatalog;
  readonly signal: ScreenAbortSignal;
  /** 单个数据集 describe + 取样的超时，缺省 3000ms（ADR-0114 D6）。 */
  readonly timeoutMs?: number;
  /** 每个数据集最多保留的候选数，缺省 12。 */
  readonly maxCandidatesPerDataset?: number;
}

/** 引用数据集的上限：超出的不画像（提示词膨胀，ADR-0114 §6）。 */
export const INTENT_MAX_REFERENCED_DATASETS = 4;

const ALL_VALUE_TYPES = ['string', 'number', 'boolean', 'date'] as const;

export async function prepareIntentDataContext(
  input: PrepareIntentDataContextInput,
): Promise<IntentDataContext> {
  const warnings: IntentDiagnostic[] = [];
  const ids = [...new Set(input.datasetIds)];
  if (ids.length > INTENT_MAX_REFERENCED_DATASETS) {
    warnings.push({
      severity: 'warning',
      code: 'AGENT_DATASETS_TRIMMED',
      path: '',
      message: `Only the first ${INTENT_MAX_REFERENCED_DATASETS} referenced datasets are profiled.`,
    });
  }
  // 各数据集并行取样；告警按引用顺序归并，结果不随网络先后变化。
  const perDataset = ids
    .slice(0, INTENT_MAX_REFERENCED_DATASETS)
    .map(() => [] as IntentDiagnostic[]);
  const settled = await Promise.all(
    ids
      .slice(0, INTENT_MAX_REFERENCED_DATASETS)
      .map((datasetId, index) => profileOne(datasetId, index, input, perDataset[index] ?? [])),
  );
  for (const list of perDataset) warnings.push(...list);
  const entries = settled.filter((entry): entry is ProfiledDataset => entry !== undefined);
  const profiles = entries.map((entry) => entry.profile);
  const candidates: ScreenDataCandidate[] = enumerateScreenDataCandidates(
    profiles,
    candidateMaterials(input.catalog),
    { maxPerDataset: input.maxCandidatesPerDataset ?? 12 },
  );
  const samples = new Map<string, ScreenTabularDataset>();
  for (const entry of entries) {
    if (entry.sample !== undefined) samples.set(entry.sample.key, entry.sample.value);
  }
  return {
    profiles,
    samples,
    candidates: candidates.map((item) => ({
      id: item.id,
      fact: item.fact,
      datasetId: item.datasetId,
      type: item.type,
      fields: item.fields,
    })),
    references: entries.map((entry) => toReference(entry.definition, entry.profile)),
    warnings,
  };
}

interface ProfiledDataset {
  readonly definition: ScreenDatasetDefinition;
  readonly profile: ScreenDatasetProfile;
  readonly sample?: { readonly key: string; readonly value: ScreenTabularDataset };
}

async function profileOne(
  datasetId: string,
  index: number,
  input: PrepareIntentDataContextInput,
  warnings: IntentDiagnostic[],
): Promise<ProfiledDataset | undefined> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (input.signal.aborted) abort();
  else input.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, input.timeoutMs ?? 3000);
  try {
    const described = await input.port.describe({ datasetId, signal: controller.signal });
    if (!described.ok) {
      warnings.push(datasetWarning('AGENT_DATASET_UNKNOWN', datasetId, 'describe failed'));
      return undefined;
    }
    const definition = described.value;
    const params: Record<string, ScreenJsonObject[string]> = {};
    let missing = false;
    for (const parameter of definition.parameters) {
      if (parameter.defaultValue !== undefined) params[parameter.name] = parameter.defaultValue;
      else if (parameter.required) {
        // 必填又没有默认值：有可选值时用第一个代为取样，只用来判字段形状与粒度（哪条产线都一样）；
        // 实例参数仍要用户指定，编译器照旧按缺参处理。没有可选值就无从代取，不取样。
        const stand = parameter.allowedValues?.[0];
        if (stand === undefined) missing = true;
        else params[parameter.name] = stand;
      }
    }
    if (missing) return { definition, profile: profileScreenDataset(definition) };
    let sample: ScreenTabularDataset | undefined;
    try {
      const queried = await input.port.query(
        { datasetId, dataSourceId: `agent-profile-${index + 1}`, params },
        { signal: controller.signal },
      );
      if (queried.ok) sample = queried.value;
    } catch {
      sample = undefined;
    }
    if (sample === undefined) {
      warnings.push(
        datasetWarning('AGENT_DATASET_SAMPLE_UNAVAILABLE', datasetId, 'sample query failed'),
      );
    }
    return {
      definition,
      profile: profileScreenDataset(definition, sample),
      ...(sample === undefined
        ? {}
        : { sample: { key: intentDatasetQueryKey(datasetId, params), value: sample } }),
    };
  } catch {
    warnings.push(datasetWarning('AGENT_DATASET_UNKNOWN', datasetId, 'describe failed'));
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function datasetWarning(code: string, datasetId: string, reason: string): IntentDiagnostic {
  return {
    severity: 'warning',
    code,
    path: '',
    message: `Dataset ${datasetId}: ${reason}.`,
    detail: { datasetId },
  };
}

/** 目录里能接数据的物料：表格类数据物料，以及带绑定角色的标量物料（文本读数）。外壳不算。 */
function candidateMaterials(catalog: IntentCatalog): ScreenCandidateMaterial[] {
  return catalog.materials
    .filter(
      (material) =>
        material.children !== true &&
        material.roles.length > 0 &&
        (material.data === 'tabular' || material.data === 'scalar'),
    )
    .map((material) => ({
      type: material.type,
      name: material.name,
      roles: material.roles.map((role) => ({
        id: role.id,
        minFields: role.min,
        maxFields: role.max,
        valueTypes: [...(role.valueTypes ?? ALL_VALUE_TYPES)],
      })),
    }));
}

function toReference(
  definition: ScreenDatasetDefinition,
  profile: ScreenDatasetProfile,
): IntentReferenceDataset {
  return {
    datasetId: definition.datasetId,
    name: definition.name,
    columns: definition.fields.map((field) => ({
      id: field.id,
      type: field.valueType,
      label: field.label,
      ...(field.unit === undefined ? {} : { unit: field.unit }),
    })),
    parameters: definition.parameters.map((parameter) => ({
      name: parameter.name,
      required: parameter.required,
      valueType: parameter.valueType,
      ...(parameter.defaultValue === undefined ? {} : { defaultValue: parameter.defaultValue }),
      ...(parameter.allowedValues === undefined
        ? {}
        : { allowedValues: [...parameter.allowedValues] }),
    })),
    ...(profile.sampled
      ? {
          rows: {
            sampled: profile.rows.sampled,
            ...(profile.rows.total === undefined ? {} : { total: profile.rows.total }),
          },
        }
      : {}),
  };
}

/**
 * 随数据集引用上送给后端写提示词的摘要（ADR-0114 S4）：只有画像统计与候选，没有原始行（D2）。
 * 宿主把它挂在对应的数据集引用上（`profile` / `candidates`），修复请求沿用同一份引用。
 */
export interface IntentDatasetPromptSummary {
  readonly datasetId: string;
  readonly profile: ScreenDatasetProfile;
  readonly candidates: readonly IntentDataCandidate[];
}

export function summarizeIntentDataContext(
  context: IntentDataContext,
): IntentDatasetPromptSummary[] {
  return context.profiles.map((profile) => ({
    datasetId: profile.datasetId,
    profile,
    candidates: context.candidates.filter((item) => item.datasetId === profile.datasetId),
  }));
}
