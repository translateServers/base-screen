# Designer 外部样式 Token 实施计划

> 状态：已实现
> 日期：2026-08-06
> 适用范围：`@base-screen/engine` 的 Designer Shadow DOM chrome
> 前置依据：[Designer Workbench Control Styles](../../../specs/archive/designer-workbench-control-styles/spec.md)、[ADR-0017](../../../decisions/ADR-0017-designer-product-host-boundaries.md)、[ADR-0024](../../../decisions/ADR-0024-designer-public-style-tokens.md)（已接受）、[Designer Theme Tokens](../../../specs/archive/designer-theme-tokens/spec.md)（生效中）、[仓库指南](../../../../AGENTS.md)

## 1. 目标

为 `<base-screen-designer>` 建立一个稳定、可从宿主页面覆盖、且不把 Engine 私有实现泄漏为公共
CSS 结构的主题 Token 契约。

交付后，宿主可以通过 CSS 选择器或标准 `element.style.setProperty()` 修改 Designer 支持的颜色、字体、
间距、形状、阴影、动效和内部滚动条视觉；未提供覆盖时，现有 dark/light 视觉基线保持不变。

本计划实现的是“主题化视觉外观”，不是任意整体换肤。宿主可以控制 Designer 元素在页面中的宽高、位置
和外部布局；Designer 内部的 DOM、布局结构、断点、z-index、图标形状、交互状态和 Material 内容仍由
对应所有者控制。

本计划首版只增加 CSS Custom Properties 公共契约，不增加 `setThemeTokens()`、`themeTokens` 对象、
全局 stylesheet、CSS-in-JS runtime 或新的 workspace package。

## 2. 当前基线

- `packages/engine/src/browser/styles/designer-tokens.css` 是 Tokens 层唯一源码。
- `designer-style.ts` 按 Tokens、Base、Controls、Workbench 的固定顺序组装单个 Shadow DOM `<style>`。
- 现有 `--designer-*` 名称属于 Engine 私有实现；`theme="light"` 通过 `:host` CSS 选择器切换默认值。
- `base-screen-designer` 的稳定注册入口由 `@base-screen/sdk` 拥有，Engine 不负责注册标签。
- `check-designer-styles.mjs`、Engine 样式单测和 browser harness 已提供现成质量入口。
- 归档样式 Spec 曾将宿主 theme API 列为非目标，因此本计划必须先经过新的 ADR 和生效中的 Spec 授权。

### 2.1 样式所有权边界

| 所有者 | 可修改范围 | 不可修改范围 |
| --- | --- | --- |
| 宿主页面 | Designer 元素的外部尺寸、位置、页面布局；文档化公共 Token | Engine Shadow DOM 内部 selector、任意 CSS 注入 |
| Designer 公共 Token | 主题颜色、文字、边框、语义状态、受限几何、阴影、动效、Owned scrollbar 视觉 | DOM 结构、布局 track、断点、z-index、工具图标和交互语义 |
| Material | Material 自身 appearance contract、Material Shadow DOM | Designer chrome 的公共 Token |
| Viewer/Renderer | Viewer 内容和 document canvas appearance | Designer 工作台 chrome |

宿主页面滚动条、`body` 滚动条以及 Material 自己 Shadow DOM 内的滚动条不属于 Designer Scrollbar Token
范围。首版不开放 `::part`、公共 CSS class、stylesheet URL 或 Shadow DOM 样式注入。

## 3. 建议决策（待 ADR 冻结）

### 3.1 公共命名空间

采用 `--base-screen-designer-*` 作为公共前缀，不采用含义不明确且可能与其他库冲突的 `--bs-*`。

公共变量是宿主输入；组件内部继续只消费 `--designer-*` 私有变量。映射示例：

```css
:host {
  --designer-accent: var(--base-screen-designer-accent, #ff7a59);
}

:host([theme="light"]) {
  --designer-accent: var(--base-screen-designer-accent, #d95235);
}
```

公共变量不在 Shadow DOM 内写入默认声明，未设置时由私有变量的 fallback 提供默认值。这样公共变量
可以从 Designer 元素或任意祖先元素继承，主题选择器也不会覆盖宿主明确设置的值。

### 3.2 覆盖优先级

