import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
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
