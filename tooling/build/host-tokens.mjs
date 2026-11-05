import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 宿主公共令牌层生成器（方案 B，见 docs/design/host-public-tokens.md）。
//
// 唯一真源是 packages/engine/src/browser/styles/designer-tokens.css：这里只声明「公共名 → 源令牌」
// 的映射与固定输出顺序，值全部从源文件读取，绝不手写字面量。生成物提交仓库，由
// tooling/checks/host-tokens.mjs 做「重新生成必须无 diff」的比对。
//
// 输出必须做两件改写，缺一不可：
// 1. 解包覆盖位：`var(--base-screen-designer-x, 兜底)` 只取兜底值。公共层要的是烘焙值，不是
//    引擎的覆盖钩子——否则宿主改引擎颜色会串到宿主面板，而宿主面板未必和引擎同主题。
// 2. 重映射内部标识符：值里的 `var(--designer-x)` 全部改写成 `var(--bs-host-<公共名>)`。
//    elev-ring / scrollbar-thumb / action-primary 的值本身就是内部令牌派生，直接拷贝会把
//    内部命名漏进公共层，并在宿主页面（没有引擎 shadow 作用域）解析失败。

const root = fileURLToPath(new URL('../../', import.meta.url));
const tokensPath = 'packages/engine/src/browser/styles/designer-tokens.css';
const outputPath = 'packages/engine/src/browser/styles/host/host-tokens.css';

/** 主题相关令牌：浅/深两个选择器块各自取一次。`public` 与源同名时省略第三项。 */
const THEME_TOKENS = [
  ['surface-workspace'],
  ['surface-panel'],
  ['surface-raised'],
  ['surface-control'],
  ['surface-control-hover'],
  ['surface-control-active'],
  ['surface-overlay'],
  ['surface-canvas'],
  // 宿主对话框的遮罩与设计器模态同一档：宿主自写 rgb(0 0 0 / 70%) 在浅色主题下会明显更重。
  ['surface-scrim'],
  ['text-primary'],
  ['text-secondary'],
  ['text-muted'],
  ['text-disabled'],
  ['text-on-accent'],
  ['border-subtle'],
  ['border-default'],
  ['border-strong'],
  ['accent'],
  ['accent-surface'],
  ['accent-text'],
  ['focus-ring'],
  ['elev-ring'],
  ['shadow-overlay'],
  ['shadow-float'],
  ['success'],
  ['success-surface'],
  ['warning'],
  ['warning-surface'],
  ['danger'],
  ['danger-surface'],
  ['danger-text'],
  // 引擎里叫 button-primary-*（控制层构件），公共层按「主操作」语义改名。
  ['action-primary', 'button-primary-background'],
  ['action-primary-hover', 'button-primary-hover'],
  ['action-primary-active', 'button-primary-active'],
];

/** 与主题无关的共享令牌：取自裸 `:host` 块。这些源令牌没有覆盖位，公共层只提供读取。 */
const SHARED_TOKENS = [
  ['space-1'],
  ['space-2'],
  ['space-3'],
  ['space-4'],
  ['space-5'],
  ['space-6'],
  ['space-7'],
  ['space-8'],
  ['radius-1'],
  ['radius-2'],
  ['radius-3'],
  ['radius-4'],
  ['radius-5'],
  ['radius-pill'],
  ['radius-control'],
  ['radius-overlay'],
  ['control-height'],
  ['control-height-compact'],
  ['control-padding-inline'],
  ['icon-size'],
  ['icon-size-xs'],
  ['icon-size-sm'],
  ['icon-size-lg'],
  ['row-height'],
  ['row-height-comfortable'],
  ['row-height-compact'],
  ['column-header-height'],
  // 图墙卡片几何：宿主素材卡与引擎物料卡同宽同比例，否则两个左栏面板拼在一起会一大一小。
  ['card-min-width'],
  ['card-gap'],
  ['card-thumb-aspect'],
  ['font-family'],
  ['font-family-mono'],
  ['font-size-xs'],
  ['font-size-sm'],
  ['font-size-base'],
  ['font-size-md'],
  ['font-size-lg'],
  ['font-size-xl'],
  ['font'],
  ['font-small'],
  ['font-numeric'],
  ['tracking-ui'],
  ['tracking-base'],
  ['motion'],
  ['motion-emphasis'],
  // 滚动条在裸 :host 里声明，但值派生自主题令牌（border-strong / text-muted），
  // 因此放在共享块即可自动跟随主题，无需在浅色块重复。
  ['scrollbar-thumb'],
  ['scrollbar-thumb-hover'],
  ['scrollbar-track'],
  ['scrollbar-corner'],
];