1. 元素 inline style 中的公共变量。
2. 宿主 author stylesheet 中匹配 Designer 或其祖先的公共变量。
3. `theme="light"` 提供的内建 light fallback。
4. 默认 dark fallback。

删除 inline 或 stylesheet 覆盖后，值必须恢复到当前主题的内建 fallback。未知公共变量不产生行为。

### 3.3 主题范围

首版只保留现有 `theme` 语义：缺失或未知值为 dark，`theme="light"` 为 light。首版不增加
`theme="system"`，避免把操作系统偏好和公共 Token 契约同时冻结；system 模式另开需求和测试矩阵。

### 3.4 值和安全边界

- 公共 Token 接受对应 CSS 属性的值，不接受 selector、declaration、class name 或 stylesheet 文本。
- 首版不依赖 `@property`。复杂 font、shadow、transition shorthand 的跨浏览器注册收益不足，且不应
  让宿主必须依赖 Houdini 能力。
- 文档明确每个 Token 的推荐 CSS grammar；无效 CSS 值属于调用方错误，不承诺运行时诊断或自动修复。
- 公共 Token 契约不定义 `url()`、远程 stylesheet、脚本或任意 HTML 作为合法主题值；公共值不进入
  canonical document、history、日志、fixture、project payload 或 host resource intent。
- 首版不提供库层批量注入 API。宿主可直接使用浏览器的 `style.setProperty()` 设置已文档化的公共名称；
  未来若增加 helper，必须使用固定 allowlist，且不得接受 `style.cssText` 或任意变量名。

## 4. 公共 Token 目录

以下目录是首版候选全集，必须在 ADR/Spec 评审时冻结。公共名称与私有名称一一对应，但私有名称不形成
兼容承诺。

| 家族 | 公共 Token | 约束 |
| --- | --- | --- |
| Surface | `surface-workspace`、`surface-panel`、`surface-raised`、`surface-control`、`surface-control-hover`、`surface-overlay`、`surface-canvas`、`surface-scrim`、`canvas-grid-line` | 颜色或带 alpha 的颜色 |
| Text | `text-primary`、`text-secondary`、`text-muted`、`text-disabled`、`text-inverse` | 颜色；内建主题必须满足文本对比度 |
| Border | `border-subtle`、`border-default`、`border-strong`、`focus-ring` | 颜色；focus 不得只依赖颜色 |
| Semantic | `accent`、`accent-surface`、`accent-on`、`success`、`success-surface`、`success-on`、`warning`、`warning-surface`、`warning-on`、`danger`、`danger-surface`、`danger-on` | 每个角色提供前景、低强调背景和背景上的前景配对 |
| Spacing | `space-1` 至 `space-7` | 非负 `<length>`；默认刻度保持 2/4/6/8/12/16/24px |
| Control | `control-height`、`control-height-compact`、`icon-size` | `<length>`；不得破坏最小可用点击区域 |
| Shape | `radius-control`、`radius-overlay` | `<length>`；control 不超过 6px，overlay 不超过 8px |
| Typography | `font`、`font-small`、`font-numeric` | 有效 CSS `font` shorthand；字号不随 viewport 缩放 |
| Elevation | `shadow-overlay`、`shadow-canvas`、`shadow-float` | 有效 `box-shadow`；不用于普通 section/panel |
| Motion | `motion`、`motion-emphasis` | 有效 transition shorthand；reduced-motion 时由内部规则关闭 |
| Scrollbar | `scrollbar-thumb`、`scrollbar-thumb-hover`、`scrollbar-track`、`scrollbar-corner` | 只控制 Designer 自有滚动区域的颜色；宽度保持内部固定 |

所有公共名称在 CSS 中写成完整形式，例如 `--base-screen-designer-surface-panel`。`z-index` 标尺、
面板宽度、顶部栏/状态栏高度、断点、网格 track、内部选择器和 DOM class 不进入公共目录。

### 4.1 Token 分级

- **主题级**：Surface、Text、Border、Focus、Semantic、Elevation、Motion 和 Scrollbar。必须支持 dark/light
  fallback 和宿主覆盖。
- **受限几何级**：Spacing、Control、Shape、Typography。首版无法以纯 CSS 覆盖保证 geometry，全部保持私有；
  未来必须定义推荐值、允许范围和各 viewport 证据后才能公开。
