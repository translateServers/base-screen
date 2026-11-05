import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HostTokenError, hostThemeTokenNames, renderHostTokens } from '../build/host-tokens.mjs';

// 宿主公共令牌层的门禁（方案 B，见 docs/design/host-public-tokens.md）。
//
// 与 designer-styles.mjs 的 publicTokens 是两套契约，不要合并：
// - publicTokens 守「宿主能否改引擎颜色」（--base-screen-designer-* 覆盖位的完整性）；
// - 这里守「宿主能读什么值」（--bs-host-* 公共名的集合与双主题配对）。
//
// 名字快照是必需的：只做「重新生成无 diff」时，删掉一个公共令牌只要重新生成就静默通过，
// 宿主升级后才在运行时炸掉。快照让任何删除/改名都必须显式改这一处，出现在 PR diff 里。

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputPath = 'packages/engine/src/browser/styles/host/host-tokens.css';

/** 兼容基线：公共名只能通过显式修改这份快照来增删。 */
const HOST_TOKEN_NAMES = [
  '--bs-host-surface-workspace',
  '--bs-host-surface-panel',
  '--bs-host-surface-raised',
  '--bs-host-surface-control',
  '--bs-host-surface-control-hover',
  '--bs-host-surface-control-active',
  '--bs-host-surface-overlay',
  '--bs-host-surface-canvas',
  '--bs-host-surface-scrim',
  '--bs-host-text-primary',
  '--bs-host-text-secondary',
  '--bs-host-text-muted',
  '--bs-host-text-disabled',
  '--bs-host-text-on-accent',
  '--bs-host-border-subtle',
  '--bs-host-border-default',
  '--bs-host-border-strong',
  '--bs-host-accent',
  '--bs-host-accent-surface',
  '--bs-host-accent-text',
  '--bs-host-focus-ring',
  '--bs-host-elev-ring',
  '--bs-host-shadow-overlay',
  '--bs-host-shadow-float',
  '--bs-host-success',
  '--bs-host-success-surface',
  '--bs-host-warning',
  '--bs-host-warning-surface',
  '--bs-host-danger',
  '--bs-host-danger-surface',
  '--bs-host-danger-text',
  '--bs-host-action-primary',
  '--bs-host-action-primary-hover',
  '--bs-host-action-primary-active',
  '--bs-host-space-1',
  '--bs-host-space-2',
  '--bs-host-space-3',
  '--bs-host-space-4',
  '--bs-host-space-5',
  '--bs-host-space-6',
  '--bs-host-space-7',
  '--bs-host-space-8',
  '--bs-host-radius-1',
  '--bs-host-radius-2',
  '--bs-host-radius-3',
  '--bs-host-radius-4',
  '--bs-host-radius-5',
  '--bs-host-radius-pill',
  '--bs-host-radius-control',
  '--bs-host-radius-overlay',
  '--bs-host-control-height',
  '--bs-host-control-height-compact',
  '--bs-host-control-padding-inline',
  '--bs-host-icon-size',
  '--bs-host-icon-size-xs',
  '--bs-host-icon-size-sm',
  '--bs-host-icon-size-lg',
  '--bs-host-row-height',
  '--bs-host-row-height-comfortable',
  '--bs-host-row-height-compact',
  '--bs-host-column-header-height',
  '--bs-host-card-min-width',
  '--bs-host-card-gap',
  '--bs-host-card-thumb-aspect',
  '--bs-host-font-family',
  '--bs-host-font-family-mono',
  '--bs-host-font-size-xs',
  '--bs-host-font-size-sm',
  '--bs-host-font-size-base',
  '--bs-host-font-size-md',
  '--bs-host-font-size-lg',
  '--bs-host-font-size-xl',
  '--bs-host-font',
  '--bs-host-font-small',
  '--bs-host-font-numeric',
  '--bs-host-tracking-ui',
  '--bs-host-tracking-base',
  '--bs-host-motion',
  '--bs-host-motion-emphasis',
  '--bs-host-scrollbar-thumb',
  '--bs-host-scrollbar-thumb-hover',
  '--bs-host-scrollbar-track',
  '--bs-host-scrollbar-corner',
];

const outputFile = resolve(root, outputPath);
if (!existsSync(outputFile)) {
  throw new Error(`HOST_TOKENS_STALE:missing ${outputPath}`);
}
const current = readFileSync(outputFile, 'utf8');

// 1) 唯一真源不漂移：重新生成必须逐字节一致。源令牌改名/改值时，这里先红。
let rendered;
try {
  rendered = renderHostTokens();
} catch (error) {
  if (error instanceof HostTokenError) throw new Error(error.message);
  throw error;
}
if (rendered !== current) {
  throw new Error(
    `HOST_TOKENS_STALE:${outputPath} 需要重新生成（node tooling/build/host-tokens.mjs）`,
  );
}

// 2) 生成物不得漏出引擎内部命名：漏一个就会在宿主页面（没有引擎 shadow 作用域）解析失败，
//    也会把内部命名变成事实上的公共 API。
if (/--base-screen-designer-|--designer-/.test(current)) {
  throw new Error('HOST_TOKENS_INTERNAL_LEAK');
}

// 3) 双主题配对：浅色块必须声明全部主题组令牌。漏一个不会报错，只会让该令牌在浅色下
//    退回深色值——肉眼要切主题才看得见，只能靠断言点名。
const lightBlock = /:where\(\.bs-host\[theme="light"\][\s\S]*?\{([\s\S]*?)\}/.exec(current);
if (lightBlock === null) throw new Error('HOST_TOKENS_THEME_BLOCK_MISSING');

// 3b) 作用域锚点：两个主题来源少一个，「slot 内跟随设计器主题」或「宿主对话框自带主题」
//     就有一条路径静默失效。这里静态守住选择器文本（浏览器断言只验证 DOM 关系）。
if (!current.includes(':where(.bs-host) {')) {
  throw new Error('HOST_TOKENS_ANCHOR_MISSING:default');
}
if (!current.includes('base-screen-designer[theme="light"] .bs-host')) {
  throw new Error('HOST_TOKENS_ANCHOR_MISSING:designer-theme');
}
if ((current.match(/color-scheme:\s*(dark|light);/g) ?? []).length !== 2) {
  throw new Error('HOST_TOKENS_COLOR_SCHEME_MISSING');
}
const lightDeclarations = new Set(
  [...lightBlock[1].matchAll(/(--bs-host-[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
);
for (const name of hostThemeTokenNames()) {
  if (!lightDeclarations.has(name)) {
    throw new Error(`HOST_TOKENS_THEME_PAIR_MISSING:${name}`);
  }
}

// 4) 名字快照：公共名集合必须与兼容基线完全相等。
const declared = new Set(
  [...current.matchAll(/(--bs-host-[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
);
const baseline = new Set(HOST_TOKEN_NAMES);
const added = [...declared].filter((name) => !baseline.has(name)).sort();
const removed = [...baseline].filter((name) => !declared.has(name)).sort();
if (added.length > 0 || removed.length > 0) {
  throw new Error(
    `HOST_TOKENS_NAMES_DRIFT:added=${added.join(',') || '-'};removed=${removed.join(',') || '-'}`,
  );
}

// 5) 清单自洽：快照不得缺少生成器当前会产出的名字（防止只改快照不改清单造成的静默偏移）。
const generated = new Set(hostThemeTokenNames());
for (const name of generated) {
  if (!baseline.has(name)) throw new Error(`HOST_TOKENS_NAMES_DRIFT:theme=${name}`);
}

console.log(`host-tokens ok: ${declared.size} tokens`);
