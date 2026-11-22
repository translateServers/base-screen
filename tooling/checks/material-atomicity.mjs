import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * 物料原子化的源码门禁。AGENTS.md「物料原子化」是约定，这里把它变成可执行检查。
 *
 * 为什么不在 `plugin-core` 的 manifest 校验里做：契约层的拒绝是运行时的，而
 * `tooling/verification/browser-harness` 的三个演示物料（`harness.semantic-chart`、
 * `harness.dataset-ranking`、inspector 控件样例）本就带 `title`/`caption` props，
 * 用来演示复合作者面。把它们改名规避清单等于把门禁变成摆设，而直接打破 harness 又不是
 * 本门禁的职权。因此描述性文案 prop 的禁令分三层：官方物料与插件物料由本脚本 R2 把守，
 * 宿主示例由 R3 把守（连 `label` 一起禁），大屏组件插件另有
 * `plugins/plugin-materials/tests/board/plugin.test.ts` 的清单断言。
 *
 * R4–R9 落实 ADR-0099（原子物料范式与属性面板编排，见 base-screen-docs 仓库
 * `decisions/ADR-0099-material-atomicity-and-inspector-paradigm.md`）。
 * R10 落实 ADR-0100（组合分片正式化）的 F2/F3/F8：分片引用的物料必须在交付面有声明，
 * 插件分片只能引用本插件或官方（`base.*`）物料，文案节点必须是 `base.text`。
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
 * 豁免见 `CHART_FURNITURE_EXEMPTIONS`。
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
 * 图表无法自洽。非图表物料一律不豁免——`board.border-box` 就是按这条把原本的标题栏
 * 删掉的。
 */
const CHART_FURNITURE_EXEMPTIONS = [
  'plugins/plugin-materials/src/echarts/manifest.ts',
  'tooling/verification/browser-harness/semantic-chart-material.ts',
  'tooling/verification/browser-harness/hosted-material-package.ts',
  'tooling/verification/browser-harness/inspector-control-fixture.ts',
];

/**
 * R4–R9 的扫描范围：交付面的物料（官方、外围插件、宿主示例）。
 *
 * browser-harness 不在内：它的演示物料按设计展示各种作者面形态（含 `xField` 这类
 * 手填字段），是验证夹具而不是物料范式的样板。它仍受 R1/R2 约束。
 */
const PARADIGM_GLOBS = ['packages/material/src', 'plugins', 'examples'];

/** 保留样式键的唯一声明处；本门禁只读取，不复制清单（引用而不复制）。 */
const RESERVED_STYLE_SOURCE = 'packages/plugin-core/src/material/material-schema.ts';
const RESERVED_STYLE_EXPORT = 'export const BASE_SCREEN_RESERVED_STYLE_SCHEMAS';

/** ADR-0099 §2.6 样式键词典。改动须与 ADR 同步。 */
const STYLE_KEY_DICTIONARY = new Set([
  'fill',
  'backgroundColor',
  'color',
  'labelColor',
  'accentColor',
  'fontSize',
  'labelFontSize',
  'borderColor',
  'borderWidth',
  'borderRadius',
  'strokeColor',
  'strokeWidth',
  'fontWeight',
  'textAlign',
  'verticalAlign',
  'letterSpacing',
  'lineHeight',
  'lineSpacing',
  'shadowColor',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'criticalColor',
  'warningColor',
  'infoColor',
  'runningColor',
  'standbyColor',
  'faultColor',
  'offlineColor',
  'unknownColor',
]);

/**
 * R4 已登记的词典外 style 键（ADR-0099 §6 决议 2：R4 只约束新增键）。
 *
 * 新物料可以复用这里的键；要新增词典外的键，必须在评审中说明为何不能复用词典键，
 * 并把它登记到这里——登记本身就是评审留痕。键名须带物料语义前缀（如 `trackColor`）。
 */
