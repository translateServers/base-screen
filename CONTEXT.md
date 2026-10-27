# Base Screen 领域词汇

本文件是 Base Screen 的领域词汇表：记录跨包协作时**必须统一理解**的概念，以及它们的唯一实现落点。
权威行为依据是各包公共导出与 [AGENTS.md](./AGENTS.md) 中的分层、边界与宿主职责规则。

术语按主题分组，不按引入时间排序。新增术语时，一并写明它的唯一落点与「不得重复实现」的约束。

## 契约与诊断

- **诊断规范序（Canonical Diagnostic Order）**  
  由 `@base-screen/contracts` 独占定义的全序：先比较路径（逐段比较，**数字段先于字符串段**），同路径再比 `code`，
  最后比 `message`。唯一实现是 `compareScreenDiagnostics` / `sortScreenDiagnostics`。任何包不得自定义排序；
  发现分歧一律以规范序为准。

- **诊断上限哨兵（Diagnostic Limit Sentinel）**  
  诊断达到 100 条时以 `DIAGNOSTIC_LIMIT_REACHED` 替换末位。Contracts 的收集器是**相位感知**的（哨兵路径取自阶段，
  文档阶段为 `['document']`），Plugin 侧的收集器哨兵路径为 `[]` —— 两者语义不同，**各自保留**，不合并。
  该 code 与文案属公共可观察行为，不得因重构改变。

- **文档合成（Document Synthesis）**  
  为校验一个局部输入（如单个 `dataSource`）而拼装整份 `ScreenDocument` 再交给文档解析器的反模式。
  局部输入应由 `contracts` 提供独立解析入口，不得让文档形状泄漏进调用方。

- **身份词法谓词（Identity Predicate）**  
  组件 id 与变量名的词法判定只有两个谓词：`isScreenComponentId`、`isScreenVariableName`（`contracts`）。
  不要在新位置重新声明正则字面量，也不要用 `new RegExp(PATTERN)` 重新包裹导出的模式字符串。

- **结构化 JSON 相等（Structural JSON Equality）**  
  「两个 JSON 值是否相等」的唯一实现是 `contracts` 的 `screenJsonEquals`：键序无关、数组逐元素、
  `Object.is` 处理原始值。命令前后快照、条件表达式两侧、物料清单镜像等比较一律用它。

- **自有数据属性相等（Own Data-Property Equality）**  
  与上一条**不同的问题**：「作者写的运行时对象是否逐属性等于其规范化结果」。它只读自有**数据**
  属性（getter 视为不存在）并纳入不可枚举键，因此 getter 或不可枚举成员不能冒充匹配。
  唯一实现是 plugin-manager 预检中的同名私有函数，**有意不复用** `screenJsonEquals`。

- **层级查询接缝（Hierarchy Query Seam）**  
  组件层级遍历的唯一入口是 `@base-screen/core` 的 `ComponentIndex` 与配套查询
  （`getRootIds` / `getAncestorIds` / `getAncestorDepth` / `getDescendantIds` / `getDescendantSet`）。
  索引按文档引用缓存且查询自带环保护；消费方不得再自建 `byParent`/`byId` 映射。
  注意 **`getDescendantIds` 是深度优先**：既有消费方若依赖广度优先顺序，转换前必须确认该顺序
  不是可观察行为的一部分。

- **数据源校验入口（Data Source Parse Entry）**  
  校验单个组件 `dataSource` 一律走 `contracts` 的 `parseScreenDataSource`，不要为校验一个字段
  而手工拼装整份 `ScreenDocument` 信封。该入口内部仍走文档校验路径，因此判定与「写进文档再解析」
  一致，诊断路径相对数据源本身。

## 插件贡献词汇

