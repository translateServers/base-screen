# DataV 高保真右侧检查器改造方案

> 归档：2026-08-30（P0–P14 已完成）
> 代码治理复核：2026-08-30
> 当前状态：P0–P14 已完成，历史文件规模豁免已清零；`pnpm verify:m0` 与
> `pnpm verify:browser` 已于 2026-08-30 通过

## 目标

Base Screen 以阿里云 DataV 7.0 官方文档和界面截图为视觉、内容与交互基线，高保真还原
320px 右侧检查器：未选择时显示页面配置，选择组件后提供样式、数据源和高级三个页签。
数据配置保持在右侧栏内逐步展开，不切换为全屏工作台。

本方案只复现可观察的布局、层级和通用交互，不复制 DataV 商标、原始图片、源码或受保护的
专有资产。Base Screen 继续保持可嵌入设计器基座定位，不扩展为数据平台或发布后台。

## 调研依据

调研于 2026-08-25 完成，主要依据阿里云官方文档：

- [PC 端画布编辑器](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/canvas-editor-on-pcs/)
- [页面与组件配置](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/page-and-widget-configurations)
- [画布工具栏](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/toolbar-of-canvas-on-pcs/)
- [图层管理](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/layer-management-of-canvas-editor-in-pc-of-datav-7)
- [配置项说明](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/configuration-items)
- [组件数据源配置](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/widget-data-source-configuration)
- [蓝图编辑器](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/blueprint-editor-features-of-datav-7)
- [功能概览](https://help.aliyun.com/zh/datav/datav-7-0/getting-started/function-overview)

## 目标信息架构

| 区域 | 目标体验 | Base Screen 职责 |
| --- | --- | --- |
| 顶栏 | 项目状态、Canvas/Blueprint 模式、全局查找、预览、保存、发布与宿主动作 | 提供常驻工作台和模式 API；模式切换不重建 Designer |
| 左侧功能轨 | 物料、图层、变量等一级入口固定；二级内容随入口切换 | 管理当前实例的物料目录、文档图层和变量 |
| 中央画布 | 标尺、网格、缩放、辅助线、选择与直接操作始终占据主视觉 | 负责当前文档编辑与 Viewer/Designer 渲染 |
| 右侧检查器 | 未选择时显示页面配置；选择组件后切换样式、数据源、高级 | 使用声明式 descriptor 和 canonical transaction |
| 复杂编辑 | Blueprint 使用同一工作台，代码等领域编辑器仍由宿主打开 | Blueprint 语义壳层与严格 slot 协议归 Base；中央图形和其它专项编辑器归宿主 |

## 产品边界

纳入本轮学习：

- 大屏画布编辑器外壳与导航层级。
- 物料查找、图层定位、属性检查和快捷命令。
- 组件样式、数据、交互三个上下文面板。
- 侧栏内数据源类型、数据集选择、字段映射、响应预览、刷新和加载设置。
- 预览、错误提示、缩放、历史等设计时反馈。

明确排除：

- 工作空间、项目列表、账号、权限、计费与团队协作后台。
- 数据接入平台、查询聚合、缓存、ETL 和凭证管理。
- 资产存储、转码、发布部署、公开链接、截图视频和长任务。
- 在 Engine 内引入 Vue Flow/Dagre 或实现代码编辑器、领域 ECharts 编辑器。
- 用全屏数据工作台替代 DataV 风格的右侧数据源面板。
- DataV 品牌、原始素材和一比一资源复刻。

## 差距与改造顺序

### 编辑器外壳

- 将左侧横向标签改为永久纵向功能轨，稳定一级入口位置。
- 用低饱和冷灰和蓝色强调色建立工具型视觉层级，减少装饰性光效。
- 在顶栏提供 Canvas/Blueprint 模式页签；Blueprint 是 Engine 内建语义工作区，但中央图形由固定宿主 slot 渲染。
- 增加全局查找，统一物料、图层和命令入口。

### 高频创作面

- 物料库使用紧凑双列缩略图，优化搜索、分类、收藏和目录扫描效率。
- 图层树强化层级、可见性、锁定、拖放目标和批量选择反馈。
- 检查器使用扁平页签、组件上下文摘要、属性搜索和基础/全部密度切换。
- 未选中组件时把画布配置作为清晰的页面级上下文。

### 复杂编辑与效率

- 数据配置使用单步展开的右侧栏：设置数据源位于顶部、字段映射停靠右侧、数据响应停靠底部。
- 数据源类型、可视化/代码编辑入口、过滤器、复制数据、加载态、受控模式和自动更新设置保持可操作。
- 交互编排使用 Base Screen 常驻工作台壳层和共享文档历史；节点库、声明式属性、校验与轨迹归 Base
  Screen，宿主只在固定 slot 中提供 Vue Flow/Dagre 图形画布、手势、布局与模拟入口。
- 后续按收益补充最近使用物料、命令别名、图层路径和可恢复的编辑工作区状态。

## 当前里程碑

本轮实现以下基础能力：

- 冷蓝中性色 Token 和更紧凑的组件几何。
- 左侧纵向功能轨与动态面板标题/数量。
- 顶栏整屏交互编排宿主入口，以及组件交互页的只读摘要与定位入口。
- 支持 `+` 物料、`/` 图层、`>` 命令前缀的全局查找。
- 高密度物料卡片和扁平检查器页签。
- DataV 风格页面配置、三列组件几何、3 × 3 快捷样式和侧栏内三步数据配置。

## 代码治理阶段与结果

本轮开始前，P0 只有治理方向而没有完成结构拆分，P2 也没有按当前宿主边界形成可验收闭环，
因此二者都不能视为完成。本轮按以下口径重新执行；这里的阶段只描述代码治理优先级，不改变产品
能力或公共兼容策略。

| 阶段 | 完成口径 | 当前结果 |
| --- | --- | --- |
| P0：结构与防回退 | 大型样式、控制器和测试完成职责拆分；规模与装配顺序进入自动门禁 | 已完成 |
| P1：稳定交互与可访问性 | 焦点反馈不改变几何；面板分隔条支持键盘、数值 ARIA 与边界约束 | 已完成 |
| P2：边界与真实环境验收 | 不把宿主编辑器收回 Engine；聚焦测试、浏览器 harness 与全仓门禁形成证据 | 已完成 |
| P3：检查器编排拆分 | 面板控制器成为编排 facade；检查器、物料、属性和选择职责独立 | 已完成 |
| P4：手势状态机拆分 | 拖拽、变换、框选、创建与组编辑使用显式会话模块 | 已完成 |
| P5：大型 DOM 构建器拆分 | 颜色面板与数据集 DOM 按模型、状态、视图和作者能力拆分 | 已完成 |
| P6：验收脚本模块化 | 浏览器场景按领域拆分，并纳入独立 500 行规模门禁 | 已完成 |
| P7：数据集控制器拆分 | 查询、草稿、预览、静态表格与宿主事件形成独立控制器 | 已完成 |
| P8：Designer DOM 拆分 | 检查器与剩余大型 DOM 按页面、选择、descriptor、数据和物料职责拆分 | 已完成 |
| P9：Engine 入口瘦身 | Custom Element 生命周期、作者桥、状态与公共方法移出发布入口 | 已完成 |
| P10：渲染与物料治理 | renderer/viewer、manifest 校验、ECharts 与渲染测试按职责拆分 | 已完成 |
| P11：Engine 余量治理 | 图层、画布辅助、操作契约与项目生命周期退出历史豁免 | 已完成 |
| P12：契约校验治理 | Document 校验器与测试按领域拆分，保持失败关闭语义 | 已完成 |
| P13：发布验证治理 | tarball 编排与消费者文件生成分离，并通过真实安装验收 | 已完成 |
| P14：历史基线清零 | 最后一个根级测试聚合体拆分，文件规模基线不再包含例外 | 已完成 |

### P0：结构与防回退

- 原 3 个大型 CSS 文件按 base、controls、workbench 三个装配域拆成 24 个语义片段；单片最大
  768 行，低于 UI 样式 800 行门禁。每个域由唯一 TypeScript 聚合器确定顺序，
  `check-designer-styles.mjs` 校验精确绑定与装配顺序。
- `DesignerWorkbenchController` 从 1331 行收敛到 302 行，只保留编排与公共 facade；面板布局、
  页签、吸附和辅助线分别下沉为 313、246、263、305 行控制器，辅助线覆盖层和标尺绘制进入
  `browser/viewport` 叶子模块。
- 原 1503 行 Workbench 测试拆为 fixture、panel、canvas、pointer 四个文件，最大文件 660 行；
  样式测试拆为共享 fixture、结构、交互与样式表共享四个文件，最大文件 312 行。
- 文件规模门禁现在扫描发布 CSS，并对 UI 样式使用 800 行上限；已拆文件从历史基线删除，后续
  不能通过旧豁免重新长成聚合体。
- 浏览器 harness 的面板验收从主脚本下沉到 265 行独立模块，主脚本从 8680 行降至 8502 行，
  为后续按业务域继续拆分建立入口。

### P1：稳定交互与可访问性

- 画布仅在 `:focus-visible` 下显示内描边焦点环，普通聚焦不出现浏览器默认外轮廓，也不改变
  画布尺寸或布局。
- 左右面板分隔条使用 `role="separator"`、纵向 orientation、`aria-controls` 和动态
  `aria-valuemin` / `aria-valuemax` / `aria-valuenow`；标签继续来自集中 UI 文案源。
- 键盘支持方向键 8px 调整、Shift + 方向键 32px 调整、Home 最小值、End 最大值；右侧方向
  与视觉拖拽一致，折叠态键盘操作会先展开。焦点效果只修改伪元素颜色与阴影，不触发布局。
- 控制器测试覆盖方向、步长、边界、折叠展开和捕获清理；浏览器 harness 使用真实焦点与键盘
  事件验证左右面板宽度和 ARIA 同步。

### P2：当前宿主边界下的验收口径

- P2 不再以“Engine 内建 Blueprint 图形/规则编辑器”作为完成条件。依据 ADR-0061，Engine 只保留
  整屏宿主入口、组件只读摘要、detached 上下文、严格校验和单事务提交；规则表单、流程图、
  节点检查器、搜索、布局与试运行 UI 均归宿主。
- 本轮没有新增 package、生产依赖、公共 API、Screen Document 字段或通用 UI 注入入口；
  `renderer` 与 designer 职责、`common` → `browser` 单向边界保持不变。
- 既有 DOM/控制器测试与 browser harness 继续断言：宿主请求入口存在，内建规则表单、图投影、
  expression 和节点操作不存在；detached 请求、generation/revision guard、完整 Blueprint
  单事务提交与 undo/redo 保持可用。
- 本轮新增验收覆盖样式装配、规模门禁、Workbench 拆分后的行为等价、面板键盘可达性、无抖动
  焦点样式与真实浏览器宽度/ARIA 同步。最终交付以 `pnpm verify:m0` 与 `pnpm verify:browser`
  同时通过为完成条件；两项已于 2026-08-30 通过。

### P3：检查器编排拆分

- `designer-panel-controller.ts` 从 1461 行收敛为 147 行 facade；回调契约、检查器导航、物料目录、
  属性事务和选择编排分别进入 5 个模块，单个实现模块最大 400 行。
- 原 2070 行测试拆为共享 fixture 与 rendering、drafts、materials、batch-rules 四类场景，最大测试
  文件 550 行；原有 50 个面板控制器用例全部保留。
- 事件委托顺序仍由 facade 唯一编排，descriptor 提交、失败关闭、批量事务和历史边界没有下沉到 DOM。

### P4：手势状态机拆分

- `designer-gesture-controller.ts` 从 1298 行收敛为 343 行；环境与回调契约之外，拖拽、变换、框选、
  创建和组编辑分别形成显式会话模块，单模块最大 238 行。
- 原 2718 行测试拆为共享 fixture 与 5 个场景文件，最大 608 行；48 个用例继续覆盖 pointer cancel、
  capture 清理、实时预览、吸附、组编辑和双实例隔离。
- 坐标换算仍由 viewport/common 纯逻辑提供，浏览器控制器只负责编排，没有形成反向依赖。

### P5：颜色与数据集 DOM 拆分

- `designer-color-palette-dom.ts` 从 1648 行收敛为 398 行 facade；模型、状态 DOM、主体 DOM 和值控件
  分离，最大模块 497 行。原 1573 行测试拆为 fixture 与 3 类场景，最大 520 行，61 个用例通过。
- `designer-dataset-dom.ts` 从 1068 行收敛为 247 行；数据流、作者动作、预览、目录和基础节点分别
  下沉，新增模块最大 282 行，既有 460 行配置模块继续保持独立。
- 可见文案仍只来自集中 UI 文案源；DOM 模块只构建节点、投影状态和声明事件标记，不依赖控制器。

### P6：浏览器验收模块化

- `verify-browser-harness.mjs` 从 8502 行收敛为 8 行入口；45 个模块分别覆盖视口初始化、桌面基线、
  左侧面板、画布、作者工作流、数据集、Blueprint 宿主桥、ECharts descriptor 与事件系统。
- 所有 browser harness 模块均不超过 500 行，当前最大文件 485 行；公共 Playwright 操作、稳定几何
  和 overlay 约束集中为小型辅助模块，没有引入新依赖或改变验收顺序。
- 文件规模门禁新增 `browser-harness` 类别与 500 行硬上限，并有根级单元测试锁定策略；原 8502 行
  历史豁免可从规模基线移除。
- P3–P6 最终通过 `pnpm verify:m0` 与 `pnpm verify:browser`；公共 API、无副作用 Engine 导入、12 包
  tarball 消费者安装以及真实桌面/紧凑视口流程均保持通过。

### P7：数据集作者流程拆分

- `designer-dataset-controller.ts` 从 1585 行收敛为 153 行 facade；上下文、草稿、预览、surface、
  静态表格和事件投影分别进入 `controllers/dataset/`。
- deadline、取消、generation guard、目录选择、字段映射、测试响应与滚动同步仍由既有测试和浏览器
  场景覆盖；DOM 不持有请求生命周期。

### P8：Designer DOM 目录治理

- `designer-panel-dom.ts` 从 2516 行收敛为 24 行装配入口；页面配置、组件属性、多选、descriptor、
  数据绑定与物料面板进入 `dom/panel/`，其余颜色、数据集、变量、图层和菜单也按模型/状态/视图拆分。
- DOM 叶子继续只依赖 `common`、`ui` 或最小消费接口，不反向依赖 controller；交互通过稳定的
  `data-*` 标记上浮给控制器。

### P9：Engine 发布入口治理

- `engine/src/index.ts` 从 2862 行收敛为 478 行；Custom Element options、状态、生命周期、作者桥、
  公共方法和控制器装配进入 `designer-element/` 内部模块，单模块继续受 500 行门禁约束。
- 公共导出保持不变，导入 `@base-screen/engine` 仍不注册元素、不访问存储；画布指针聚焦回归也加入
  真实浏览器证据。

### P10：renderer、plugin-core 与 material 治理

- renderer 主实现从 1397 行降到 354 行，viewer 从 693 行降到 448 行；渲染候选、资源状态、物料
  DOM、生命周期、Blueprint 与变量控制器各自独立，renderer 仍不感知 designer。
- plugin-core 的 editor descriptor 从 1191 行降到 76 行 facade，material 校验从 1113 行降到
  10 行 facade；schema、字段、条件、事件、面板与通用校验分别归位。
- ECharts 官方物料拆成 schema、descriptor、manifest、definition、element 与数据适配模块；原 1854 行
  renderer 测试聚合体拆为 presentation、data runtime、events、resilience、conditional style 与共享 fixture，
  122 个用例保持通过。

### P11：Engine 剩余历史豁免清理

- 图层控制器按拖放会话与重命名/选择会话拆分，主控制器为 400 行；画布辅助把 ruler 和 snap candidate
  数学下沉，主模块为 412 行。
- 元素操作宿主契约独立成类型模块，操作注册主体为 448 行；项目控制器把 scheduler、诊断支持与 adapter
  调用拆开，主控制器为 468 行。
- 集中 UI 文案明确为 `ui-text-catalog` 权威纯数据源，使用独立 1000 行硬上限；浏览器内联可见文案禁令
  没有放宽。至此 Engine 不再依赖历史文件规模豁免。

### P12：Document 契约校验治理

- `validate.ts` 从 913 行收敛为 156 行编排器；canvas、component、blueprint、variable 与诊断映射形成
  独立校验模块，最大实现 343 行。
- 未改变 fail-closed、严格字段、容量预算、引用校验或共享 base 快路径；原 1275 行测试拆成 4 个领域
  文件，最大 410 行，54 个原用例和 contracts 全包 163 个用例保持通过。

### P13：tarball 验收编排治理

- `verify-tarballs.mjs` 从 1100 行降到 442 行，只保留依赖排序、打包、隔离安装和 smoke 编排；消费者
  package、React/Vue/Vanilla 源文件及浏览器验证模板进入 664 行独立模块。
- 仓库根目录和 tarball spec 作为显式参数注入，不保留隐式跨模块状态；12 包 publint/ATTW、临时消费者
  安装及三类浏览器消费流程实际通过。

### P14：历史文件规模基线清零

- `host-skill-adoption.test.ts` 从 821 行降到 655 行，临时宿主、快照摘要与旧布局 fixture 下沉为
  181 行共享模块，17 个迁移与失败恢复用例保持通过。
- `scripts/file-size-baseline.json` 的 `exceptions` 现在为空；新增长文件只能通过职责拆分或新增明确的
  纯数据/生成物类别解决，不能再借用历史豁免。

## 归档验收原则

- 1024 × 640 最小设计器尺寸内没有非预期遮挡或控制项跳动。
- hover、选中、主题和数据状态变化不改变稳定几何，不引入视觉抖动。
- 全局查找可通过鼠标和键盘完成打开、过滤、移动、执行与关闭。
- 文档修改仍只经过 Core transaction/history，不向 Screen Document 写入 UI session。
- 需要宿主能力的动作只发出公开、JSON-safe 请求，不访问 Engine 私有 DOM 或 Store。
- 深浅主题、高对比模式和减少动画偏好保持可用。
- 数据步骤切换不得隐藏左右工具栏或打开全屏容器，步骤切换后不得沿用旧滚动位置造成空白。
- 数据集检索、参数、映射、测试响应、消费/请求预览和设置事件均有浏览器自动化证据。
