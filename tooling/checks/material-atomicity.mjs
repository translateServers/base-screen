import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * 物料原子化的源码门禁。AGENTS.md「物料原子化」是约定，这里把它变成可执行检查。
 *
 * 为什么不在 `plugin-core` 的 manifest 校验里做：契约层的拒绝是运行时的，而
 * `tooling/verification/browser-harness` 的三个演示物料（`harness.semantic-chart`、
 * `harness.dataset-ranking`、inspector 控件样例）本就带 `title`/`caption` props，
 * 用来演示复合作者面。把它们改名规避清单等于把门禁变成摆设，而直接打破 harness 又不是
 * 本门禁的职权。因此描述性文案 prop 的禁令分三层：官方物料与插件物料由本脚本 R2 把守，
 * 宿主示例由 R3 把守（连 `label` 一起禁），DataV 插件另有
 * `plugins/plugin-datav-materials/tests/plugin.test.ts` 的清单断言。
 */

/** 只描述"这个组件是什么"的 prop 名：需要标题时由文档层另放一个 `base.text` 组合。 */
const FORBIDDEN_TEXT_PROPS = [
  'title',
  'caption',
  'description',
  'subtitle',
  'showTitle',
  'titleText',
];

/**
 * R2 的扫描范围：官方物料、外围插件物料，以及 harness 的演示物料。
 * 豁免见 `CHART_FURNITURE_EXEMPTIONS`；`tooling/material-mcp-server` 的模板字符串不参与。
 */
const MATERIAL_GLOBS = ['packages/material/src', 'plugins', 'tooling/verification/browser-harness'];

/** R3 的扫描范围：宿主示例自有的物料实现，连 `label` 一起禁。 */
const HOST_MATERIAL_GLOBS = ['examples'];
const HOST_FORBIDDEN_TEXT_PROPS = [...FORBIDDEN_TEXT_PROPS, 'label'];

/**
 * 只豁免"描述性文案 prop"这一条，不豁免"读取未声明字段"那条。
 *
 * 图表类物料的 `title`/`legend`/`axis` 是图形自身的构件（ECharts option 的组成部分，
 * 与 `series`、`grid` 同级），不是贴在控件外面的一行说明标签；把它们拆成独立物料会让
 * 图表无法自洽。非图表物料一律不豁免——DataV 的 `border-box` 就是按这条把原本的标题栏
 * 删掉的。
 */
const CHART_FURNITURE_EXEMPTIONS = [
  'plugins/plugin-echarts/src/manifest.ts',
  'tooling/verification/browser-harness/semantic-chart-material.ts',
  'tooling/verification/browser-harness/hosted-material-package.ts',
  'tooling/verification/browser-harness/inspector-control-fixture.ts',
];

function isChartFurnitureExempt(relativePath) {
  return CHART_FURNITURE_EXEMPTIONS.includes(relativePath);
}

/**
 * 从 `properties: { ... }` 块里取出声明过的键名。按大括号深度扫描，
 * 因此嵌套 schema（如 `legend: { kind: 'object', properties: { ... } }`）的内层键
 * 也会被收进来——这是有意的宽松：R2 只负责抓"整个文件里根本没声明过"的读取。
 */
function collectDeclaredKeys(source) {
  const keys = new Set();
  const marker = /properties\s*:\s*\{/g;
  let match;
  while ((match = marker.exec(source)) !== null) {
    let depth = 0;
    let index = marker.lastIndex - 1;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) break;
      } else if (depth === 1) {
        const rest = source.slice(index);
        const keyMatch = /^([A-Za-z_$][\w$]*)\s*:/.exec(rest);
        if (keyMatch !== null) keys.add(keyMatch[1]);
      }
    }
  }
  return keys;
}

/**
 * 物料读取 model 上 props/style 的位置。两类：
 * 1. 显式 `model.props.X` / `model.style.X`（含下标形式）；
 * 2. 解构后的裸别名 `style.X` / `props.X`（`const { style } = model`）。
 * 裸别名要求前面不是 `.`，因此 `this.style.display`、`element.style.width` 这类
 * CSSStyleDeclaration 写入不会被误判成 model 读取。
 */
const MODEL_PROPERTY_READS = [
  /\bmodel\s*\.\s*(?:props|style)\s*\.\s*([A-Za-z_$][\w$]*)/g,
  /\bmodel\s*\.\s*(?:props|style)\s*\[\s*'([^']+)'\s*\]/g,
  /(?:^|[^.\w$])(?:props|style)\s*\.\s*([A-Za-z_$][\w$]*)/g,
];

function collectReads(source) {
  const reads = [];
  for (const pattern of MODEL_PROPERTY_READS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source)) !== null) {
      reads.push({ key: match[1], index: match.index });
    }
  }
  return reads;
}

/** 描述性文案 prop 是否被当作 manifest 的 prop 键声明。 */
function collectForbiddenPropKeys(source, forbidden) {
  const declared = collectDeclaredKeys(source);
  return [...declared].filter((key) => forbidden.includes(key));
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    // pnpm 会把 workspace 依赖软链进各包的 node_modules，跟着走会把同一个测试文件
    // 数上好几遍；测试与 fixture 里的 manifest 是校验用例，不代表物料形态。
    if (entry === 'node_modules' || entry === '__fixtures__' || entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full;
  }
}

function filesUnder(glob) {
  const base = resolve(root, glob);
  try {
    return [...walk(base)];
  } catch {
    return [];
  }
}

const failures = [];

for (const glob of MATERIAL_GLOBS) {
  for (const file of filesUnder(glob)) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file).replace(/\\/g, '/');
    // 只检查声明了 manifest 的物料实现文件，工具/类型文件不参与。
    if (!source.includes('propsSchema')) continue;
    // "读取 model 上未声明的字段"只在物料渲染路径上成立：harness 页面里 Vue/React
    // 组件自己的 `props.X` 不是 model 读取。
    if (source.includes('renderMaterial')) {
      const declared = collectDeclaredKeys(source);
      for (const { key, index } of collectReads(source)) {
        if (declared.size > 0 && !declared.has(key)) {
          const line = source.slice(0, index).split('\n').length;
          failures.push(`${rel}:${line} 读取了未在 manifest 声明的 ${key}`);
        }
      }
    }
    for (const key of collectForbiddenPropKeys(source, FORBIDDEN_TEXT_PROPS)) {
      if (!isChartFurnitureExempt(rel)) {
        failures.push(`${rel} 把 ${key} 声明成了 prop（描述组件自身的文案应交给 base.text）`);
      }
    }
  }
}

for (const glob of HOST_MATERIAL_GLOBS) {
  for (const file of filesUnder(glob)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('propsSchema')) continue;
    const rel = relative(root, file).replace(/\\/g, '/');
    for (const key of collectForbiddenPropKeys(source, HOST_FORBIDDEN_TEXT_PROPS)) {
      failures.push(`${rel} 把 ${key} 声明成了 prop（宿主物料同样要原子化）`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(
    `MATERIAL_ATOMICITY_CHECK_FAILED:\n  ${[...new Set(failures)].join('\n  ')}\n` +
      '依据：AGENTS.md「物料原子化（组件制作约定）」与 plugins/plugin-datav-materials 的 title 断言。',
  );
}

console.log('material atomicity check passed.');
