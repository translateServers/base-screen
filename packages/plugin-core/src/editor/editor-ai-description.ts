import { SCREEN_THEME_SLOTS } from '@base-screen/contracts';
import type { BaseScreenMaterialManifest, BaseScreenMaterialPropSchema } from '../contracts.js';
import { BASE_SCREEN_RESERVED_STYLE_SCHEMAS } from '../material/material-schema.js';
import type { BaseScreenMaterialEditorField } from './editor-descriptor-model.js';

/**
 * 把物料的 styleSchema 派生成带注释的 TS interface 文本，供宿主塞进智能体提示词。
 *
 * 关键不是自然语言描述，而是「模型看到的就是 schema 本身」：字段名、嵌套路径、枚举与
 * 范围都来自声明，模型无从编造。本函数
 * 只做确定性投影，不新增 manifest 字段——注释里的中文名取自 editorDescriptor 的
 * label/help（按 path 匹配），约束取自 schema 自身。
 *
 * 既有宿主摘要（examples 的 agent-catalog）只搬浅层标量参数，嵌套 object/array 直接
 * 丢弃；这份签名补的正是那部分「不让模型猜」的路径。
 */

const MAX_DESCRIPTION_DEPTH = 4;
const INDENT = '  ';

export function describeBaseScreenMaterialStyleForAi(manifest: BaseScreenMaterialManifest): string {
  const comments = styleComments(manifest);
  const reservedKeys = Object.keys(BASE_SCREEN_RESERVED_STYLE_SCHEMAS);
  const lines = [
    `// 引擎级通用样式键（所有物料可用）: ${reservedKeys.join(', ')}`,
    `// 颜色值可写 "theme:<slot>" 引用文档主题色板；槽位: ${SCREEN_THEME_SLOTS.map((slot) => JSON.stringify(slot)).join(' | ')}`,
    'interface MaterialStyle {',
  ];
  appendObjectMembers(
    lines,
    {
      ...manifest.styleSchema,
      properties: { ...BASE_SCREEN_RESERVED_STYLE_SCHEMAS, ...manifest.styleSchema.properties },
    },
    comments,
    [],
    1,
  );
  lines.push('}');
  return lines.join('\n');
}

function styleComments(manifest: BaseScreenMaterialManifest): ReadonlyMap<string, string> {
  const comments = new Map<string, string>();
  const descriptor = manifest.editorDescriptor;
  if (descriptor === undefined) return comments;
  const visit = (
    fields: readonly BaseScreenMaterialEditorField[],
    prefix: readonly (string | number)[],
  ): void => {
    for (const field of fields) {
      if (field.target === 'style' || field.projection === 'style') {
        const text = field.help === undefined ? field.label : `${field.label}：${field.help}`;
        comments.set(JSON.stringify([...prefix, ...field.path]), text);
      }
      if (field.itemFields !== undefined) visit(field.itemFields, [...prefix, ...field.path]);
    }
  };
  for (const zone of [descriptor.appearance, descriptor.data, descriptor.interaction]) {
    for (const section of zone ?? []) visit(section.fields, []);
  }
  return comments;
}

function appendObjectMembers(
  lines: string[],
  schema: Extract<BaseScreenMaterialPropSchema, { kind: 'object' }>,
  comments: ReadonlyMap<string, string>,
  path: readonly (string | number)[],
  depth: number,
): void {
  const required = new Set(schema.required);
  for (const [key, property] of Object.entries(schema.properties)) {
    const memberPath = [...path, key];
    const comment = commentFor(comments, memberPath, property, required.has(key));
    if (comment !== undefined) lines.push(`${INDENT.repeat(depth)}/** ${comment} */`);
    const optional = required.has(key) ? '' : '?';
    lines.push(
      `${INDENT.repeat(depth)}${key}${optional}: ${typeText(property, comments, memberPath, depth)};`,
    );
  }
}

function commentFor(
  comments: ReadonlyMap<string, string>,
  path: readonly (string | number)[],
  schema: BaseScreenMaterialPropSchema,
  required: boolean,
): string | undefined {
  const parts: string[] = [];
  const author = comments.get(JSON.stringify(path));
  if (author !== undefined) parts.push(author);
  const constraints = constraintText(schema);
  if (constraints !== undefined) parts.push(constraints);
  if (required) parts.push('必填');
  return parts.length === 0 ? undefined : parts.join('。');
}

function constraintText(schema: BaseScreenMaterialPropSchema): string | undefined {
  switch (schema.kind) {
    case 'enum':
      return `取值: ${schema.values.map((value) => JSON.stringify(value)).join(' | ')}`;
    case 'number': {
      const bounds: string[] = [];
      if (schema.minimum !== undefined) bounds.push(`≥ ${schema.minimum}`);
      if (schema.maximum !== undefined) bounds.push(`≤ ${schema.maximum}`);
      return bounds.length === 0 ? undefined : `范围 ${bounds.join(' 且 ')}`;
    }
    case 'string':
      return schema.maxLength === undefined ? undefined : `最长 ${schema.maxLength} 字符`;
    case 'array': {
      const bounds: string[] = [];
      if (schema.minItems !== undefined) bounds.push(`≥ ${schema.minItems} 项`);
      if (schema.maxItems !== undefined) bounds.push(`≤ ${schema.maxItems} 项`);
      return bounds.length === 0 ? undefined : bounds.join(' 且 ');
    }
    default:
      return undefined;
  }
}

function typeText(
  schema: BaseScreenMaterialPropSchema,
  comments: ReadonlyMap<string, string>,
  path: readonly (string | number)[],
  depth: number,
): string {
  switch (schema.kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return schema.values.map((value) => JSON.stringify(value)).join(' | ');
    case 'array':
      return `Array<${typeText(schema.items, comments, [...path, 0], depth)}>`;
    case 'object': {
      // 第 4 层成员起不再展开：提示词要有界，深层结构留给宿主物料自己的文档。
      if (depth + 1 >= MAX_DESCRIPTION_DEPTH) return 'Record<string, unknown>';
      const lines: string[] = ['{'];
      appendObjectMembers(lines, schema, comments, path, depth + 1);
      lines.push(`${INDENT.repeat(depth)}}`);
      return lines.join('\n');
    }
  }
}
