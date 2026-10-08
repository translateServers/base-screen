# 物料体系

> 返回[当前能力基线](./README.md)。


- **共享加载展示与容器**：加载视图与加载容器由 `@base-screen/plugin-sdk` 拥有，`@base-screen/material`
  与 `@base-screen/sdk/material` 按原名 re-export，提供无注册副作用的
  `createBaseScreenMaterialLoadingContainer`，观察公共数据态或物料派生的展示状态，统一显隐、inert、
  无障碍与清理，保留内容节点。CSS 变量和公开 part 支持宿主定制并尊重减少动态效果；独立展示工厂
  `createBaseScreenMaterialLoadingElement` 继续可用。查询与业务状态解释仍归宿主/物料，不强制 Renderer
  接管所有物料。用法见[公共加载容器](../material-loading.md)。
- **非 ready 态统一呈现**（2026-10-03 收敛）：`idle`/`loading`/`error` 与空数据集的 chrome 与兜底文案
  只有 `@base-screen/plugin-sdk` 状态视图一份；`idle` 占位不给文案，`error` 呈现已脱敏的 `message`
  并把 `code` 写入 `data-*` 属性，数据形状不合本物料契约时由物料给出 canonical code 与领域文案。
  依据：[ADR-0086](../decisions/ADR-0086-material-state-and-surface-ownership.md)。
- **物料契约与 ABI**：manifest 类型、校验、只读 catalog 与同 realm Web Component ABI。
  依据：[Plugin Core Contract](../specs/archive/plugin-core-contract/spec.md)、[ADR-0003](../decisions/ADR-0003-web-component-material-abi-and-registration.md)。
- **官方物料范围**（2026-09-11 调整）：核心库官方物料的权威清单是 `packages/material/src/auto-register.ts`
  与该包 `package.json` 的 `exports`，本文档不复述条目与数量；新增物料只经该清单与
  `scripts/browser-harness` 的目录断言登记。原 `base.echarts` 手绘近似物料已整体移出 `packages/material`
  （公共导出、`./echarts` 子路径、构建入口与自动注册一并移除），其受限 Editor Descriptor 载体以非发布
  演示物料 `harness.semantic-chart` 保留在 `harness/browser-harness`，真实图表能力归外围插件承载，
  核心库不再发布自称 ECharts 的物料。
  依据：[ADR-0074](../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)。
- **物料原子化门禁**（2026-10-03 可执行化）：`scripts/check-material-atomicity.mjs`（随 `pnpm lint`
  运行）禁止物料渲染路径读取 manifest 未声明的 `props`/`style` 键，并禁止描述性文案 prop 出现在
  官方物料、外围插件物料与宿主示例上；图表类物料的 `title`/`legend`/`axis` 按脚本内的
  `CHART_FURNITURE_EXEMPTIONS` 显式豁免。约定本体见 `AGENTS.md`「物料原子化」。
- **静态数据作者契约**（2026-08-23 增量）：Manifest 可选 `staticData` scalar/tabular 描述；canonical 静态
  数据源可携带字段角色 binding，tabular 静态数据与宿主数据集复用物料 adapter。Designer 提供标量表单、
  有界表格网格、列/行/类型/角色编辑、Excel/TSV 粘贴推断与高级 JSON；应用一条事务，取消零副作用，未声明
  `staticData` 的自定义物料继续使用原始 JSON 路径。依据：[ADR-0081](../decisions/ADR-0081-event-and-blueprint-authoring-ownership.md)。
- **官方数据物料契约**：图表与表格的最小数据语义契约；官方文本额外声明单字段 `value` 角色，
  可把宿主数据集首行的字符串、数值、布尔或日期字段投影为文本，同时保留既有标量静态数据；
  Designer 对该物料只暴露宿主数据集作者模式，不额外显示通用宿主资源选项。依据：[Official Data Material Contracts](../specs/archive/data-material-contracts/spec.md)、
  [ADR-0022](../decisions/ADR-0022-official-data-material-contracts.md)。