const REGISTERED_STYLE_KEYS = new Set([
  'accent',
  'background',
  'connectorColor',
  'connectorWidth',
  'dash',
  'fillColor',
  'fillGlow',
  'gridColor',
  'headerBackgroundColor',
  'headerColor',
  'lineWidth',
  'nodeBackground',
  'nodeBorderColor',
  'objectFit',
  'rowHeight',
  'seriesColor',
  'thickness',
  'tileGap',
  'tileRadius',
  'trackColor',
  'valueColor',
  'waterColor',
  'waveColor',
]);

/** R5：label 里的单位记号。单位应走字段 `unit` 或 `unit-number` 控件。 */
const UNIT_IN_LABEL = /[（(]\s*(?:px|ms|s|秒|毫秒|分钟|%|°|度)\s*[)）]/i;

/**
 * R7：字段映射类 prop 名。映射应走 `dataBinding.roles`，或在检查器里用 `field-selector`
 * 选择（ADR-0099 §2.3）；只能经 text/json 控件手填时违规。
 */
const FIELD_MAPPING_PROP = /(?:Column|Field)$/;

/** R8：状态文案 prop。空态 / 加载态文案由 `@base-screen/plugin-sdk` 状态视图统一提供。 */
const STATE_TEXT_PROP = /^(?:empty|loading|error|idle)(?:Text|Label|Message)$/;

/** R9：默认可见字段预算（警告级，不阻断）。 */
const VISIBLE_FIELD_BUDGET = 12;

/**
 * ADR-0099 §3 迁移清单中尚未偿还的存量违规（2026-11-22 已全部偿还）。
 *
 * 只能缩短：违规修复后条目必须同批删除，否则门禁报「已偿还」失败；新违规不得加进来。
 * `key` 为 `host:<prop>` 时表示渲染路径写宿主元素样式（R6 第二条）。
 */
export const PARADIGM_DEBT = [];

