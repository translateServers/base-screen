/**
 * 宿主侧的有界结构检查。
 *
 * Base Screen 的 canonical schema 归 `@base-screen/contracts` 所有，而该包是**仅 ESM** 的；
 * 本工程是 CJS 的 NestJS 应用，刻意不引入它——宿主的职责只是"存取不透明 JSON"，
 * 不需要理解文档内部结构（见 examples/README.md 的分层说明）。因此这里做的是
 * 有界、失败关闭的结构校验：
 *
 * - 只检查顶层必需字段的存在与类型，以及组件数量与序列化体积上限；
 * - 不做默认值填充、不做未知字段剥离、不做任何"修复"；
 * - 真正的 schema 校验发生在宿主前端（引擎 / 契约包）与设计器提交路径上。
 */

/** 单个大屏文档允许的组件数量上限（防止把后端当无限存储用）。 */
export const MAX_COMPONENTS = 2_000;

/** 单个大屏文档的序列化体积上限（2 MiB）。 */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export type DocumentValidation =
  | { readonly ok: true; readonly serialized: string }
  | { readonly ok: false; readonly reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateScreenDocumentInput(input: unknown): DocumentValidation {
  if (!isPlainObject(input)) {
    return { ok: false, reason: 'document must be an object' };
  }

  const canvas = input.canvas;
  if (
    !isPlainObject(canvas) ||
    typeof canvas.width !== 'number' ||
    typeof canvas.height !== 'number' ||
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height) ||
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
    return { ok: false, reason: 'document.canvas must declare positive width and height' };
  }

  const components = input.components;
  if (!Array.isArray(components)) {
    return { ok: false, reason: 'document.components must be an array' };
  }
  if (components.length > MAX_COMPONENTS) {
    return { ok: false, reason: `document.components exceeds ${MAX_COMPONENTS} entries` };
  }

  if (!Array.isArray(input.variables)) {
    return { ok: false, reason: 'document.variables must be an array' };
  }

  const blueprint = input.blueprint;
  if (!isPlainObject(blueprint) || !Array.isArray(blueprint.relations)) {
    return { ok: false, reason: 'document.blueprint.relations must be an array' };
  }

  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: `document exceeds ${MAX_DOCUMENT_BYTES} bytes` };
  }
  return { ok: true, serialized };
}