- **贡献类型描述符（Contribution Kind Descriptor）**  
  贡献词汇（ADR-0084）在 `@base-screen/plugin-core` 内的唯一实现落点。逐 kind 声明：字段白名单、身份串形态、
  id 词法、专属校验、运行时 handler 字段。**描述符表本身是包内实现细节**，对外只暴露窄行为接口：
  `BaseScreenPluginContributionKind`、`BaseScreenPluginContributionHandlerField`、
  `contributionHandlerField`、`declaredContributionIds`、`listContributionHandlerKinds`、
  `contributionIdentity`、`readContributionHandlerRecord`。  
  新增一种贡献类型时，改动应局限在描述符表与 plugin-manager 的穷尽表；不得再新增 per-kind 的 switch。

- **贡献类型计划表（Contribution Kind Plan）**  
  `@base-screen/plugin-manager` 对「该 kind 往哪去」的穷尽式解释表：是否进入运行时贡献索引、进入哪个桶、
  进索引前是否必须先过授权门。键是 plugin-core 导出的 kind 联合类型，因此**漏一个 kind 是编译错误**，
  而不是运行期静默漏投影。

- **授权交集（声明 ∩ 批准 ∩ 支持）**  
  一项贡献只有同时出现在插件声明（清单 `contributions`）、宿主批准（`grantedCapabilities`）与宿主支持
  （能力表）三者交集中，才进入运行时索引；不在交集中的贡献对作者面与执行面都不可见。
  这是既有 command 规则的推广，**不是新增信任通道**。

- **贡献身份（Contribution Identity）**  
  贡献的全局唯一字符串：物料为 `material:<type>`，其余为 `<kind>:<id>`。清单内查重与跨插件冲突判定
  共用同一身份定义（`contributionIdentity`），不得各自推导。

- **handler 对应关系（Declared ↔ Handler Correspondence）**  
  「声明的贡献」与「运行时 handler 记录」必须一一对应：缺 handler、多 handler 都失败关闭。
  该规则只有一份实现（`readContributionHandlerRecord`）；调用方只决定报告粒度（manager 预检收集全部，
  作者面取首条），诊断的 code、路径与文案由调用方给出前缀后保持一致。

## Designer 组合根

- **控制器生命周期登记（Controller Lifecycle Registry）**  
  `<base-screen-designer>` 各控制器的连接顺序与释放责任的唯一声明处。登记表之外不得有手写 teardown；
  遗漏释放必须是类型错误而非静默。相关约束见 `tooling/checks/engine-import.mjs` 对 `designer-element/` 结构的登记。

## 数据面板

- **数据面板（Data Panel）**  
  右侧检查器的「数据源」页只由 `DesignerDatasetController` 一条路径渲染。宿主是否提供 `datasetPort`
  只决定 `dataset` 这个选项可不可用，不决定用哪套面板；`none` / `static` / `variable` / `dataset` /
  `host-resource` 是同一面板的五个 mode。旧的按端口二选一的四字段面板已移除。
- **面板段（Data Section）**  
  面板内容按 `data-ds-section` 切成可独立重建的段：`mode` / `host-link` / `catalog` / `config` /
  `preview` / `authoring`。段的构造只有 `designer-dataset-sections.ts` 一处；内联面板与全屏工作台
  消费同一批段，只决定摆在哪一列。状态变化用 `patchDatasetSections` 只换受影响的段，
  整块 `replaceChildren` 只留给结构真的变了的情形（切 mode、选数据集、开关工作台、提交）。
- **宿主通道状态（Host Link Channel）**  
  目录、查询、变量解析三条通道各自报告 `unavailable` / `ready` / `loading` / `error`，
  `error` 带诊断码并可重试。三条通道不允许共用一个布尔。

## 物料

- **物料状态容器（Material Loading Container）**  
  官方物料共享的加载/空态容器（`@base-screen/material` 的 `createBaseScreenMaterialLoadingContainer`）。
  物料只提供「读数本身的构成」（单位、前后缀、表头列名），不提供描述性文案；状态展示与无障碍由容器统一负责。