/** R10：识别分片定义所在文件（类型标注、SDK 定义函数或插件贡献 kind）。 */
const FRAGMENT_SOURCE_MARKER =
  /\bBaseScreenFragmentDefinition\b|\bdefineBaseScreenFragment\s*\(|kind\s*:\s*'fragment'/;
/** R10（F3）：承载文案的节点键。标题、说明一律由 `base.text` 承担，不让别的物料长出文案。 */
const FRAGMENT_TEXT_NODE_KEY = /^(?:title|subtitle|caption|label|heading|description|desc)$/i;
const OFFICIAL_TEXT_TYPE = 'base.text';
const OFFICIAL_TYPE_PREFIX = 'base.';

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

/**
 * 面板条目：扁平 `propertyPanel`/`stylePanel`（`{ prop|style, label, control }`）与
 * `editorDescriptor` 字段（`{ target, projection?, path, label, control, advanced? }`）。
 *
 * 只认不含嵌套大括号的对象字面量。扁平条目必须带 `control`；描述符字段的 `control` 可省略
 * （ADR-0102 D2，按语义推导），以 `target` + `path` 识别。`itemFields` 内层条目因此按自身
 * 被识别，外层数组容器不会被误当成字段。`interaction` 字段按 `projection` 归入 props/style，
 * `data` 字段不计入（由 Engine 的数据区渲染）。
 *
 * `origin` 区分扁平面板与描述符字段；`hidden` 标记默认不可见的字段：字段自身 `advanced`，
 * 或位于 `collapsed` / `advanced` 分区里。
 */
function collectPanelEntries(source) {
  const entries = [];
  const hiddenRanges = collectHiddenFieldRanges(source);
  const objectLiteral = /\{([^{}]*)\}/g;
  let match;
  while ((match = objectLiteral.exec(source)) !== null) {
    const body = match[1];
    const declaredControl = readLiteral(body, 'control');
    if (declaredControl === undefined && readLiteral(body, 'target') === undefined) continue;
    const line = lineOf(source, match.index);
    const label = readLiteral(body, 'label');
    const control = readLiteral(body, 'control');
    const hidden =
      /(?<![\w$])advanced\s*:\s*true/.test(body) ||
      hiddenRanges.some(([start, end]) => match.index > start && match.index < end);
    const style = declaredControl === undefined ? undefined : readLiteral(body, 'style');
    const prop = declaredControl === undefined ? undefined : readLiteral(body, 'prop');
    if (style !== undefined) {
      entries.push({ origin: 'flat', target: 'style', key: style, label, control, hidden, line });
      continue;
    }
    if (prop !== undefined) {
      entries.push({ origin: 'flat', target: 'props', key: prop, label, control, hidden, line });
      continue;
    }
    const target = readLiteral(body, 'target');
    const projection = readLiteral(body, 'projection');
    const effective = target === 'interaction' ? projection : target;
    const path = /(?<![\w$])path\s*:\s*\[\s*'([A-Za-z_$][\w$]*)'/.exec(body)?.[1];
    if ((effective === 'props' || effective === 'style') && path !== undefined) {
      const entry = { target: effective, key: path, label, control, hidden, line };
      entries.push({ origin: 'descriptor', ...entry });
    }
  }
  return entries;
}

/**
 * 描述符里默认收起的分区：分区对象自身（`fields` 数组之外）声明了 `collapsed: true`
 * 或 `advanced: true`。返回这些分区 `fields` 数组的源码区间。
 */
function collectHiddenFieldRanges(source) {
  const ranges = [];
  const marker = /(?<![\w$])fields\s*:\s*\[/g;
  let match;
  while ((match = marker.exec(source)) !== null) {
    const open = enclosingBrace(source, match.index);
    if (open === -1) continue;
    const fieldsEnd = matchingClose(source, marker.lastIndex - 1, '[', ']');
    const sectionEnd = matchingClose(source, open, '{', '}');
    if (fieldsEnd === -1 || sectionEnd === -1) continue;
    const header = source.slice(open, match.index) + source.slice(fieldsEnd + 1, sectionEnd);
    if (/(?<![\w$])(?:collapsed|advanced)\s*:\s*true/.test(header)) {
      ranges.push([match.index, fieldsEnd]);
    }
  }
  return ranges;
}

function enclosingBrace(source, index) {
  let depth = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = source[cursor];
    if (char === '}') depth += 1;
    else if (char === '{') {
      if (depth === 0) return cursor;
      depth -= 1;
    }
  }
  return -1;
}

function matchingClose(source, openIndex, open, close) {
  let depth = 0;
  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    if (source[cursor] === open) depth += 1;
    else if (source[cursor] === close) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function readLiteral(body, name) {
  return new RegExp(`(?<![\\w$])${name}\\s*:\\s*'([^']*)'`).exec(body)?.[1];
}

/** 对象字面量的顶层文本（嵌套 `{}` 内容剔除），用来读节点自身的 `key`/`materialType`。 */
function topLevelText(body) {
  let depth = 0;
  let text = '';
  for (const char of body) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (depth === 1) text += char;
  }
  return text;
}

/** 交付面声明的物料类型：manifest 的 `type: '...'` 字面量与 `*_TYPE = '...'` 常量。 */
function collectDeclaredMaterialTypes(source, constants) {
  const types = new Set();
  for (const match of source.matchAll(/(?<![\w$])type\s*:\s*'([a-z][\w-]*(?:\.[\w-]+)+)'/g)) {
    types.add(match[1]);
  }
  for (const match of source.matchAll(/(?<![\w$])type\s*:\s*([A-Z][A-Z0-9_]*)\b/g)) {
    const value = constants.get(match[1]);
    if (value !== undefined) types.add(value);
  }
  return types;
}

function collectStringConstants(source, constants) {
  for (const match of source.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g)) {
    constants.set(match[1], match[2]);
  }
}

/**
 * R10：分片节点。以每个 `materialType:` 所在的对象字面量为一个条目（外壳或节点），
 * 读它顶层的 `key` 与 `materialType`（字面量或大写常量）。
 */
function collectFragmentEntries(source, constants) {
  const entries = [];
  for (const match of source.matchAll(/(?<![\w$])materialType\s*:/g)) {
    const open = enclosingBrace(source, match.index);
    if (open === -1) continue;
    const close = matchingClose(source, open, '{', '}');
    if (close === -1) continue;
    const own = topLevelText(source.slice(open, close + 1));
    const literal = /(?<![\w$])materialType\s*:\s*'([^']*)'/.exec(own)?.[1];
    const identifier = /(?<![\w$])materialType\s*:\s*([A-Za-z_$][\w$]*)/.exec(own)?.[1];
    const materialType =
      literal ?? (identifier === undefined ? undefined : constants.get(identifier));
    entries.push({
      key: /(?<![\w$])key\s*:\s*'([^']*)'/.exec(own)?.[1],
      materialType,
      reference: literal ?? identifier ?? '?',
      line: lineOf(source, match.index),
    });
  }
  return entries;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/** 读取保留样式键；读不到即失败关闭，避免 R6 静默失效。 */