export class HostTokenError extends Error {
  constructor(code, detail) {
    super(`${code}:${detail}`);
    this.name = 'HostTokenError';
    this.code = code;
  }
}

/**
 * 把源令牌声明重写成公共层可用的值：解包覆盖位 + 重映射内部标识符。
 * @param {string} value 源声明右侧的值
 * @param {Map<string, string>} publicNameBySource 源令牌名 → 公共名
 */
export function rewriteTokenValue(value, publicNameBySource) {
  let next = unwrapPublicHook(value.trim());
  if (next.includes('--base-screen-designer-')) {
    throw new HostTokenError('HOST_TOKENS_INTERNAL_LEAK', next);
  }
  next = next.replace(/var\(\s*--designer-([a-z0-9-]+)\s*\)/g, (_match, sourceName) => {
    const publicName = publicNameBySource.get(sourceName);
    if (publicName === undefined) {
      throw new HostTokenError('HOST_TOKENS_REMAP_UNKNOWN', sourceName);
    }
    return `var(--bs-host-${publicName})`;
  });
  if (/var\(\s*--designer-/.test(next)) {
    throw new HostTokenError('HOST_TOKENS_INTERNAL_LEAK', next);
  }
  return next;
}

/** `var(--base-screen-designer-x, 兜底)` 整体是一个 var() 时只留兜底值。 */
function unwrapPublicHook(value) {
  // 源文件会把长值折成多行（`var(\n  --base-screen-designer-x,\n  …)`），前缀必须容忍空白。
  if (!/^var\(\s*--base-screen-designer-/.test(value) || !value.endsWith(')')) return value;
  const comma = topLevelCommaIndex(value);
  if (comma < 0) {
    throw new HostTokenError('HOST_TOKENS_SOURCE_MISSING', `unhooked override: ${value}`);
  }
  return value.slice(comma + 1, -1).trim();
}

/** 找到 var() 第一个顶层逗号（跳过括号内的逗号，例如 rgb(...) / color-mix(...)）。 */
function topLevelCommaIndex(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 1) return index;
  }
  return -1;
}

function readTokensSource() {
  const file = resolve(root, tokensPath);
  if (!existsSync(file)) {
    throw new HostTokenError('HOST_TOKENS_SOURCE_MISSING', tokensPath);
  }
  return readFileSync(file, 'utf8');
}

/** 切出某个选择器对应的声明块（按大括号平衡）。 */
function sliceBlock(css, selectorStart) {
  const braceStart = css.indexOf('{', selectorStart);
  if (braceStart < 0) throw new HostTokenError('HOST_TOKENS_SOURCE_MALFORMED', selectorStart);
  let depth = 0;
  for (let index = braceStart; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(braceStart + 1, index);
    }
  }
  throw new HostTokenError('HOST_TOKENS_SOURCE_MALFORMED', 'unbalanced block');
}

/** 按分号切声明，跳过括号/引号内的分号。返回 Map<令牌名, 值>。 */
function parseDeclarations(block) {
  const declarations = new Map();
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let start = 0;
  const push = (segment) => {
    const colon = segment.indexOf(':');
    if (colon < 0) return;
    const name = segment.slice(0, colon).trim();
    if (!name.startsWith('--designer-')) return;
    declarations.set(name.slice('--designer-'.length), segment.slice(colon + 1).trim());
  };
  for (let index = 0; index < withoutComments.length; index += 1) {
    const char = withoutComments[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ';' && depth === 0) {
      push(withoutComments.slice(start, index));
      start = index + 1;
    }
  }
  push(withoutComments.slice(start));
  return declarations;
}

function readBlocks(css) {
  const lightStart = css.indexOf(':host([theme="light"])');
  const darkStart = css.lastIndexOf(':host,', css.indexOf(':host([theme="dark"])'));
  const sharedStart = css.indexOf(':host {');
  if (lightStart < 0 || darkStart < 0 || sharedStart < 0) {
    throw new HostTokenError(
      'HOST_TOKENS_SOURCE_MALFORMED',
      'expected :host / light / dark blocks',
    );
  }
  return {
    shared: parseDeclarations(sliceBlock(css, sharedStart)),
    light: parseDeclarations(sliceBlock(css, lightStart)),
    dark: parseDeclarations(sliceBlock(css, darkStart)),
  };
}