- **统一资源选择桥（Host Resource Selection Bridge，已实现）**
  组件检查器或画布背景请求宿主打开图片选择器的唯一传输通道：事件
  `base-screen-host-resource-selection-request`，请求 `requestHostResourceSelection`，提交
  `commitHostResourceSelection`。它只传 request/commit，不持有素材目录、搜索、缓存或网络客户端；
  组件图片只存 `host-resource` 身份，画布背景 URL 是唯一例外。组件提交只写 legacy `dataSource`，
  只接受没有 `dataValue` 键的组件。入口只有同时声明 `hostResourceSelection: true` 与
  `host-resource` 能力的物料才显示。唯一落点是 `engine`（ADR-0089）；示例后端与三端宿主已提供
  上传、列表、插入/替换/背景、选择器与删除保护。

- **Catalog 热刷新（Catalog Refresh，已实现）**
  Designer 初始化后更新物料目录的唯一入口 `refreshCatalog()`；差异按 type 与 Manifest/constructor/tagName
  比较，全有或全无。constructor/tagName/adapter 变化由 renderer 重挂载；Manifest-only 变化保留元素、只重算
  model 与面板；未变类型保留 applied key。被引用移除拒绝，下架先 `libraryVisible: false` 软退。物料 type
  跨构建稳定，tagName 是构建产物（ADR-0090）。示例后端持久化 `MaterialPackage`，三端宿主提供
  「在线物料」面板，发布代码/仅更新清单/上下架后对运行中的设计器热刷新。

## 设计系统

工作台的设计语言按四层组织：令牌 → 状态 → 原语 → 面板。下面的术语各有唯一落点，面板文件只消费，不复制。

- **设计令牌（Design Token）**  
  颜色、字号、间距、圆角、动效的唯一声明处是 `packages/engine/src/browser/styles/designer-tokens.css`，
  浅色与深色是同一个文件里的两个块。面板样式只写 `var(--designer-*)`：色值必须走令牌
  （`tooling/checks/designer-styles.mjs` 对 raw color 做棘轮），主题分支不得出现在面板文件里。
  字号 6 档、间距 7 档（2/4/6/8/12/16/24）、圆角 5 档 —— 缺档时先在令牌里补，不在调用处写字面量。

- **表面阶梯（Surface Ladder）**  
  从 `surface-workspace` 到 `surface-scrim` 的 8 级表面 + 4 级文本 + 3 档边框。层级靠表面亮度差与
  alpha 收边表达，不靠阴影浓度；阴影只用于真正浮起的层（overlay / canvas / float）。

- **列表选中（List Selection）**  
  唯一落点 `designer-workbench-selection.css`：图层树与蓝图库命中同一条规则，面板只负责挂
  `aria-selected="true"` / `data-selected="true"`，**不得自写选中底色**。画法是「比悬停更实的中性灰块
  + 1px 中性收边」，不使用强调色；相邻多选连成一块时的圆角与收边由 `[data-layer-selected-run]`
  的三态（first / middle / last）负责，内部两侧不画线。

- **交互四态（Interaction States）**  
  划过 = `surface-control-hover`，按下 = `surface-control-active`，选中 = 上一条，禁用 = `text-disabled`
  且保留原几何。禁用不叠透明度（叠一层会把图标压成幽灵），也不改尺寸；选中与划过的色阶必须拉开
  两步以上，否则密集列表里分不清「选中」和「鼠标停在这」。

- **强调色语义（Accent Meaning）**  
  强调色只表示三件事：主操作（primary 按钮）、焦点/选框（focus ring、画布选框）、当前定位（定位跳转）。
  它**不表示「被选中」** —— 列表里选中是定位坐标，与「可以执行」是两种语义，混用会让密集列表变成彩色。

- **焦点环（Focus Ring）**  
  键盘焦点统一用 `--designer-focus-ring`，并投影到与指针命中范围一致的整行或整个控件
  （`outline-offset: -2px`），避免内外两个命中范围。控件不得自造 focus 样式。

