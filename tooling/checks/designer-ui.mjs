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
const formPrimitiveDebt = new Set([
  // 自绘控件：类名与结构都不走设计体系控件。
  'controllers/project/designer-project-workspace-controller.ts',
  'dom/color/designer-color-palette-dom.ts',
  'dom/color/designer-color-palette-value-dom.ts',
  'dom/color/designer-fill-color-picker-dom.ts',
  'dom/descriptor/designer-descriptor-stepper-dom.ts',
  // 独立表单语汇（`variable-field`）或尚未迁移行结构的绑定面板。
  'dom/blueprint/designer-blueprint-library-dom.ts',
  'dom/panel/designer-multi-selection-dom.ts',
]);

// 两个来源模块本身是唯一合法的产出点。
const formPrimitiveOrigins = new Set([
  'dom/designer-field-primitives.ts',
  'dom/designer-ui-primitives.ts',
]);

const formPrimitiveRules = [
  {
    id: 'RAW_FORM_CONTROL',
    pattern: /createElement\(\s*(['"])(?:input|select|textarea)\1\s*\)/,
    hint: 'use designer-ui-primitives',
  },
  {
    id: 'HAND_BUILT_FIELD_ROW',
    pattern: /['"]designer-field designer-field-label/,
    hint: 'use createDesignerFieldRow / createDesignerFieldElement',
  },
];

for (const rule of formPrimitiveRules) {
  const violations = browserFiles
    .filter((file) => {
      const relative = relativeFromBrowser(file);
      return !formPrimitiveOrigins.has(relative) && !formPrimitiveDebt.has(relative);
    })
    .filter((file) => rule.pattern.test(readFileSync(file, 'utf8')))
    .map(relativeFromBrowser);
  if (violations.length > 0) {
    throw new Error(`DESIGNER_UI_${rule.id}_FORBIDDEN: ${violations.join(', ')} (${rule.hint})`);
  }
}

// 债务清单本身必须跟着收缩：某条已不再命中任何规则（或文件已删除）却继续留着，
// 这道门禁就对「新增」失去敏感度——它只会证明历史，不再约束现在。条目只在迁移
// 完成时删除，不允许长期挂空。
const staleFormPrimitiveDebt = [...formPrimitiveDebt].filter((relative) => {
  const file = join(browserRoot, relative);
  if (!existsSync(file)) {
    return true;
  }
  const source = readFileSync(file, 'utf8');
  return !formPrimitiveRules.some((rule) => rule.pattern.test(source));
});

if (staleFormPrimitiveDebt.length > 0) {
  throw new Error(
    `DESIGNER_UI_FORM_PRIMITIVE_DEBT_STALE: ${staleFormPrimitiveDebt.join(', ')} (迁移完成后请从 formPrimitiveDebt 删除对应行)`,
  );
}
