import type {
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '../../../packages/contracts/src/index.ts';
import type {
  BaseScreenMaterialObjectSchema,
  BaseScreenPluginRuntime,
} from '../../../packages/plugin-core/src/index.ts';
import { definePlugin } from '../../../packages/plugin-sdk/src/index.ts';

/**
 * 宿主组合路径模板（对应《DataV 能力插件承载差距调研》第四节）。
 *
 * DataV 上三个"看起来缺能力"的功能域——计时器触发、用户可编写过滤器、推送数据源——
 * 都不需要 Base Screen 新增贡献类型或契约字段，宿主用既有公开面就能组合出来。本模块把
 * 这三条组合路径写成可复制的代码，因为它们此前只存在于调研文档的散文里：宿主读到结论时
 * 仍要自己摸索端口形状、调用顺序和信任边界。
 *
 * 信任边界（ADR-0027 / ADR-0084）：本模块里的处理器是宿主受信同 realm 代码。宿主在这里
 * 执行的是它自己管理的脚本，属于宿主自身的信任决策；Base Screen 不提供用户脚本沙箱，
 * 也不为这类执行背书。
 */

export const DATAV_COMPOSITION_PLUGIN_ID = 'harness.datav-composition';

/** 文档里 `processorId` 引用它；宿主在解析变量/数据源时把上游值路由到这里。 */
export const DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID = 'hostScriptFilter';

/** 处理器配置只带一个脚本标识：脚本正文留在宿主资产服务，不进文档、不进插件清单。 */
export const DATAV_COMPOSITION_SCRIPT_CONFIG_SCHEMA: BaseScreenMaterialObjectSchema = {
  kind: 'object',
  properties: { scriptId: { kind: 'string' } },
  required: ['scriptId'],
};

/**
 * 宿主自有的脚本资产表。
 *
 * 真实宿主会把 `scriptId` 换成脚本正文并放进自己的资产服务、审计与灰度流程里；这里用一张
 * 查表替代，是为了让示例可读、且不把 `new Function` 引进入口文件。要点在于**脚本从不进入
 * 文档与清单**：文档只存一个不透明的 `scriptId`，因此换脚本不必改文档、也不必过插件预检。
 */
const HOST_SCRIPT_ASSETS: Readonly<
  Record<string, (value: ScreenJsonValue, options: ScreenJsonObject) => ScreenJsonValue>
> = {
  // 过滤：只保留数值字段超过阈值的行。
  overThreshold: (value, options) => {
    if (!Array.isArray(value)) return value;
    const field = typeof options.field === 'string' ? options.field : 'value';
    const threshold = typeof options.threshold === 'number' ? options.threshold : 0;
    return value.filter((row) => {
      const measured = readField(row, field);
      return typeof measured === 'number' && measured > threshold;
    });
  },
  // 变换：把每行的指定字段重命名，模拟"宿主自己的字段规整脚本"。
  renameField: (value, options) => {
    if (!Array.isArray(value)) return value;
    const from = typeof options.from === 'string' ? options.from : 'value';
    const to = typeof options.to === 'string' ? options.to : 'amount';
    return value.map((row) => {
      const record = asRecord(row);
      const next: Record<string, ScreenJsonValue> = { ...record, [to]: record[from] ?? null };
      delete next[from];
      return next;
    });
  },
};

export interface DatavScriptFilterRequest {
  readonly scriptId: string;
  readonly value: ScreenJsonValue;
  readonly options?: ScreenJsonObject;
}

/**
 * 宿主侧调用点：变量/数据源解析时发现 `processorId === hostScriptFilter`，
 * 就带着自己算出的 `scriptId` 调这里。返回值形状与 manager 的 `applyDataProcessor` 一致，
 * 宿主可以直接把它当成自己解析流程的一段。
 */
export async function applyHostScriptFilter(
  manager: {
    applyDataProcessor(request: {
      processorId: string;
      value: ScreenJsonValue;
      config: ScreenJsonObject;
    }): Promise<ScreenParseResult<ScreenJsonValue>>;
  },
  request: DatavScriptFilterRequest,
): Promise<ScreenParseResult<ScreenJsonValue>> {
  return manager.applyDataProcessor({
    processorId: DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID,
    value: request.value,
    config: { scriptId: request.scriptId, ...(request.options ?? {}) },
  });
}

/**
 * 宿主自营插件：只贡献一个 `dataProcessor`，没有物料、没有面板、没有 DOM。
 *
 * 与 `plugin-pipeline` 的 `topBy` 的区别在配置语义：那个处理器的参数是文档字段，
 * 这个处理器的参数是**宿主资产标识**——这正是"用户可编写过滤器"的承载形态。
 */
export function createDatavCompositionRuntime(): BaseScreenPluginRuntime {
  const defined = definePlugin({
    manifest: {
      id: DATAV_COMPOSITION_PLUGIN_ID,
      dependencies: [],
      capabilities: ['data.process'],
      contributions: [
        {
          kind: 'dataProcessor',
          id: DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID,
          name: '宿主脚本过滤器',
          configSchema: DATAV_COMPOSITION_SCRIPT_CONFIG_SCHEMA,
        },
      ],
    },
    dataProcessors: {
      [DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID]: (value, config) => runScript(value, config),
    },
    activate() {},
    deactivate() {},
    dispose() {},
  });
  if (!defined.ok) {
    throw new Error(
      `DATAV_COMPOSITION_MANIFEST_INVALID:${defined.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(',')}`,
    );
  }
  return defined.value;
}

function runScript(
  value: ScreenJsonValue,
  config: ScreenJsonObject,
): ScreenParseResult<ScreenJsonValue> {
  const scriptId = typeof config.scriptId === 'string' ? config.scriptId : '';
  const script = HOST_SCRIPT_ASSETS[scriptId];
  if (script === undefined) {
    // 脚本不在宿主资产表里 → 失败关闭。宿主配置错误不应静默退回原值：那会让作者以为过滤器
    // 生效了，而实际上数据没被处理过。
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'HOST_RESOURCE_UNAVAILABLE',
          path: ['scriptId'],
          message: 'Host script asset was not found.',
        },
      ],
    };
  }
  const { scriptId: _scriptId, ...options } = config;
  return { ok: true, value: script(value, options), diagnostics: [] };
}