- **画布命中容差（Canvas Hit Slop）**  
  canonical 尺寸就是"容器与内容一样大"的薄组件（分割线默认 2px 高、1px 描边的容器）在画布上留一圈
  可点厚度：`hitTestScreenComponents` 的 `minimumThickness` 只把薄轴的命中带以组件中心为轴撑到给定厚度，
  判断仍在组件局部坐标系里做，所以旋转后命中带与组件同向。唯一消费点是手势控制器
  （`THIN_COMPONENT_HIT_MIN_THICKNESS_PX = 10`，按屏幕像素除以 `zoom` 换算回画布单位），且只在
  原生命中落空时才启用。它只是编辑器的命中语义：文档几何、选中框、吸附与导出都不受影响。

- **控件原语（Control Primitives）**  
  单个控件（按钮/输入/勾选/开关/下拉/文本域/图标按钮）的唯一落点是
  `packages/engine/src/browser/dom/designer-ui-primitives.ts`；字段行骨架（标签列 + 控件列、堆叠变体）
  的唯一落点是 `designer-field-primitives.ts`。模板字符串里的控件由 `adoptDesignerFormControls`
  在渲染后原地归一（含 checkbox / switch / button，保留已绑监听）；新面板不得手写
  `designer-control` / `designer-button` / `designer-checkbox` / `designer-switch` / `designer-segmented` /
  `designer-tab` 等共享类，`tooling/checks/designer-ui.mjs` 会拒绝未登记的裸控件与手拼字段行。
  控件尺寸只有 default 30px / compact 28px 两档（`data-size`）；workbench 只做布局，不得重设
  共享控件的背景/文字/描边/字体/高度/内距，`tooling/checks/designer-styles.mjs` 以外观覆写基线
  锁住存量并只减不增。色板三态模式组是唯一保留的原生 radio 值载体例外（可见形态完全由色板自绘）。
  设计系统清单的聚焦断言 `pnpm verify:system` 覆盖尺寸、禁用态几何与自绘下拉弹层对齐。

- **面板件（Panel Chrome）**  
  分区（`.designer-panel-section`）、空态（`.designer-empty`）、徽标（`.designer-badge`）、列表行
  （`.designer-list-row`）的结构原语在 `dom/panel/designer-chrome-primitives.ts`，外观唯一落点是
  `styles/workbench/designer-workbench-chrome.css`；workbench 其余文件只做布局（display / grid /
  margin / gap / width / 定位），不得重设面板件的背景、文字、描边、字体、高度、内距。
  列表行只有 default 40 / comfortable 44 / compact 32 三档（`data-density`）；选中底色只在
  `designer-workbench-selection.css` 一处绘制（图层行、蓝图库行与 `.designer-list-row` 共用同一条规则）。
  面板内导航用 `.designer-tablist` / `.designer-tab`（变体在 `controls/designer-controls-tabs.css`），
  按下型选项组统一走 `.designer-segmented`。新增面板从这里取结构，不得再手拼 header / 徽标 / 空态骨架。

- **设计系统清单（Design System Inventory）**  
  唯一落点是 `tooling/verification/browser-harness/system.html`：令牌、状态矩阵与组件铺在一页，
  浅深主题可切换，挂在真实 `<base-screen-designer>` 的 shadow root 里跑产品同一份样式表。
  样式评审以这一页为准；不引入 Storybook，也不在产品包里携带示例样式。

- **Geist 对齐（Geist Alignment）**  
  令牌体系对齐 Vercel 的 Geist 规范，三条硬规则不可破：① 交互面用**阴影当边框**
  （`--designer-elev-ring` = `0 0 0 1px rgb(0 0 0 / 8%)`），只有真正的分隔线才用 `border`；
  ② 字重只有 400 / 500 / 600 三档，正文不上 700；③ 字距随字号收紧（`--designer-tracking-*`），
  正文一律 normal，任何地方都不用正字距。卡片高度用三层栈 `--designer-elev-card`
  （描边 + 2px 微抬 + 8px 远距 + 内侧高光），不用单层重阴影。
  三处有意偏离，理由写在清单页的对照表里：字号阶梯压到 11–18px（密度优先）、间距保留 24 一档
  （规范在 16 之后直接跳 32，密集面板需要中间档）、圆角阶梯缺 4px 且第 2/3 档重复
  （改动面 50 处，单独一批收敛）。
