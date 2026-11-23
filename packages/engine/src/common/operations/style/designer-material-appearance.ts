import {
  type BaseScreenMaterialEditorControl,
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialEditorSection,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialPropSchema,
  inferBaseScreenMaterialEditorControl,
  resolveSchema,
} from '@base-screen/plugin-core';

/**
 * 外观区的唯一来源（base-screen-docs ADR-0102 D1）。
 *
 * 有描述符外观区时用描述符；否则把扁平 `propertyPanel` / `stylePanel` 转换成两个描述符分区
 * （内容、样式），之后只有一个渲染器、一份字段表。检查器渲染、提交门禁、多选批量、条件样式、
 * 宿主条件样式都从这里取字段，不再各自读扁平面板。
 *
 * 结果按 manifest 引用缓存：catalog 里的 manifest 是不可变值，热刷新换的是新引用。
 *
 * 扁平面板转换出的两个分区标题是作者面文案：common/operations 不依赖 ui-text 子层（engine-import 门禁），
 * 由渲染方经 `labels` 传入；不传时分区标题为分区 id（只读字段表的调用方用不到标题）。
 */
export interface DesignerMaterialAppearanceLabels {
  readonly content: string;
  readonly style: string;
}

const synthesizedSections = new WeakSet<readonly BaseScreenMaterialEditorSection[]>();
const labelledCache = new WeakMap<
  readonly BaseScreenMaterialEditorSection[],
  {
    readonly labels: DesignerMaterialAppearanceLabels;
    readonly sections: readonly BaseScreenMaterialEditorSection[];
  }
>();
const appearanceCache = new WeakMap<
  BaseScreenMaterialManifest,
  readonly BaseScreenMaterialEditorSection[]
>();
const keyCache = new WeakMap<BaseScreenMaterialManifest, readonly DesignerMaterialEditorKey[]>();

export function designerMaterialAppearance(
  manifest: BaseScreenMaterialManifest,
  labels?: DesignerMaterialAppearanceLabels,
): readonly BaseScreenMaterialEditorSection[] {
  let sections = appearanceCache.get(manifest);
  if (sections === undefined) {
    const declared = manifest.editorDescriptor?.appearance;
    if (declared !== undefined && declared.length > 0) {
      sections = declared;
    } else {
      sections = flatPanelSections(manifest);
      synthesizedSections.add(sections);
    }
    appearanceCache.set(manifest, sections);
  }
  if (labels === undefined || !synthesizedSections.has(sections)) return sections;
  const labelled = labelledCache.get(sections);
  if (labelled !== undefined && labelled.labels === labels) return labelled.sections;
  const titled = sections.map((section) => ({
    ...section,
    label: section.id === 'content' ? labels.content : labels.style,
  }));
  labelledCache.set(sections, { labels, sections: titled });
  return titled;
}

/** 外观区里一个顶层 props / style 键对应的字段。 */
export interface DesignerMaterialEditorKey {
  readonly target: 'props' | 'style';
  readonly key: string;
  readonly field: BaseScreenMaterialEditorField;
  readonly schema: BaseScreenMaterialPropSchema;
}

/** 外观区声明的顶层键（交互字段按投影归入 props / style）；同一键只取第一个字段。 */
export function designerMaterialEditorKeys(
  manifest: BaseScreenMaterialManifest,
  target?: 'props' | 'style',
): readonly DesignerMaterialEditorKey[] {
  let keys = keyCache.get(manifest);
  if (keys === undefined) {
    keys = collectEditorKeys(manifest);
    keyCache.set(manifest, keys);
  }
  return target === undefined ? keys : keys.filter((entry) => entry.target === target);
}

/** 某个顶层键是否由外观区开放编辑。 */
export function isDesignerMaterialEditorKey(
  manifest: BaseScreenMaterialManifest,
  target: 'props' | 'style',
  key: string,
): boolean {
  return designerMaterialEditorKeys(manifest, target).some((entry) => entry.key === key);
}

function collectEditorKeys(manifest: BaseScreenMaterialManifest): DesignerMaterialEditorKey[] {
  const keys: DesignerMaterialEditorKey[] = [];
  const seen = new Set<string>();
  for (const section of designerMaterialAppearance(manifest)) {
    for (const field of section.fields) {
      const target = field.target === 'interaction' ? field.projection : field.target;
      if (target !== 'props' && target !== 'style') continue;
      const [key] = field.path;
      if (field.path.length !== 1 || typeof key !== 'string') continue;
      const root = target === 'props' ? manifest.propsSchema : manifest.styleSchema;
      // 测试与宿主替身里的 manifest 可能只带部分字段：缺 schema 视为不可编辑，不抛错。
      const schema = root?.properties?.[key];
      const identity = `${target}:${key}`;
      if (schema === undefined || seen.has(identity)) continue;
      seen.add(identity);
      keys.push({ target, key, field, schema });
    }
  }
  return keys;
}

function flatPanelSections(
  manifest: BaseScreenMaterialManifest,
): readonly BaseScreenMaterialEditorSection[] {
  const sections: BaseScreenMaterialEditorSection[] = [];
  const content = (manifest.propertyPanel ?? []).flatMap((item) => {
    const schema =
      manifest.propsSchema === undefined
        ? undefined
        : resolveSchema([item.prop], manifest.propsSchema);
    return schema === undefined
      ? []
      : [flatField('props', item.prop, item.label, item.control, item.allowGradient, schema)];
  });
  if (content.length > 0) {
    sections.push({
      id: 'content',
      label: 'content',
      fields: content,
    });
  }
  const style = (manifest.stylePanel ?? []).flatMap((item) => {
    // 不透明度由公共区统一承载（ADR-0099 §2.3），不在物料分区里重复出现。
    if (item.style === 'opacity') return [];
    const schema =
      manifest.styleSchema === undefined
        ? undefined
        : resolveSchema([item.style], manifest.styleSchema);
    return schema === undefined
      ? []
      : [flatField('style', item.style, item.label, item.control, item.allowGradient, schema)];
  });
  if (style.length > 0) {
    sections.push({ id: 'style', label: 'style', fields: style });
  }
  return sections;
}

function flatField(
  target: 'props' | 'style',
  key: string,
  label: string,
  declared: string,
  allowGradient: boolean | undefined,
  schema: BaseScreenMaterialPropSchema,
): BaseScreenMaterialEditorField {
  const base = {
    id: key,
    target,
    path: [key],
    label,
    ...(allowGradient === true ? { allowGradient: true } : {}),
  };
  return { ...base, control: flatControl(base, declared, schema) };
}

/**
 * 扁平面板的 control 只保留它能区分、推导区分不了的两件事：同为字符串的「文本 / 颜色」，
 * 以及作者明确要的 JSON。其余（数字、开关、枚举）一律按语义推导，与描述符字段同一张表。
 */
function flatControl(
  field: Pick<BaseScreenMaterialEditorField, 'target' | 'path' | 'allowGradient'>,
  declared: string,
  schema: BaseScreenMaterialPropSchema,
): BaseScreenMaterialEditorControl {
  if (declared === 'json') return 'json';
  if (schema.kind === 'string' && (declared === 'color' || declared === 'text')) return declared;
  return inferBaseScreenMaterialEditorControl(field, schema) ?? 'json';
}