/**
 * 宿主写变量的唯一原语。
 *
 * 计时器触发与推送数据**走的是同一条写入路径**：宿主拿到值 → 写进变量 → 变量发出
 * `data-updated` → 蓝图规则触发。两者的差别只在"值从哪来"（定时器 vs 服务端推送），
 * 因此这里只实现写入，触发源由调用方决定——复制模板时不必把两种驱动混成一锅。
 */
export function writeHostVariable(
  designer: { getVariable(id: string): ScreenVariableHandleLike | undefined },
  variableId: string,
  value: ScreenJsonValue,
): ScreenParseResult<null> {
  const handle = designer.getVariable(variableId);
  if (handle === undefined) {
    // 变量不在当前文档里：宿主调度器与文档是两份事实，文档换了变量就没了。失败关闭并
    // 显式报错，避免定时器静默空转。
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'HOST_VARIABLE_DESCRIPTOR_INVALID',
          path: ['variableId'],
          message: 'Host variable is not declared by the current document.',
        },
      ],
    };
  }
  return handle.set(value);
}

interface ScreenVariableHandleLike {
  readonly value: ScreenJsonValue;
  set(value: ScreenJsonValue): ScreenParseResult<null>;
  onChange(listener: (value: ScreenJsonValue) => void): () => void;
}

export interface HostVariableTimerOptions {
  readonly variableId: string;
  readonly intervalMs: number;
  /** 第 n 次触发（从 0 起）该写什么值；返回 null 表示本次跳过。 */
  readonly produce: (tick: number) => ScreenJsonValue | null;
  /** 每次成功写入后的观察点；计时器与一次性推送共用，便于断言两条路径走的是同一原语。 */
  readonly onWrite?: (value: ScreenJsonValue) => void;
}

export interface HostVariableTimer {
  /** 已成功写入的次数，供断言观察。 */
  readonly writes: () => number;
  readonly stop: () => void;
}

/**
 * 计时器触发模板：宿主自建 `setInterval` → 写变量 → 蓝图规则。
 *
 * ADR-0083 已定"Engine 不建计时器"，因此调度**只**在宿主这一侧。宿主拿到的是普通定时器，
 * 怎么对齐秒表、怎么在页面隐藏时降频、怎么避免重叠执行，全归宿主——这也是这条路径不需要
 * Base Screen 新增节点的原因：需要统一的只是"作者可编辑的触发器形态"，不是功能本身。
 */
export function startHostVariableTimer(
  designer: { getVariable(id: string): ScreenVariableHandleLike | undefined },
  options: HostVariableTimerOptions,
): HostVariableTimer {
  let tick = 0;
  let writes = 0;
  const timer = setInterval(() => {
    const value = options.produce(tick);
    tick += 1;
    if (value === null) return;
    if (writeHostVariable(designer, options.variableId, value).ok) {
      writes += 1;
      options.onWrite?.(value);
    }
  }, options.intervalMs);
  return {
    writes: () => writes,
    stop: () => clearInterval(timer),
  };
}

function asRecord(value: ScreenJsonValue): ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ScreenJsonObject)
    : {};
}

function readField(row: ScreenJsonValue, field: string): ScreenJsonValue {
  return asRecord(row)[field] ?? null;
}
