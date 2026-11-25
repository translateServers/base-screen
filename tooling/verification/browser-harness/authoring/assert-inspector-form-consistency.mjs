// 检查器表单控件视觉一致性（base-screen-docs ADR-0102）：逐个插入物料库里的每种物料，
// 展开全部分区，按控件类型量计算样式。同一类型在任何物料、任何分区里外观必须一致——
// 不比对截图，比对的是高度、圆角、底色、字体、内距与在字段行里的起止位置。
// 由 run-browser-harness.mjs 编排调用。

import { expect } from '@playwright/test';

/** 盒状控件（输入、下拉、取色器触发器、带单位数字、步进器、四边距、滑杆读数、几何输入）。 */
const BOX_KINDS = new Set([
  'text',
  'number',
  'unit-number',
  'select',
  'color',
  'stepper',
  'spacing',
  'range-value',
  'geometry',
]);
/** 轨道控件（分段、按钮组）：workspace 底，与盒状控件同高同圆角。 */
const TRACK_KINDS = new Set(['segmented', 'button-group']);
/** 值文字与盒子左缘的距离必须相同的类型（取色器有色块、步进器居中、四边距有方向字，除外）。 */
const PADDED_VALUE_KINDS = new Set([
  'text',
  'number',
  'unit-number',
  'select',
  'range-value',
  'geometry',
]);