- **私有结构级**：Panel width、topbar/statusbar height、grid track、breakpoint、z-index、selector、DOM
  class、icon geometry 和 canvas coordinate。不得通过公共 Token 暴露。

公共 Token 的实现必须保持“公共输入 -> 私有消费”两层结构。公共目录冻结前，必须为每个名称记录消费者、
CSS grammar、dark/light fallback、可接受范围和 geometry 风险；`text-inverse` 与各 `*-on` 只有在实现和
contrast 审计完成后才能进入正式目录。

## 5. 代码边界和预计改动

### 必改文件

- `packages/engine/src/browser/styles/designer-tokens.css`：增加公共输入到私有 Token 的映射、缺失的
  semantic foreground Token、Scrollbar Token，以及 light/dark 成对 fallback。
- `packages/engine/src/browser/styles/designer-base.css`、`designer-workbench.css`：为 Designer 自有滚动容器
  接入 scrollbar 规则；不得让 scrollbar 规则扩散到 Material、Viewer 或宿主节点。
- `scripts/check-designer-styles.mjs`：增加公共 Token allowlist、映射完整性、主题成对覆盖、私有布局
  Token 不外泄，以及源码不引入任意 stylesheet/runtime 注入路径的静态门禁。
- `packages/engine/tests/browser/styles/designer-style.test.ts`：增加目录、映射、主题 fallback 和
  CSS 分层回归。
- `scripts/verify-browser-harness.mjs` 或其现有 Designer 断言模块：增加宿主覆盖、实例隔离、主题恢复、
  computed style 和几何稳定性断言。
- `examples/browser-harness/main.ts`：增加一个仅用于验收的宿主自定义主题 fixture，不作为公共 API 示例
  以外的运行时依赖。

### 必建文档

- `docs/decisions/ADR-0024-designer-public-style-tokens.md`：记录命名空间、所有权、覆盖优先级、兼容策略、
  安全边界和拒绝的 JS/runtime 方案。
- `docs/specs/designer-theme-tokens/spec.md`：Requirements、场景、非目标和完成定义。
- `docs/specs/designer-theme-tokens/tasks.md`：按实现和证据拆分任务。
- `docs/specs/designer-theme-tokens/checklist.md`：逐项验收清单。
- `docs/specs/designer-theme-tokens/test-matrix.md`：Requirement 到 unit/DOM/browser/package case 的双向映射。
- `docs/plans/designer-theme-tokens/implementation-plan.md`：本实施计划。
- ADR/Spec 被接受或激活后，分别更新 `docs/decisions/README.md` 和 `docs/specs/README.md`；历史归档 Spec
  不改写，只由新 ADR 标明其非目标已被后继决策取代。

### 明确不改文件

首版不改 `contracts`、canonical document schema、`core`、`renderer`、`material`、plugin 包、SDK
exports、package manifest、lockfile 或 Custom Element 注册逻辑。CSS-only 公共契约不产生新的 TypeScript
声明或 API report 项。

## 6. 实施阶段

### 阶段 0：公共契约评审

1. 从四层 CSS 提取实际 Token 使用矩阵，确认每个候选 Token 的消费者、默认值和 light 值。
2. 计算内建 dark/light 的文本、图标、边界和 focus contrast；确定 `text-inverse` 与各 `*-on` 的最终值。
3. 为 Spacing、Control、Shape、Typography 定义范围和 geometry 失败处理；确认哪些 Token 需要保持私有。
4. 确认 Scrollbar 的 owned container 清单、Firefox `scrollbar-color`、Chromium/Safari pseudo-element
   fallback 和 forced-colors 行为。
5. 完成 ADR-0024 草案，明确 CSS-only 首版、不支持 JS theme object、无效值责任和不持久化边界。
6. 完成 Spec 三件套和测试矩阵，并在索引中标为“评审中”而非直接授权实施。
7. 评审通过后将 ADR 置为“已接受”、Spec 置为“生效中”；未通过前不得改运行时代码。

阶段门：公共前缀、Token 分级、主题语义、Scrollbar 边界、geometry 范围、无效值策略和 JS API 是否延期
必须全部有明确结论。

### 阶段 1：Token 映射实现