function readReservedStyleKeys(root) {
  const source = readFileSync(resolve(root, RESERVED_STYLE_SOURCE), 'utf8');
  const start = source.indexOf(RESERVED_STYLE_EXPORT);
  const open = start === -1 ? -1 : source.indexOf('= {', start);
  if (open === -1) {
    throw new Error(`MATERIAL_ATOMICITY_RESERVED_KEYS_UNREADABLE: ${RESERVED_STYLE_SOURCE}`);
  }
  let depth = 0;
  let end = open + 2;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    else if (source[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const block = source.slice(open + 2, end + 1).replace(/\/\/[^\n]*/g, '');
  const keys = new Set();
  depth = 0;
  for (let index = 0; index < block.length; index += 1) {
    const char = block[index];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (depth === 1 && !/[\w$]/.test(block[index - 1] ?? '')) {
      const keyMatch = /^([A-Za-z_$][\w$]*)\s*:/.exec(block.slice(index));
      if (keyMatch !== null) keys.add(keyMatch[1]);
    }
  }
  if (keys.size === 0) {
    throw new Error(`MATERIAL_ATOMICITY_RESERVED_KEYS_UNREADABLE: ${RESERVED_STYLE_SOURCE}`);
  }
  return keys;
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

function filesUnder(root, glob) {
  const base = resolve(root, glob);
  try {
    return [...walk(base)];
  } catch {
    return [];
  }
}

/** R1–R3：原有的未声明读取与描述性文案 prop 禁令，语义逐字不变。 */
function checkDeclaredContract(root, failures) {
  for (const glob of MATERIAL_GLOBS) {
    for (const file of filesUnder(root, glob)) {
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
            const line = lineOf(source, index);
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
    for (const file of filesUnder(root, glob)) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('propsSchema')) continue;
      const rel = relative(root, file).replace(/\\/g, '/');
      for (const key of collectForbiddenPropKeys(source, HOST_FORBIDDEN_TEXT_PROPS)) {
        failures.push(`${rel} 把 ${key} 声明成了 prop（宿主物料同样要原子化）`);
      }
    }
  }
}

/** R4–R9：ADR-0099 范式规则。返回可被债务清单抵消的违规与警告。 */
function checkParadigm(root) {
  const reserved = readReservedStyleKeys(root);
  const violations = [];
  const warnings = [];
  const report = (rule, rel, line, key, message) => {
    violations.push({ rule, file: rel, key, text: `${rel}:${line} [${rule}] ${message}` });
  };
  const seen = new Set();
  checkFragments(root, report);

  for (const glob of PARADIGM_GLOBS) {
    for (const file of filesUnder(root, glob)) {
      const rel = relative(root, file).replace(/\\/g, '/');
      if (seen.has(rel)) continue;
      seen.add(rel);
      const source = readFileSync(file, 'utf8');

      if (source.includes('renderMaterial')) {
        const hostWrite = /\bthis\.style\.(opacity|transform)\s*=(?!=)/g;
        let match;
        while ((match = hostWrite.exec(source)) !== null) {
          const property = match[1];
          const line = lineOf(source, match.index);
          const message = `渲染路径写宿主元素 style.${property}；保留样式由 Renderer 统一渲染`;
          report('R6', rel, line, `host:${property}`, message);
        }
      }

      if (!source.includes('propsSchema')) continue;
      const entries = collectPanelEntries(source);
      const selectedFields = new Set(
        entries
          .filter((entry) => entry.target === 'props' && entry.control === 'field-selector')
          .map((entry) => entry.key),
      );
      const visible = new Set();
      for (const entry of entries) {
        const { target, key, label, line } = entry;
        if (target === 'style' && reserved.has(key)) {
          const message = `面板声明了保留样式 ${key}；保留样式只在公共区出现`;
          report('R6', rel, line, key, message);
          continue;
        }
        if (
          target === 'style' &&
          !STYLE_KEY_DICTIONARY.has(key) &&
          !REGISTERED_STYLE_KEYS.has(key)
        ) {
          const message = `style 键 ${key} 不在 §2.6 词典内也未登记；复用词典键，或评审后登记`;
          report('R4', rel, line, key, message);
        }
        if (label !== undefined && UNIT_IN_LABEL.test(label)) {
          const message = `label「${label}」含单位记号；改用字段 unit 或 unit-number 控件`;
          report('R5', rel, line, key, message);
        }
        if (target === 'props' && FIELD_MAPPING_PROP.test(key) && !selectedFields.has(key)) {
          const message = `prop ${key} 是手填字段映射；改为 dataBinding.roles 或 field-selector`;
          report('R7', rel, line, key, message);
        }
      }
      // R9 按作者实际看到的检查器计数：有描述符时只数描述符字段（单选检查器不再渲染扁平面板），
      // 并排除默认收起的字段与分区。
      const counted = entries.some((entry) => entry.origin === 'descriptor')
        ? entries.filter((entry) => entry.origin === 'descriptor')
        : entries;
      for (const entry of counted) {
        if (!entry.hidden) visible.add(`${entry.target}:${entry.key}`);
      }

      const stateTextKeys = new Set();
      for (const key of collectDeclaredKeys(source)) {
        if (STATE_TEXT_PROP.test(key)) stateTextKeys.add(key);
      }
      for (const entry of entries) {
        if (entry.target === 'props' && STATE_TEXT_PROP.test(entry.key)) {
          stateTextKeys.add(entry.key);
        }
      }
      for (const key of stateTextKeys) {
        const line = lineOf(source, source.indexOf(key));
        const message = `声明了状态文案 ${key}；空态/加载态文案由 plugin-sdk 状态视图提供`;
        report('R8', rel, line, key, message);
      }

      if (visible.size > VISIBLE_FIELD_BUDGET) {
        const budget = `${visible.size} 个（> ${VISIBLE_FIELD_BUDGET}）`;
        warnings.push(`${rel} [R9] 默认可见字段 ${budget}，是拆分信号（ADR-0099 §2.5）`);
      }
    }
  }
  return { violations, warnings };
}

/** R10：ADR-0100 分片规则。需要整个交付面的类型声明，因此先通读一遍再逐个分片检查。 */
function checkFragments(root, report) {
  const sources = new Map();
  for (const glob of PARADIGM_GLOBS) {
    for (const file of filesUnder(root, glob)) {
      const rel = relative(root, file).replace(/\\/g, '/');
      if (!sources.has(rel)) sources.set(rel, readFileSync(file, 'utf8'));
    }
  }
  const constants = new Map();
  for (const source of sources.values()) collectStringConstants(source, constants);
  const declaredBy = new Map();
  for (const [rel, source] of sources) {
    declaredBy.set(rel, collectDeclaredMaterialTypes(source, constants));
  }
  const declared = new Set([...declaredBy.values()].flatMap((types) => [...types]));
  const pluginOf = (rel) => /^plugins\/([^/]+)\//.exec(rel)?.[1];
  const pluginTypes = (plugin) =>
    new Set(
      [...declaredBy]
        .filter(([rel]) => pluginOf(rel) === plugin)
        .flatMap(([, types]) => [...types]),
    );

  for (const [rel, source] of sources) {
    if (!FRAGMENT_SOURCE_MARKER.test(source)) continue;
    const plugin = pluginOf(rel);
    const owned = plugin === undefined ? undefined : pluginTypes(plugin);
    for (const entry of collectFragmentEntries(source, constants)) {
      const { key, materialType, reference, line } = entry;
      const id = key ?? reference;
      if (materialType === undefined) {
        const message = `分片节点 ${id} 的 materialType ${reference} 无法静态解析；用字面量或 *_TYPE 常量`;
        report('R10', rel, line, `fragment:${id}`, message);
        continue;
      }
      if (!declared.has(materialType)) {
        const message = `分片节点 ${id} 引用的物料 ${materialType} 在交付面找不到声明`;
        report('R10', rel, line, `fragment:${id}`, message);
        continue;
      }
      if (
        owned !== undefined &&
        !materialType.startsWith(OFFICIAL_TYPE_PREFIX) &&
        !owned.has(materialType)
      ) {
        const message = `插件分片 ${id} 引用了其他插件的物料 ${materialType}；只能引用本插件或官方物料（F8）`;
        report('R10', rel, line, `fragment:${id}`, message);
        continue;
      }
      if (
        key !== undefined &&
        FRAGMENT_TEXT_NODE_KEY.test(key) &&
        materialType !== OFFICIAL_TEXT_TYPE
      ) {
        const message = `分片文案节点 ${key} 使用了 ${materialType}；标题与说明由 base.text 承担（F3）`;
        report('R10', rel, line, `fragment:${key}`, message);
      }
    }
  }
}

/**
 * 运行全部规则。`debt` 抵消 ADR-0099 §3 的存量违规；已偿还却仍在清单里的条目同样失败，
 * 保证清单只减不增。
 */
export function checkMaterialAtomicity({ root = DEFAULT_ROOT, debt = PARADIGM_DEBT } = {}) {
  const failures = [];
  checkDeclaredContract(root, failures);

  const { violations, warnings } = checkParadigm(root);
  const identity = (item) => `${item.rule}|${item.file}|${item.key}`;
  const owed = new Set(debt.map(identity));
  const found = new Set();
  for (const violation of violations) {
    const id = identity(violation);
    found.add(id);
    if (!owed.has(id)) failures.push(violation.text);
  }
  for (const item of debt) {
    if (!found.has(identity(item))) {
      const message = `${item.key} 已偿还，请从 PARADIGM_DEBT 删除该条目（清单只减不增）`;
      failures.push(`${item.file} [${item.rule}] ${message}`);
    }
  }
  return { failures: [...new Set(failures)], warnings: [...new Set(warnings)] };
}

function main() {
  const { failures, warnings } = checkMaterialAtomicity();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (failures.length > 0) {
    throw new Error(
      `MATERIAL_ATOMICITY_CHECK_FAILED:\n  ${failures.join('\n  ')}\n` +
        '依据：AGENTS.md「物料原子化」、ADR-0099 与 plugins/plugin-materials 的 title 断言。',
    );
  }
  console.log(`material atomicity check passed (${PARADIGM_DEBT.length} ADR-0099 debt items).`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main();
}