function requireValue(declarations, sourceName, scope) {
  const value = declarations.get(sourceName);
  if (value === undefined) {
    throw new HostTokenError('HOST_TOKENS_SOURCE_UNKNOWN', `${scope}:${sourceName}`);
  }
  return value;
}

function publicNameMap() {
  const map = new Map();
  for (const [publicName, sourceName = publicName] of THEME_TOKENS) {
    map.set(sourceName, publicName);
  }
  for (const [publicName, sourceName = publicName] of SHARED_TOKENS) {
    map.set(sourceName, publicName);
  }
  return map;
}

/**
 * 渲染生成物。导出供检查脚本复用：生成与校验共用同一份清单与同一套改写逻辑，
 * 两边不可能分叉。
 */
export function renderHostTokens() {
  const css = readTokensSource();
  const blocks = readBlocks(css);
  const names = publicNameMap();

  const dark = THEME_TOKENS.map(([publicName, sourceName = publicName]) => {
    const value = rewriteTokenValue(requireValue(blocks.dark, sourceName, 'dark'), names);
    return `--bs-host-${publicName}: ${value};`;
  });
  const light = THEME_TOKENS.map(([publicName, sourceName = publicName]) => {
    const value = rewriteTokenValue(requireValue(blocks.light, sourceName, 'light'), names);
    return `--bs-host-${publicName}: ${value};`;
  });
  const shared = SHARED_TOKENS.map(([publicName, sourceName = publicName]) => {
    const value = rewriteTokenValue(requireValue(blocks.shared, sourceName, 'shared'), names);
    return `--bs-host-${publicName}: ${value};`;
  });

  return [
    '/* 宿主公共令牌层（--bs-host-*），由 tooling/build/host-tokens.mjs 从',
    '   packages/engine/src/browser/styles/designer-tokens.css 生成，勿手改。',
    '   契约：名字是公共 API，值随视觉调优演进而变；说明见 docs/design/host-public-tokens.md。 */',
    '',
    '/* 深色（默认）：与设计器裸 :host 主题一致。这里只声明自定义属性 + color-scheme，',
    '   不写任何组件样式，也不改宿主元素的既有表现。 */',
    ':where(.bs-host) {',
    '  color-scheme: dark;',
    '',
    ...prefixLines(dark, '  '),
    '',
    ...prefixLines(shared, '  '),
    '}',
    '',
    '/* 浅色：宿主显式写 theme="light"，或作为 base-screen-designer 的 light DOM 子节点跟随',
    '   设计器主题。:where() 保持零特异性，宿主任何类选择器都能覆盖单个令牌。 */',
    ':where(.bs-host[theme="light"], base-screen-designer[theme="light"] .bs-host) {',
    '  color-scheme: light;',
    '',
    ...prefixLines(light, '  '),
    '}',
    '',
  ].join('\n');
}

function prefixLines(lines, indent) {
  return lines.map((line) => `${indent}${line}`);
}

/** 公共名清单（供门禁做兼容快照比对）。 */
export function hostTokenNames() {
  return [
    ...THEME_TOKENS.map(([publicName]) => `--bs-host-${publicName}`),
    ...SHARED_TOKENS.map(([publicName]) => `--bs-host-${publicName}`),
  ];
}

/** 主题组公共名（浅/深两个选择器块必须成对声明）。 */
export function hostThemeTokenNames() {
  return THEME_TOKENS.map(([publicName]) => `--bs-host-${publicName}`);
}

function main(argv) {
  const mode = argv.includes('--check') ? 'check' : argv.includes('--emit') ? 'emit' : 'write';
  const output = resolve(root, outputPath);
  if (mode === 'emit') {
    const engineDist = resolve(root, 'packages/engine/dist');
    const target = resolve(engineDist, 'host-tokens.css');
    if (!existsSync(output)) {
      console.error('HOST_TOKENS_SOURCE_MISSING: run node tooling/build/host-tokens.mjs first');
      process.exitCode = 1;
      return;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(output));
    console.log(`host-tokens emitted -> ${target}`);
    return;
  }

  let rendered;
  try {
    rendered = renderHostTokens();
  } catch (error) {
    if (error instanceof HostTokenError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (mode === 'check') {
    const current = existsSync(output) ? readFileSync(output, 'utf8') : '';
    if (current !== rendered) {
      console.error(`HOST_TOKENS_STALE: ${outputPath} 需要重新生成`);
      process.exitCode = 1;
      return;
    }
    console.log('host-tokens up to date');
    return;
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rendered);
  console.log(`host-tokens written -> ${outputPath}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) main(process.argv.slice(2));