1. 在 `designer-tokens.css` 保留现有 `--designer-*` 消费点，逐项把默认字面量改成公共变量 fallback。
2. 对按钮前景、状态徽标和危险操作补齐 `accent-on`、`success-on`、`warning-on`、`danger-on` 私有映射，
   只有通过 contrast 验收后才纳入公共目录。
3. 保持 Tokens、Base、Controls、Workbench 装配顺序和单 `<style>` 结构不变。
4. 为 Designer 自有滚动容器接入 `scrollbar-color` 和 WebKit scrollbar fallback；Scrollbar Token 不控制
   scrollbar width/height，避免跨浏览器差异改变布局。
5. 不把公共变量名拼接进 class、data attribute、document 数据或 DOM helper 参数。
6. 让 reduced-motion、forced-colors 继续由内部媒体规则掌控，外部 motion Token 不能绕过可访问性策略。

阶段门：无覆盖时所有现有样式测试和默认截图保持等价；公共变量只影响 Designer chrome。

### 阶段 2：静态和单元验证

1. 让 `check-designer-styles.mjs` 解析并校验公共 Token allowlist，而不是只检查字符串存在。
2. 验证每个公开 Token 都有 dark fallback；颜色角色在 light 下有对应 fallback；没有意外公开 z-index 或布局变量。
3. 验证 Controls/Workbench 不新增可由 Token 表达的颜色字面量，也没有第二套 theme branch。
4. 验证 Scrollbar Token 只出现在 Designer owned scroll container 规则中，且没有裸 `body`/宿主 scrollbar
   选择器。
5. 增加覆盖、删除覆盖、主题切换、未知变量和单 style node 的测试；测试名称标注对应 Requirement。

阶段门：Engine focused lint、typecheck、test、build 全通过，且静态检查能阻止未来遗漏映射。

### 阶段 3：真实浏览器和隔离验证

1. 在 browser harness 中分别通过祖先 CSS、Designer 元素 CSS 和 `style.setProperty()` 注入同一组主题。
2. 验证 inline > stylesheet > theme fallback 的优先级，以及删除 inline 后恢复宿主 stylesheet/内建值。
3. 创建两个 Designer，使用不同公共 Token，验证 style、theme、focus、dialog、overlay 和状态完全隔离。
4. 使用 Material button/input/style canary、Viewer 和宿主控件验证 computed style 不受污染。
5. 覆盖 dark、light、自定义品牌主题和 reduced-motion/forced-colors；检查 contrast、overflow、layout shift、
   固定控件几何和 screenshot 非空。
6. 在可用的 Chromium/Safari WebKit 环境检查 scrollbar pseudo-element，在 Firefox 环境检查 `scrollbar-color`；
   验收语义状态和可读性等价，不要求原生 scrollbar 像素完全一致；forced-colors 下确认恢复系统 scrollbar。
7. 覆盖连接、断开、重连和 catalog 延迟初始化，确认不重复注入 style 或遗留跨实例状态。

阶段门：1024x640、1440x900、1920x1080 和窄屏路径均通过；自定义主题不能遮挡文本、焦点或相邻控件。

### 阶段 4：公共文档和发布验收

1. 在 Spec 中固化 Token 表、值语法、覆盖示例、主题说明、无效值责任和不保证事项。
2. 在 browser harness 或对应文档中保留最小宿主覆盖示例，示例只使用公共名称。
3. 检查 dist、声明文件、API report、tarball consumer，证明不存在额外 CSS import、公共 class export 或
   第三方类型泄漏。
4. 更新 test matrix、checklist 和 tasks；每项只在有自动化或当前 screenshot 证据后勾选。

阶段门：完成全量质量门后，才能把 Spec 标记完成。

### 阶段 5：独立评估运行时主题对象（延期项）

仅当宿主明确需要 JSON/TypeScript 配置而不是 CSS 覆盖时启动：

1. 新建独立 ADR，比较标准 `style.setProperty()`、allowlist setter 和不可变 theme object 的 API 成本。
2. 定义 `BaseScreenDesignerTheme` 的类型、清除语义、错误返回、优先级和生命周期；禁止任意 `cssText`。
3. 使用 `CSS.supports()` 或固定 grammar 校验可验证值，明确无法验证的 shorthand 行为。
4. 更新 `engine`/`sdk` public declaration、API report、consumer、双实例和动态更新测试。