export async function assertInspectorFormConsistency(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer&verify`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.baseScreenHarness?.designer?.document !== undefined);
    const types = await page.evaluate(() =>
      window.baseScreenHarness.designer.catalog
        .list()
        .map((entry) => entry.manifest)
        .filter((manifest) => manifest.libraryVisible !== false)
        .map((manifest) => manifest.type),
    );
    const rows = [];
    const sections = [];
    const skipped = [];
    for (const type of types) {
      const inserted = await page.evaluate((materialType) => {
        const designer = window.baseScreenHarness.designer;
        return designer.insertComponent({ materialType }).ok;
      }, type);
      if (!inserted) {
        skipped.push(type);
        continue;
      }
      await page.waitForFunction((materialType) => {
        const designer = window.baseScreenHarness.designer;
        const [id] = designer.selection.selectedComponentIds;
        const component = designer.document.components.find((item) => item.id === id);
        return component?.type === materialType;
      }, type);
      const measured = await page.evaluate(measureInspectorForm, type);
      rows.push(...measured.rows);
      sections.push(...measured.sections);
    }
    // 至少要量到大部分物料，否则「零违规」只是没量到。
    expect(types.length - skipped.length, JSON.stringify(skipped)).toBeGreaterThanOrEqual(20);
    expect(rows.length).toBeGreaterThan(200);
    const violations = findInspectorFormViolations(rows, sections);
    expect(violations, violations.join('\n')).toEqual([]);
    // 基础 / 全量（ADR-0102 §7）：基础模式底部写明隐藏了几项，点一下切到全量、提示消失。
    const tiers = await page.evaluate(async () => {
      const designer = window.baseScreenHarness.designer;
      const root = designer.shadowRoot;
      root.querySelector('[data-inspector-density="basic"]').click();
      designer.insertComponent({ materialType: 'board.digital-flop' });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const panel = root.querySelector('[data-properties]');
      const hint = panel.querySelector(':scope > [data-inspector-hidden-hint]');
      const hiddenFields = [...panel.querySelectorAll('[data-inspector-advanced] .designer-field')]
        .length;
      const before = { count: Number(hint?.dataset.inspectorHiddenHint ?? 0), hiddenFields };
      hint?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const after = {
        density: root.querySelector('[data-right-panel]').dataset.inspectorDensity,
        hint: root.querySelector('[data-properties] > [data-inspector-hidden-hint]') !== null,
      };
      root.querySelector('[data-inspector-density="basic"]').click();
      return { before, after };
    });
    expect(tiers.before.count).toBeGreaterThan(0);
    expect(tiers.before.count).toBe(tiers.before.hiddenFields);
    expect(tiers.after).toEqual({ density: 'all', hint: false });
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}

/**
 * 在页面里执行：展开当前检查器的全部分区，按字段行分类控件并读取计算样式。
 * 只量「样式」页签——这是物料属性所在的地方；数据源与高级页签走各自的面板件。
 */
export function measureInspectorForm(materialType) {
  const designer =
    window.baseScreenHarness?.designer ?? document.querySelector('base-screen-designer');
  const panel = designer.shadowRoot.querySelector('[data-properties]');
  for (const details of panel.querySelectorAll('details')) details.open = true;
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
  };
  const box = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      height: Math.round(rect.height),
      radius: style.borderTopLeftRadius,
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth,
    };
  };
  const text = (element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontFamily: style.fontFamily,
      color: style.color,
      // 从左到右排版里 start 与 left 是同一个结果。
      textAlign: style.textAlign === 'start' ? 'left' : style.textAlign,
      paddingLeft: style.paddingLeft,
    };
  };
  const first = (field, selector) =>
    [...field.querySelectorAll(selector)].find((element) => visible(element));
  const classify = (field) => {
    if (field.closest('.designer-inspector-geometry-grid') !== null) {
      const group = first(field, '.designer-flip-actions, .designer-image-density-actions');
      if (group !== undefined) return { kind: 'button-group', control: group };
      const input = first(field, 'input');
      return input === undefined ? undefined : { kind: 'geometry', control: input, value: input };
    }
    const spacing = first(field, '.designer-spacing');
    if (spacing !== undefined) {
      return { kind: 'spacing', control: spacing, value: first(field, '.designer-spacing-input') };
    }
    const color = first(field, '.designer-color-palette-trigger');
    if (color !== undefined) return { kind: 'color', control: color };
    const range = first(field, 'input[type="range"]');
    if (range !== undefined) {
      const reading = first(field, 'input[type="number"]');
      return { kind: 'range-value', control: reading, value: reading, range };
    }
    const unit = first(field, '.designer-unit-input');
    if (unit !== undefined) {
      return { kind: 'unit-number', control: unit, value: first(unit, 'input') };
    }
    const stepper = first(field, '.designer-stepper');
    if (stepper !== undefined) {
      return { kind: 'stepper', control: stepper, value: first(stepper, 'input') };
    }
    const segmented = first(field, '.designer-segmented');
    if (segmented !== undefined) return { kind: 'segmented', control: segmented };
    const select = first(field, '.designer-select-trigger');
    if (select !== undefined) return { kind: 'select', control: select, value: select };
    const toggle = first(field, '.designer-switch');
    if (toggle !== undefined) return { kind: 'switch', control: toggle };
    const checkbox = first(field, 'input[type="checkbox"]');
    if (checkbox !== undefined) return { kind: 'checkbox', control: checkbox };
    const area = first(field, 'textarea');
    if (area !== undefined) return { kind: 'textarea', control: area, value: area };
    const number = first(field, 'input[type="number"]');
    if (number !== undefined) return { kind: 'number', control: number, value: number };
    const input = first(field, 'input[type="text"], input:not([type])');
    if (input !== undefined) return { kind: 'text', control: input, value: input };
    return undefined;
  };
  // 上下文：标准字段行（标签列 + 控件列）之外，只有几何网格、数组条目卡片、条件样式规则三种。
  const contextOf = (field) => {
    if (field.closest('.designer-inspector-geometry-grid') !== null) return 'geometry-grid';
    if (field.closest('.designer-descriptor-array-item') !== null) return 'array-item';
    if (field.closest('.designer-style-rule, .designer-host-style-form') !== null) {
      return 'style-rule';
    }
    if (field.classList.contains('designer-field-stacked')) return 'stacked';
    return 'row';
  };
  const rows = [];
  const fields = [...panel.querySelectorAll('.designer-field')]
    .filter(visible)
    .filter((field) => field.parentElement.closest('.designer-field') === null);
  for (const field of fields) {
    const found = classify(field);
    if (found === undefined || found.control === undefined) continue;
    // 插件自带的检查器控件（自定义元素）不归引擎原语管，规范只约束它的外框（ADR-0102 §4）。
    if (field.querySelector('[data-descriptor-custom-owner]') !== null) continue;
    const label = field.querySelector(':scope > .designer-field-label-text');
    const controlColumn = field.querySelector(':scope > .designer-field-control');
    const fieldRect = field.getBoundingClientRect();
    // 复合控件按整体量：滑杆 + 读数从滑杆起、到读数止；四边距连同框外的单位一起占满控件列。
    const start = found.kind === 'range-value' ? found.range : found.control;
    const fill =
      found.kind === 'range-value'
        ? controlColumn
        : found.kind === 'spacing'
          ? (found.control.closest('.designer-spacing-scope') ?? found.control)
          : found.control;
    const fillRect = fill?.getBoundingClientRect();
    const summary = field.closest('details')?.querySelector('summary');
    const rowClickable =
      found.kind === 'switch'
        ? [
            field.tagName.toLowerCase(),
            getComputedStyle(field).cursor,
            found.control.parentElement === field,
          ].join(':')
        : undefined;
    rows.push({
      materialType,
      section: summary?.textContent?.trim().slice(0, 16) ?? '',
      label: label?.textContent?.trim().slice(0, 16) ?? '',
      kind: found.kind,
      context: contextOf(field),
      rowClickable,
      box: box(found.control),
      value: found.value === undefined ? undefined : text(found.value),
      labelStyle:
        label === null || !visible(label)
          ? undefined
          : { ...text(label), width: Math.round(label.getBoundingClientRect().width) },
      startOffset:
        controlColumn === null
          ? undefined
          : Math.round(start.getBoundingClientRect().left - fieldRect.left),
      endGap: fillRect === undefined ? undefined : Math.round(fieldRect.right - fillRect.right),
    });
  }
  const sections = [
    ...panel.querySelectorAll(
      'summary.designer-panel-section-title, summary.designer-descriptor-group-summary',
    ),
  ]
    .filter(visible)
    .map((summary) => {
      const style = getComputedStyle(summary);
      const after = getComputedStyle(summary, '::after');
      return {
        materialType,
        title: summary.textContent.trim().slice(0, 16),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        letterSpacing: style.letterSpacing,
        rule: after.display !== 'none' && after.content !== 'none',
      };
    });
  return { rows, sections };
}

/** 同一类型在不同物料 / 分区里取到了不同的值，就是一条违规；返回可读的违规清单。 */
export function findInspectorFormViolations(rows, sections) {
  const violations = [];
  const sample = (row) => `${row.materialType} / ${row.section} / ${row.label}`;
  const compare = (name, items, read) => {
    const groups = new Map();
    for (const item of items) {
      const value = read(item);
      if (value === undefined) continue;
      const key = JSON.stringify(value);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    if (groups.size <= 1) return;
    const detail = [...groups.entries()]
      .sort((left, right) => right[1].length - left[1].length)
      .map(([value, members]) => `${value} ×${members.length}（如 ${sample(members[0])}）`)
      .join('；');
    violations.push(`${name}：${detail}`);
  };
  const boxes = rows.filter((row) => BOX_KINDS.has(row.kind));
  const tracks = rows.filter((row) => TRACK_KINDS.has(row.kind));
  // §3.2 只有一档控件高度：盒状与轨道控件同高。
  compare('控件高度', [...boxes, ...tracks], (row) => row.box.height);
  compare('盒状控件圆角', boxes, (row) => row.box.radius);
  compare('盒状控件底色', boxes, (row) => row.box.background);
  compare('盒状控件实线描边', boxes, (row) => row.box.borderWidth);
  compare('轨道控件圆角', tracks, (row) => row.box.radius);
  compare('轨道控件底色', tracks, (row) => row.box.background);
  // §3.4 值文字：字号、字重、字族、颜色一致；除步进器外一律左对齐。
  const values = rows.filter((row) => row.value !== undefined && row.kind !== 'textarea');
  compare('值文字字号', values, (row) => row.value.fontSize);
  compare('值文字字重', values, (row) => row.value.fontWeight);
  compare('值文字字族', values, (row) => row.value.fontFamily);
  compare('值文字颜色', values, (row) => row.value.color);
  compare(
    '值文字对齐',
    values.filter((row) => row.kind !== 'stepper' && row.kind !== 'select'),
    (row) => row.value.textAlign,
  );
  compare(
    '值文字左内距',
    values.filter((row) => PADDED_VALUE_KINDS.has(row.kind)),
    (row) => row.value.paddingLeft,
  );
  // §3.1 标准字段行：标签列同宽同字，控件从同一条竖线开始，盒状与轨道控件占满控件列。
  const standard = rows.filter((row) => row.context === 'row');
  // 开关行是行式布局（标签占满剩余宽度、开关贴右），不进 74px 标签列。
  compare(
    '标签宽度',
    standard.filter((row) => row.kind !== 'switch'),
    (row) => row.labelStyle?.width,
  );
  // 开关行整行可点：行是 <label> 且显示手型（与页面配置同一个原语）。
  compare(
    '开关行可点',
    standard.filter((row) => row.kind === 'switch'),
    (row) => row.rowClickable,
  );
  compare('标签字号', standard, (row) => row.labelStyle?.fontSize);
  compare('标签颜色', standard, (row) => row.labelStyle?.color);
  // 开关贴控件列右缘（§5），其余控件从控件列起点开始。
  compare(
    '控件起点',
    standard.filter((row) => row.kind !== 'switch'),
    (row) => row.startOffset,
  );
  compare(
    '开关贴右',
    standard.filter((row) => row.kind === 'switch'),
    (row) => row.endGap,
  );
  compare(
    '控件占满控件列',
    standard.filter((row) => BOX_KINDS.has(row.kind) || TRACK_KINDS.has(row.kind)),
    (row) => row.endGap,
  );
  // §3.5 属性布尔只用开关。
  for (const row of rows.filter((item) => item.kind === 'checkbox')) {
    violations.push(`属性布尔用了勾选框：${sample(row)}`);
  }
  // §3.7 分区标题只有一种。
  const opened = sections.filter((section) => section.fontWeight !== '500');
  compare('分区标题字号', sections, (section) => section.fontSize);
  compare('分区标题字重（展开）', opened, (section) => section.fontWeight);
  compare('分区标题颜色', sections, (section) => section.color);
  compare('分区标题字距', sections, (section) => section.letterSpacing);
  compare('分区标题发丝线', sections, (section) => section.rule);
  return violations;
}
