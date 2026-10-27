import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 当前脚本位于 <root>/tooling/checks/，向上两级到达仓库根
const root = fileURLToPath(new URL('../../', import.meta.url));
const browserRoot = resolve(root, 'packages/engine/src/browser');

// Modules outside `browser/` that must not introduce localization gates or inline
// user-visible text, but are not themselves the source-of-truth UI text module.
const monitoredModules = [
  'packages/engine/src/common/operations/designer-operation-registry.ts',
  'packages/engine/src/common/tools/designer-tools.ts',
  'packages/engine/src/common/ui-text/designer-ui-text.ts',
  'packages/engine/src/index.ts',
];

const cjk = /[\u4e00-\u9fff]/;
const forbiddenLocalization = /\b(?:i18n|locale|language)\b/i;

function collectTypeScriptFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTypeScriptFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function relativeFromBrowser(file) {
  return file
    .slice(browserRoot.length + 1)
    .split('\\')
    .join('/');
}

// Strip line, block and JSDoc comments so CJK inside comments is not treated as
// inline UI text. Remaining CJK in `browser/` code therefore lives in string
// literals, which is forbidden: user-visible text must live in
// `common/ui-text/designer-ui-text.ts`.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
}

function hasInlineUiText(source) {
  return cjk.test(stripComments(source));
}

const browserFiles = collectTypeScriptFiles(browserRoot);
const monitoredFiles = monitoredModules.map((file) => resolve(root, file));

const inlineViolations = browserFiles.filter((file) => {
  const source = readFileSync(file, 'utf8');
  return hasInlineUiText(source);
});

if (inlineViolations.length > 0) {
  throw new Error(`DESIGNER_UI_INLINE_TEXT_FORBIDDEN: ${inlineViolations.join(', ')}`);
}

for (const file of [...browserFiles, ...monitoredFiles]) {
  const source = readFileSync(file, 'utf8');
  if (forbiddenLocalization.test(source)) {
    throw new Error(`DESIGNER_UI_LOCALIZATION_FORBIDDEN: ${file}`);
  }
}

// 集成架构里的开发者词汇不得进入用户文案。只扫两份文案模块的字符串行：
// 注释（含 JSDoc）里的架构叙述允许保留这些词。
const userFacingTextModules = [
  'packages/engine/src/common/ui-text/designer-ui-text.ts',
  'packages/engine/src/common/ui-text/designer-blueprint-ui-text.ts',
];
const forbiddenUserFacingTerms = ['宿主'];
for (const relative of userFacingTextModules) {
  const lines = readFileSync(resolve(root, relative), 'utf8').split(/\r?\n/);
  const index = lines.findIndex((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return false;
    }
    return forbiddenUserFacingTerms.some((term) => trimmed.includes(term));
  });
  if (index !== -1) {
    throw new Error(`DESIGNER_UI_DEV_TERM_FORBIDDEN: ${relative}:${index + 1}`);
  }
}

// 表单行与表单控件各只有一个来源：`designer-field-primitives`（行骨架 / 复合控件）与
// `designer-ui-primitives`（单个控件）。手工拼行骨架或直接 createElement 表单元素，会让类名、
// ARIA 与校验消息连接在多处各自演化——`designer-number-input` 就是绕开原语后单独补 CSS 的产物。
//
// 下面的名单是存量债务，不是许可：自绘控件（取色器 / 色标 / 渐变条 / 步进器 / 表格单元格）
// 或仍持有独立表单语汇的模块，逐个列名而不用通配。新文件默认不允许，每迁移完一个删一行，只减不增。
const controlDomDebt = new Set([
  // 自绘三态模式组：原生 radio 只是值载体，可见形态完全由色板自己的图标/选中环绘制。
  // 其余表单控件已全部走共享原语；这条保留为唯一例外，新增原生控件仍会被门禁拒绝。
  'dom/color/designer-color-palette-dom.ts',
]);

// 两个来源模块本身是唯一合法的产出点；select / date 在各自迁移进原语前先视为实现点。
const formPrimitiveOrigins = new Set([
  'dom/designer-field-primitives.ts',
  'dom/designer-ui-primitives.ts',
  'dom/designer-form-controls-dom.ts',
  'dom/designer-select-dom.ts',
  'dom/designer-date-field-dom.ts',
  'dom/panel/designer-panel-primitives.ts',
]);

// 模板字符串里的控件由渲染完成后的 adoption 接管；这里登记“谁负责接管”。
const templateAdoptionOwners = new Map([
  ['dom/workspace/designer-workspace-markup.ts', 'dom/workspace/designer-workspace.ts'],
  ['dom/workspace/designer-workspace-template.ts', 'dom/workspace/designer-workspace.ts'],
  [
    'dom/blueprint/designer-blueprint-inspector-configuration.ts',
    'controllers/blueprint/designer-blueprint-panels-controller.ts',
  ],
  [
    'dom/blueprint/designer-blueprint-library-dom.ts',
    'controllers/blueprint/designer-blueprint-panels-controller.ts',
  ],
]);

