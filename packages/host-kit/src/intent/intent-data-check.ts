import type {
  ScreenAbortSignal,
  ScreenHostDatasetPort,
  ScreenJsonValue,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import type { IntentDataContext } from './intent-data-context.js';
import { intentDatasetQueryKey } from './intent-data-context.js';
import type { IntentRepairIssue } from './intent-prepare.js';

/**
 * 采纳前的样例验证（ADR-0114 D6 / S5）：提案挂出之前，对候选文档里每个数据集实例取一次数，
 * 检查绑在它上面的组件能不能显示出东西。
 *
 * - 结果：`(datasetId, params)` 与画像取样相同的直接用画像样本，不同的（例如模型照用户说法换了产线）
 *   查询一次，各实例并行，单次超时缺省 3 秒；
 * - 检查：绑定字段不在结果里 `DATA_FIELD_ABSENT`；绑定字段在结果里全为空 `DATA_FIELD_ALL_NULL`；
 *   指标卡的结果多于一行 `AGENT_KPI_MULTI_ROW`。诊断路径取来源表里的模型原文路径，交给修复回环（模型可以换候选）；
 * - 结果为空**不进修复**（ADR-0114 §8.7 选 B）：可能只是用户指定的条件下暂时没有数据（例如某条产线 0 台设备），
 *   请模型「换个参数」等于替用户改掉条件，违背 D5。记进 `empty`，提案理由说明「按当前条件暂无数据」；
 * - 查询本身失败（宿主报错、超时）不是模型的错，不进修复：记进 `unverified`，提案理由如实说明。
 *
 * 只读：不改文档、不写数据源，也不缓存结果——采纳之后运行时照常按实例取数。
 */

export interface IntentDataCheckInput {
  /** 候选文档（`parseScreenDocument` 之后的，或编译产物）：只读组件的取值引用与绑定、文档的数据源。 */
  readonly document: {
    readonly components: readonly {
      readonly id: string;
      readonly dataValue?: unknown;
      readonly dataBinding?: unknown;
    }[];
    readonly dataSources?: readonly unknown[];
  };
  /** 组件 id → 模型原文路径（编译产物的 `sources`）。 */
  readonly sources: Readonly<Record<string, string>>;
  readonly port: ScreenHostDatasetPort;
  /** 本轮的数据上下文：有它时复用画像样本，省一次查询。 */
  readonly context?: IntentDataContext;
  readonly signal: ScreenAbortSignal;
  /** 单次查询超时，缺省 3000ms。 */
  readonly timeoutMs?: number;
}

export interface IntentDataCheckResult {
  /** 值得请模型修的诊断（去重，按模型原文路径）。 */
  readonly issues: readonly IntentRepairIssue[];
  /** 验证过的数据源实例名称（含复用画像样本的）。 */
  readonly verified: readonly string[];
  /** 查询失败、没能验证的数据源实例名称。 */
  readonly unverified: readonly string[];
  /** 查询成功但按当前条件没有数据的实例名称（也计入 `verified`）：不修复，只在理由里说明。 */
  readonly empty: readonly string[];
}

/** 指标卡的模型原文路径：平铺写法 `kpis[i]`，区域写法 `regions[r].items[i]`。 */
const KPI_PATH = /^(?:kpis\[\d+\]|regions\[\d+\]\.items\[\d+\])$/;

interface DatasetInstance {
  readonly id: string;
  readonly name: string;
  readonly datasetId: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
}

export async function validateIntentData(
  input: IntentDataCheckInput,
): Promise<IntentDataCheckResult> {
  const instances = datasetInstances(input.document.dataSources ?? []);
  const bound = new Set<string>();
  for (const component of input.document.components) {
    const source = dataSourceIdOf(component.dataValue);
    if (source !== undefined) bound.add(source);
  }
  const targets = instances.filter((instance) => bound.has(instance.id));
  if (targets.length === 0) return { issues: [], verified: [], unverified: [], empty: [] };

  const results = new Map<string, ScreenTabularDataset>();
  const verified: string[] = [];
  const unverified: string[] = [];
  const empty: string[] = [];
  const settled = await Promise.all(
    targets.map(async (instance, index) => ({
      instance,
      result: await resultOf(instance, index, input),
    })),
  );
  for (const { instance, result } of settled) {
    if (result === undefined) {
      unverified.push(instance.name);
    } else {
      results.set(instance.id, result);
      verified.push(instance.name);
      if (result.rows.length === 0) empty.push(instance.name);
    }
  }

  const issues: IntentRepairIssue[] = [];
  const seen = new Set<string>();
  const add = (code: string, path: string): void => {
    const key = `${code}@${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, path });
  };
  for (const component of input.document.components) {
    const sourceId = dataSourceIdOf(component.dataValue);
    const result = sourceId === undefined ? undefined : results.get(sourceId);
    if (result === undefined) continue;
    const path = input.sources[component.id] ?? '';
    const fields = boundFields(component.dataBinding);
    // 没有行就无从判断字段：空结果只记在 `empty` 里，不怪模型。
    if (result.rows.length === 0) continue;
    const known = new Set(result.fields.map((field) => field.id));
    if (fields.some((field) => !known.has(field))) {
      add('DATA_FIELD_ABSENT', path);
      continue;
    }
    if (fields.some((field) => result.rows.every((row) => isBlank(row[field])))) {
      add('DATA_FIELD_ALL_NULL', path);
    }
    if (KPI_PATH.test(path) && result.rows.length > 1) add('AGENT_KPI_MULTI_ROW', path);
  }
  return { issues, verified, unverified, empty };
}

/** 画像样本能复用就复用；否则查询一次。失败、超时、取消都返回 undefined（记为未验证）。 */
async function resultOf(
  instance: DatasetInstance,
  index: number,
  input: IntentDataCheckInput,
): Promise<ScreenTabularDataset | undefined> {
  const cached = input.context?.samples.get(
    intentDatasetQueryKey(instance.datasetId, instance.params),
  );
  if (cached !== undefined) return cached;
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (input.signal.aborted) return undefined;
  input.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, input.timeoutMs ?? 3000);
  try {
    const queried = await input.port.query(
      {
        datasetId: instance.datasetId,
        dataSourceId: `agent-check-${index + 1}`,
        params: { ...instance.params },
      },
      { signal: controller.signal },
    );
    return queried.ok && !controller.signal.aborted ? queried.value : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** 文档里的数据集实例；参数全是常量（`inline`）的才验证——引用变量的实例取值要到运行时才定。 */
function datasetInstances(dataSources: readonly unknown[]): DatasetInstance[] {
  const output: DatasetInstance[] = [];
  for (const raw of dataSources) {
    const entry = asRecord(raw);
    const source = asRecord(entry?.source);
    if (entry === null || source === null || source.kind !== 'dataset') continue;
    if (typeof entry.id !== 'string' || typeof source.datasetId !== 'string') continue;
    const params: Record<string, string | number | boolean> = {};
    let constant = true;
    for (const [name, value] of Object.entries(asRecord(entry.params) ?? {})) {
      const ref = asRecord(value);
      const inline = ref?.kind === 'inline' ? ref.value : undefined;
      if (typeof inline === 'string' || typeof inline === 'number' || typeof inline === 'boolean') {
        params[name] = inline;
      } else {
        constant = false;
      }
    }
    if (!constant) continue;
    output.push({
      id: entry.id,
      name: typeof entry.name === 'string' && entry.name !== '' ? entry.name : source.datasetId,
      datasetId: source.datasetId,
      params,
    });
  }
  return output;
}

function dataSourceIdOf(value: unknown): string | undefined {
  const ref = asRecord(value);
  return ref?.kind === 'data-source-field' && typeof ref.dataSourceId === 'string'
    ? ref.dataSourceId
    : undefined;
}

function boundFields(binding: unknown): string[] {
  const fields = asRecord(asRecord(binding)?.fields);
  if (fields === null) return [];
  return Object.values(fields).flatMap((ids) =>
    Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
  );
}

function isBlank(value: ScreenJsonValue | undefined): boolean {
  return value === null || value === undefined || value === '';
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
