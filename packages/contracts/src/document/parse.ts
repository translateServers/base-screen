import { DiagnosticCollector } from '../diagnostics/collector.js';
import type { ScreenParseResult } from '../types/diagnostics.js';
import type { ScreenDocument } from '../types/document.js';
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