该阶段不得阻塞 CSS-only 契约交付，也不得在首版偷偷导出半稳定的 Token 常量或 setter。

## 7. 测试矩阵

| Requirement | 关键 case | 证据 |
| --- | --- | --- |
| R1 公共契约 | allowlist、前缀、映射完整、私有布局未公开 | `check-designer-styles.mjs`、样式单测 |
| R2 默认主题 | dark 默认、light 覆盖、无覆盖视觉基线不变 | unit、computed style、截图 |
| R3 外部覆盖 | ancestor/host/inline、删除恢复、未知变量无效 | Chromium browser harness |
| R4 主题隔离 | 两个 Designer 使用不同 Token，动态修改互不影响 | 双实例 browser case |
| R5 Shadow 隔离 | Material、Viewer、body、宿主控件 computed style 不变 | canary browser case |
| R6 可访问性 | contrast、focus、invalid、disabled、forced-colors、reduced-motion、system scrollbar fallback | browser assertions + screenshot |
| R7 生命周期 | disconnect/reconnect、延迟初始化、style node 唯一 | DOM/browser tests |
| R8 产物边界 | 无新 package/export/CSS 文件依赖，tarball 可消费 | build、API、boundary、tarball |

新增或改名的 case 必须同步 `test-matrix.md`，并在测试名称或相邻注释中标注 Requirement。

## 8. 质量门

聚焦检查顺序：

```text
pnpm --filter @base-screen/engine lint
pnpm --filter @base-screen/engine typecheck
pnpm --filter @base-screen/engine test
pnpm --filter @base-screen/engine build
pnpm verify:browser
pnpm check:api
pnpm verify:tarball
```

交付前执行完整门禁：

```text
pnpm verify:m0
```

发送完成结论前必须执行：

```text
rg -n "^- \[ \]" docs/specs/designer-theme-tokens/{tasks,checklist}.md
```

命令存在任何适用未勾选项时，不得宣称 Spec 完成。

## 9. 风险、回滚和停止条件

- CSS cascade 在目标浏览器不一致：保留公共输入/私有消费的两层映射，以 browser case 作为合入门槛；失败时暂缓祖先继承，只保留元素级覆盖。
- 外部值导致 contrast 或几何破坏：内建主题必须始终合格；公共目录首版不包含布局 track、z-index 和 panel width；发现破坏时收缩 Token 集，不增加运行时修复逻辑。
- Scrollbar pseudo-element 与标准 `scrollbar-color` 能力不一致：颜色视觉作为增强能力，forced-colors 和不支持
  pseudo-element 的浏览器必须保持可用系统 scrollbar；不为统一厚度引入运行时 polyfill。
- 无效或不受支持的 CSS grammar：文档只承诺标准 CSS 值；`@property` 仅在单独浏览器评估通过后考虑。
- 宿主误把主题值写入持久化文档：公共 Token 不进入任何 contracts/Core 接口，browser 和 serialization case 证明其为元素瞬态样式。
- 需求转为数据驱动 JS 主题对象：停止当前扩展，先完成阶段 5 的新 ADR，不在 CSS 计划中混入公共 TypeScript API。

首版回滚只需删除公共 fallback 映射、对应静态/浏览器测试和文档索引；现有 `--designer-*` 默认值、canonical
document、history、package graph 和 SDK 注册行为不需要迁移。

## 10. 完成定义

- ADR-0024 已接受，Designer Theme Tokens Spec 已生效并完成三件套及测试矩阵。
- 公共 Token 目录、值语法、覆盖优先级和不变边界均有文档和静态门禁。
- 无覆盖时 dark/light 的既有行为和几何无回归；有效外部覆盖在 Shadow DOM 内可见。
- Designer 自有滚动区域在 dark/light 和自定义主题下具有可读的 thumb/track/corner 视觉；宿主和 Material
  scrollbar 未被修改。
- 多实例、Material、Viewer、宿主隔离、生命周期、可访问性和截图证据全部通过。
- Engine focused gates、browser、API、boundary、tarball 和 `pnpm verify:m0` 全部通过。
- `tasks.md`、`checklist.md` 不存在适用未勾选项，且 test matrix 与当前 case 一致。
