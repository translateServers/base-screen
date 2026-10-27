import { DiagnosticCollector } from '../diagnostics/collector.js';
import type { ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenComponentDataSource, ScreenDocument } from '../types/document.js';
import type { ScreenProjectEnvelope } from '../types/envelope.js';
import { validateEnvelope } from './envelope.js';
import { validateDocument } from './validate.js';

/**
 * 解析屏幕文档。提供 `base`（此前由解析产生的同源文档）时，与 base 引用相同的
 * canvas/components/variables/blueprint 视为已校验：跳过克隆与结构校验，仅对新增
 * 或变更的值做完整校验。base 必须是此前解析输出（或由其派生）的文档。
 */
export function parseScreenDocument(
  input: unknown,
  base?: ScreenDocument,
): ScreenParseResult<ScreenDocument> {
  const collector = new DiagnosticCollector();
  const document = validateDocument(input, collector, 'root', base);
  if (document === undefined) {
    return { ok: false, diagnostics: collector.done() };
  }
  return { ok: true, value: document, diagnostics: [] };
}

export function parseScreenProjectEnvelope(
  input: unknown,
): ScreenParseResult<ScreenProjectEnvelope> {
  const collector = new DiagnosticCollector();
  const envelope = validateEnvelope(input, collector);
  if (envelope === undefined) {
    return { ok: false, diagnostics: collector.done() };
  }
  return { ok: true, value: envelope, diagnostics: [] };
}

/** 合成信封里 `dataSource` 之前的前缀长度：`['components', 0, 'dataSource']`。 */
const DATA_SOURCE_ENVELOPE_PREFIX = 3;

export interface ScreenDataSourceParseOptions {
  /**
   * 合成信封使用的组件类型。调用方若另行校验了物料类型，把已校验的值传进来，
   * 使信封里的 `type` 与调用方语境一致；省略时使用一个规范占位类型。
   */
  readonly componentType?: string;
}

/**
 * 校验一个组件数据源，返回其规范化结果。
 *
 * 数据源此前只能经由整份文档校验：调用方为校验一个字段而手工拼装 canvas、组件数组、
 * variables 与 blueprint。本入口把那层信封收进 contracts —— 判定仍走同一条文档校验路径，
 * 因此接受/拒绝与"写进文档后再解析"完全一致，诊断路径改为相对数据源本身。
 */
export function parseScreenDataSource(
  input: unknown,
  options?: ScreenDataSourceParseOptions,
): ScreenParseResult<ScreenComponentDataSource | null> {
  const parsed = parseScreenDocument({
    canvas: { width: 1, height: 1, backgroundColor: '#000000' },
    components: [
      {
        id: 'data-source',
        type: options?.componentType ?? 'base.data-source',
        name: 'Data source',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: input,
      },
    ],
    variables: [],
    blueprint: { relations: [] },
  });
  if (!parsed.ok) {
    return {
      ok: false,
      diagnostics: parsed.diagnostics.map((item) => ({
        ...item,
        path: item.path.slice(DATA_SOURCE_ENVELOPE_PREFIX),
      })),
    };
  }
  return { ok: true, value: parsed.value.components[0]?.dataSource ?? null, diagnostics: [] };
}