const sharedControlDomClasses = new Set([
  'designer-control',
  'designer-control-shell',
  'designer-input',
  'designer-textarea',
  'designer-select',
  'designer-select-control',
  'designer-select-trigger',
  'designer-select-option',
  'designer-select-native',
  'designer-checkbox',
  'designer-switch',
  'designer-button',
  'designer-icon-button',
  'designer-segmented',
  'designer-segmented-option',
  'designer-tab',
  'designer-tablist',
  'designer-stepper',
  'designer-date-field',
  'designer-field',
  'designer-field-label',
]);
const sharedControlDomPrefixes = [
  'designer-select-',
  'designer-segmented-',
  'designer-stepper-',
  'designer-calendar-',
  'designer-date-field',
];

function isSharedControlDomClass(token) {
  return (
    sharedControlDomClasses.has(token) ||
    sharedControlDomPrefixes.some((prefix) => token.startsWith(prefix))
  );
}

function classStringsInAssignments(source) {
  const text = stripComments(source);
  const strings = [];
  for (const match of text.matchAll(
    /(?:className\s*\+?=|classList\.(?:add|toggle|remove)\s*\()/g,
  )) {
    const start = match.index ?? 0;
    const semicolon = text.indexOf(';', start);
    const end = semicolon === -1 ? Math.min(text.length, start + 500) : semicolon;
    for (const stringMatch of text.slice(start, end).matchAll(/(['"`])([\s\S]*?)\1/g)) {
      strings.push(stringMatch[2]);
    }
  }
  return strings;
}

function hasHandBuiltControlClass(source) {
  return classStringsInAssignments(source).some((className) =>
    className.split(/\s+/).some((token) => token !== '' && isSharedControlDomClass(token)),
  );
}

function hasTemplateControl(source) {
  const text = stripComments(source);
  for (const match of text.matchAll(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const className = match[1] ?? match[2] ?? '';
    if (className.split(/\s+/).some((token) => token !== '' && isSharedControlDomClass(token))) {
      return true;
    }
  }
  return false;
}

for (const [relative, owner] of templateAdoptionOwners) {
  const ownerFile = join(browserRoot, owner);
  if (
    !existsSync(ownerFile) ||
    !readFileSync(ownerFile, 'utf8').includes('adoptDesignerFormControls')
  ) {
    throw new Error(`DESIGNER_UI_TEMPLATE_OWNER_INVALID:${relative} -> ${owner}`);
  }
}

const formPrimitiveRules = [
  {
    id: 'RAW_FORM_CONTROL',
    test: (source) => /createElement\(\s*(['"])(?:input|select|textarea)\1\s*\)/.test(source),
    hint: 'use designer-ui-primitives',
  },
  {
    id: 'HAND_BUILT_FIELD_ROW',
    test: (source) =>
      /(?:['"`]designer-field designer-field-label|['"`]variable-field(?:\s|['"`]))/.test(source),
    hint: 'use createDesignerFieldRow / createDesignerFieldElement',
  },
  {
    id: 'HAND_BUILT_CONTROL_CLASS',
    test: hasHandBuiltControlClass,
    hint: 'use createDesignerButton / createDesignerInput / createDesignerSegmented / createDesignerTabs',
  },
  {
    id: 'CONTROL_TEMPLATE_NOT_ADOPTED',
    test: hasTemplateControl,
    hint: 'call adoptDesignerFormControls after rendering, or register the owner in templateAdoptionOwners',
  },
];

function isAdoptedTemplateOwner(relative, source) {
  return templateAdoptionOwners.has(relative) || source.includes('adoptDesignerFormControls');
}

const violationsByRule = new Map(formPrimitiveRules.map((rule) => [rule.id, []]));
for (const file of browserFiles) {
  const relative = relativeFromBrowser(file);
  if (formPrimitiveOrigins.has(relative)) continue;
  const source = readFileSync(file, 'utf8');
  for (const rule of formPrimitiveRules) {
    if (!rule.test(source)) continue;
    if (rule.id === 'CONTROL_TEMPLATE_NOT_ADOPTED' && isAdoptedTemplateOwner(relative, source)) {
      continue;
    }
    violationsByRule.get(rule.id)?.push(relative);
  }
}

if (process.argv.includes('--report')) {
  console.log(JSON.stringify(Object.fromEntries(violationsByRule), null, 2));
  process.exit(0);
}

for (const rule of formPrimitiveRules) {
  const violations = (violationsByRule.get(rule.id) ?? []).filter(
    (relative) => !controlDomDebt.has(relative),
  );
  if (violations.length > 0) {
    throw new Error(`DESIGNER_UI_${rule.id}_FORBIDDEN: ${violations.join(', ')} (${rule.hint})`);
  }
}

// 债务清单本身必须跟着收缩：某条已不再命中任何规则（或文件已删除）却继续留着，
// 这道门禁就对「新增」失去敏感度——它只会证明历史，不再约束现在。条目只在迁移
// 完成时删除，不允许长期挂空。
const staleControlDomDebt = [...controlDomDebt].filter((relative) => {
  const file = join(browserRoot, relative);
  if (!existsSync(file)) return true;
  const source = readFileSync(file, 'utf8');
  return !formPrimitiveRules.some((rule) => {
    if (!rule.test(source)) return false;
    if (rule.id === 'CONTROL_TEMPLATE_NOT_ADOPTED' && isAdoptedTemplateOwner(relative, source)) {
      return false;
    }
    return true;
  });
});

if (staleControlDomDebt.length > 0) {
  throw new Error(
    `DESIGNER_UI_CONTROL_DOM_DEBT_STALE: ${staleControlDomDebt.join(', ')} (迁移完成后请从 controlDomDebt 删除对应行)`,
  );
}