- **物料库可见性**：Manifest 可选 `libraryVisible` 与 Designer 物料库过滤，容器移出物料库。
  依据：[Material Library Visibility](../specs/archive/material-library-visibility/spec.md)、[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **宿主托管物料包**：宿主负责加载与信任，plugin-sdk `createMaterialPackage` 注册辅助；远程代码加载不进 Base Screen。
  依据：[Host Material Package](../specs/archive/host-material-package/spec.md)、[ADR-0029](../decisions/ADR-0029-host-managed-material-package-distribution.md)。
- **草稿物料流程**：设计期显式草稿交接、目录叠加与正式发布预检。依据：[Host Draft Material Workflow](../specs/archive/host-draft-material-workflow/spec.md)。
- **在线物料 MCP**：规范快照 + 在线物料查询/校验 MCP 契约与 stdio 参考服务。依据：[Host Material MCP Access](../specs/archive/host-material-mcp-access/spec.md)、
  [ADR-0030](../decisions/ADR-0030-host-material-mcp-access.md)。
- **物料库宿主状态**（封版后增量，已纳入基线）：严格状态 schema（ready/loading/offline/partial/update）、分类排序与搜索、
  草稿/不可用标记、composed 宿主动作事件（retry/reload/details）；保持不可变 catalog 与宿主加载边界。
  依据：[Material Library Host State](../specs/archive/material-library-host-state/spec.md)、[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **宿主多级物料分组**（封版后增量，已纳入基线）：宿主以 JSON-safe 树投影控制组层级、名称和卡片顺序；Designer 提供全部入口、
  常驻一级分类、子分类原位钻取和网格筛选；父组聚合自身及后代物料，末级保留同级入口，支持本类聚合和返回上级。
  分组计数按 canonical 物料类型计算；宿主更新保留有效选择，删除当前组回到全部。保持 Manifest、catalog、ScreenDocument 和 Renderer 不变。
  依据：[Host Material Library Grouping](../specs/archive/host-material-library-grouping/spec.md)、[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **物料库条目投影**（封版后增量，已纳入基线）：Designer 可接收严格、JSON-safe 的 `materialLibraryItems`；多个条目
  可复用同一个 canonical `materialType`，并覆盖卡片名称、分类、封面与新实例默认值。运行构造器、文档 type 和 ABI
  仍由不可变 catalog 决定；未配置时保持一类型一卡片。依据：[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **物料库视觉层级**（封版后增量，已纳入基线）：搜索和筛选固定在顶部，分类采用 44px 图标栏 + 76px 子分类栏，条目行高 32px，
  一级分类复用 SVG 图标，`title` 和可访问性描述提供完整名称、路径及类型数量；子分类为单行列表，数量徽标仅在浮层显示。
  两列独立纵向滚动并预留轨道；物料内容区小于 264px 时用当前分类按钮打开有界浮层，卡片保留全宽，左面板仍为 200–480px。
  子分类直接从「全部」开始，深层分支才出现整行返回入口；左右键钻取/返回，上下/Home/End 移动焦点，Enter/Space 选择。
  切换分类结果回顶，无结果支持清除筛选并返回搜索框；完整路径提示、Escape/外部点击关闭和焦点返回均为实例内交互；浮层复用导航 DOM，
  不挤压网格，关闭面板或切换模式时清理。仅消费现有 Designer Token，保留深浅主题、forced-colors、reduced-motion 与无抖动约束。
  依据：[Designer Material Library Visual Refinement](../specs/archive/designer-material-library-visual-refinement/spec.md)、[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **物料加载错误控制台**（封版后增量，已纳入基线）：失败记录、当前目录状态和恢复动作通过固定宽度的底部状态栏入口在工作区弹窗中显示；
  当前状态与最新优先的有界历史明确分区，支持稳定清空、Tab 焦点闭环、Escape/遮罩关闭和焦点返回。左侧物料库专用于搜索、分组和网格，
  保留状态 data-*、宿主动作、草稿/不可用标记、可访问性和无抖动。
  依据：[Material Library Error Console](../specs/archive/material-library-feedback-workspace-placement/spec.md)、[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **物料宿主封面**（封版后增量，已纳入基线）：Manifest 可选 `cover` URL 字段（失败关闭校验，http(s)/根相对/
  点相对/协议相对），物料库卡片在固定缩略图区内渲染真实封面，确定性分类图标/色相保持占位与失败回退，
  纯展示投影不进 ScreenDocument/Renderer/Viewer。封面加载后按自然尺寸自适应适配：小图（放大 >1.5×）与
  异形图（宽高比偏差 >0.35）自动 `contain` 完整显示、照片类保持 `cover`，占位彩色渐变/网格底色收为中性
  表面、透明素材不透底。依据：[Material Cover Thumbnail](../specs/archive/material-cover-thumbnail/spec.md)、
  [Material Cover Adaptive Fit](../specs/archive/material-cover-adaptive-fit/spec.md)、[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **物料库渲染可扩展性**（封版后增量，已纳入基线）：物料卡片网格项 `content-visibility: auto` +
  `contain-intrinsic-size: auto 140px` 跳过屏外卡片渲染（实测首帧 500 张 ≈50ms、2000 张 ≈160ms），
  搜索输入 120ms 防抖合并渲染；纯渐进增强——不支持 CV 的浏览器（Safari < 18、Firefox < 125）退回
  全量渲染，功能零损失；无窗口化/分页，catalog 与宿主边界不变。依据：
  [Material Library Render Scalability](../specs/archive/material-library-render-scalability/spec.md)、
  [ADR-0078](../decisions/ADR-0078-material-library-presentation.md)。
- **文本物料排版能力**（封版后增量，已纳入基线）：文本物料水平对齐（`textAlign`）与垂直对齐
  （`verticalAlign` top/middle/bottom）独立设置（flex 映射，缺失/top 保持 block 零回归），
  新增字间距 `letterSpacing`（px，0..100）与行间距 `lineSpacing`（px，0..512，增量语义：
  行高 = 字号 + 行间距），并补绝对行高 `lineHeight`（px，1..512）：行高为行盒绝对基准、
  行间距在其上叠加增量（`line-height = (lineHeight ?? 字号) + 行间距`），两者并存互不冲突，
  行高缺省时保持「随字号自适应」默认；新字段全部可选、旧文档零迁移、默认值同步（top/0/0），
  Manifest 与属性面板经既有 schema 驱动通道自动生效，Engine 与文档契约零改动。依据：
  [Text Material Typography](../specs/archive/text-material-typography/spec.md)、
  [ADR-0085](../decisions/ADR-0085-text-and-image-material-authoring.md)。
- **官方文本自适应宽度**（2026-08-31 增量）：`base.text` 的可选 `props.autoWidth` 默认关闭；
  开启后按最长手动换行撑宽、保留空格且不自动折行，位置和高度不变。Designer、预览及 Viewer
  使用相同物料排版；内部共享观察器将实际宽度投影到选择、命中、框选、吸附与布局操作，不写入
  canonical 文档、脏状态或历史。手动调宽、多选/编组横向缩放在同一事务中退出自适应，只调高
  保留固定宽度记录；关闭开关固定当前显示宽度。隐藏缓存、手势冻结、双击编辑和复制/导出均保持
  持久尺寸与运行时尺寸的边界。依据：[ADR-0085](../decisions/ADR-0085-text-and-image-material-authoring.md)。
