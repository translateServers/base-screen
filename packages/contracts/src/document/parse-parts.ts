import { DiagnosticCollector, type DiagnosticSegment } from '../diagnostics/collector.js';
import { parseScreenJsonValue } from '../json/parse.js';
import type { ScreenDiagnostic, ScreenParseResult } from '../types/diagnostics.js';
import type {
  ScreenBlueprintRelation,
  ScreenDataBinding,
  ScreenDataSource,
  ScreenValueRef,
} from '../types/document.js';
import { validateBlueprint } from './validate-blueprint.js';
import { validateComponentDataBinding, validateComponentDataValue } from './validate-component.js';
import { validateDataSource } from './validate-data-source.js';
import type { DocumentDiagnosticPath } from './validate-support.js';

/**
 * 文档片段的独立解析入口：取值引用、字段映射、文档级数据源实例与单条蓝图关系。
 *
 * 这些值此前只能经整份文档校验；需要在文档之外先验证一个片段的调用方（组合分片、宿主写入路径）
 * 要么自己拼装信封，要么另写一份规则。这里直接复用文档校验里对应位置的校验函数——接受/拒绝与
 * 「写进文档后再解析」完全一致，诊断路径相对片段本身。
 *
 * 只校验**形状**：引用目标是否存在（数据源 id、组件 id、变量 id）与环判定依赖整份文档，
 * 仍由 `parseScreenDocument` 负责。
 */

const identity: DocumentDiagnosticPath = (path) => path;

export function parseScreenValueRef(input: unknown): ScreenParseResult<ScreenValueRef> {
  return parsePart(input, ['dataValue'], (value, collector) =>
    value === null
      ? reject(
          collector,
          ['dataValue'],
          'A value reference must be a JSON object with a kind field.',
        )
      : validateComponentDataValue(value, [], identity, collector, 'root'),
  );
}

export function parseScreenDataBinding(input: unknown): ScreenParseResult<ScreenDataBinding> {
  return parsePart(input, ['dataBinding'], (value, collector) =>
    value === null
      ? reject(collector, ['dataBinding'], 'Component dataBinding must be an object.')
      : validateComponentDataBinding(value, [], identity, collector, 'root'),
  );
}

/** 文档级数据源实例（`document.dataSources` 的元素）；与组件旧形态 `parseScreenDataSource` 不同。 */
export function parseScreenDataSourceInstance(input: unknown): ScreenParseResult<ScreenDataSource> {
  return parsePart(input, ['dataSources', 0], (value, collector) =>
    validateDataSource(value, 0, identity, collector, 'root'),
  );
}

export function parseScreenBlueprintRelation(
  input: unknown,
): ScreenParseResult<ScreenBlueprintRelation> {
  return parsePart(input, ['blueprint', 'relations', 0], (value, collector) =>
    validateBlueprint({ relations: [value] }, identity, collector, 'root'),
  );
}

function parsePart<T>(
  input: unknown,
  prefix: readonly DiagnosticSegment[],
  validate: (value: unknown, collector: DiagnosticCollector) => boolean,
): ScreenParseResult<T> {
  const json = parseScreenJsonValue(input);
  if (!json.ok) return json;
  const collector = new DiagnosticCollector();
  if (!validate(json.value, collector) || collector.count > 0) {
    return { ok: false, diagnostics: collector.done().map((item) => stripPrefix(item, prefix)) };
  }
  return { ok: true, value: json.value as unknown as T, diagnostics: [] };
}

function stripPrefix(
  diagnostic: ScreenDiagnostic,
  prefix: readonly DiagnosticSegment[],
): ScreenDiagnostic {
  const matches = prefix.every((segment, index) => diagnostic.path[index] === segment);
  return matches ? { ...diagnostic, path: diagnostic.path.slice(prefix.length) } : diagnostic;
}

function reject(
  collector: DiagnosticCollector,
  path: DiagnosticSegment[],
  message: string,
): boolean {
  collector.add('DOCUMENT_FIELD_INVALID', path, 'root', message);
  return false;
}
