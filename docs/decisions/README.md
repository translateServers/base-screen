# Base Screen 架构决策记录

> 状态：生效中
> 最近更新：2026-09-16（按主线合并：9 份主线 ADR 收敛 48 份碎片记录，被吸收记录已移除）
> 定位：索引 Base Screen 的架构决策、状态及其影响范围

## 使用规则

- ADR 记录影响公共契约、依赖方向、安全边界、兼容策略或工程基线的重要决策。
- 状态流转为：设计中 -> 评审中 -> 已接受 -> 已取代或已废弃。
- 已接受 ADR 不修改历史结论；方向变化时新增 ADR，并在新旧文档中互相标注。
- 评审中 ADR 不能作为实施授权。进入代码实现前还需要 acceptance-oriented Spec。
- ADR 中的示例配置用于冻结语义；精确实现文件由对应 Spec 验收。
- **主线合并记录**：标记「性质：主线合并记录」的 ADR 收敛同一主线上多份碎片 ADR 的**现行结论**，自身不引入新决策；被吸收记录已从仓库移除，其编号与贡献逐条登记在该主线 ADR 的「归并范围」表中。**查询当前行为时读主线 ADR。**
- 新增记录的准入门槛：只有改变长期架构决策、包依赖/所有权或公共兼容策略的变更才新建 ADR；单一范围内的 UI 修复、展示调整与「评估后决定不做」的结论按任务记录或该功能所属主线 ADR 承载，不再单独立项。

## 决策索引（按主题）

### 一、仓库基座、包边界与依赖准入

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0001](./ADR-0001-monorepo-toolchain-and-package-boundaries.md) | 已接受 | 2026-08-03 | Monorepo、工具链、私有阶段版本与十二包依赖边界 |
| [ADR-0019](./ADR-0019-designer-specialized-editor-dependencies.md) | 已接受 | 2026-08-05 | Designer 专项编辑依赖准入 |
| [ADR-0074](./ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md) | 已接受 | 2026-09-11 | 外围插件承载位置与依赖分区：新增顶层 `plugins/` 分区，核心库依赖白名单与固定包清单不变；外围插件无运行时特权，依赖准入沿用 ADR-0019 |
| [ADR-0075](./ADR-0075-peripheral-plugin-compatibility-policy.md) | 已接受 | 2026-09-12 | 外围插件兼容性策略：锁步批次交付 + 以 api 基线治理的 plugin-core/plugin-sdk 稳定子集，不引入版本标记 |

### 二、规范文档、核心域与离线迁移

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0002](./ADR-0002-canonical-screen-document.md) | 已接受 | 2026-08-04 | Canonical Screen Document 契约 |
| [ADR-0011](./ADR-0011-nebula-importer-auditable-migration.md) | 已接受 | 2026-08-04 | Nebula importer 可审计迁移 |
| [ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md) | 已接受 | 2026-08-04 | Core canonical Blueprint mutation |

### 三、渲染内核与引擎骨架

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0005](./ADR-0005-renderer-dom-shadow-dom-and-product-elements.md) | 已接受 | 2026-08-04 | Renderer DOM、样式、Shadow DOM 与产品元素归属 |
| [ADR-0006](./ADR-0006-designer-engine-dom-interactions-and-history.md) | 已接受 | 2026-08-04 | Designer Engine DOM、交互与历史策略 |
| [ADR-0020](./ADR-0020-designer-canvas-interaction-pilot.md) | 已接受 | 2026-08-06 | Designer 画布交互逻辑层移植（Moveable/Gesto 源码 vendor，实施与验证已完成） |

### 四、宿主边界与产品定位

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0007](./ADR-0007-host-resource-and-blueprint-runtime.md) | 已取代 | 2026-08-04 | Host Resource 与受限 Blueprint 运行时 |
| [ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md) | 已接受 | 2026-08-04 | Host Resource deadline 与 Blueprint 运行时 |
| [ADR-0012](./ADR-0012-designer-project-lifecycle.md) | 已接受 | 2026-08-04 | Designer 项目生命周期 |
| [ADR-0017](./ADR-0017-designer-product-host-boundaries.md) | 已接受 | 2026-08-05 | 完整 Designer 产品的宿主边界 |
| [ADR-0018](./ADR-0018-host-intents-assets-and-graph-blueprint.md) | 已接受 | 2026-08-05 | 宿主意图、资产与图形 Blueprint |
| [ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md) | 已接受 | 2026-08-10 | 轻量设计器基座定位与宿主重型处理边界；部分取代 ADR-0017 的完整产品范围 |
| [ADR-0044](./ADR-0044-host-popup-anchored-overlay-no-integration.md) | 已接受 | 2026-08-16 | 宿主弹出框与贴组件锚定弹窗对接评估结论：不做修改——宿主弹窗走既有事件/端口/作者桥/`previewHandler` 机制，不新增坐标转换 API、不扩展 material-event detail、不新增 viewport 跟随事件、不引入锚定/碰撞依赖；公共边界零变化 |

### 五、物料契约、ABI、分发与资源承载

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md) | 已接受 | 2026-08-03 | Web Component 物料 ABI 与注册规则 |
| [ADR-0016](./ADR-0016-material-appearance-authoring-contract.md) | 已接受 | 2026-08-05 | Material 声明式外观作者契约 |
| [ADR-0022](./ADR-0022-official-data-material-contracts.md) | 已接受 | 2026-08-07 | 官方图表与表格数据语义契约 |
| [ADR-0029](./ADR-0029-host-managed-material-package-distribution.md) | 已接受 | 2026-08-11 | 宿主托管可信物料包分发：宿主负责加载与信任，Base Screen 提供 `createMaterialPackage` 注册辅助；远程代码加载不进 Base Screen |
| [ADR-0030](./ADR-0030-host-material-mcp-access.md) | 已接受 | 2026-08-12 | Skill 管流程、MCP 管在线物料查询与校验、规范快照管离线兜底；生产服务与运行包仍归宿主 |
| [ADR-0064](./ADR-0064-host-resource-authoring-intent.md) | 已接受 | 2026-08-30 | 宿主资源目录只提交严格 authoring intent；Designer 提供单事务插入、替换与拖放，删除旧素材目录端口 |

### 六、插件贡献词汇表与信任边界

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0084](./ADR-0084-plugin-contribution-vocabulary-and-trust.md) | 已接受 | 2026-09-16 | **主线现行决策**：八类贡献、能力与授权模型、同 realm 受信代码不变式（吸收 ADR-0004、ADR-0014、ADR-0015、ADR-0070、ADR-0071、ADR-0072、ADR-0073、ADR-0076 共 8 份，已移除） |

### 七、外围插件分区与远程沙箱协议

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0008](./ADR-0008-remote-plugin-sandbox-protocol.md) | 已取代 | 2026-08-04 | 远程插件 iframe sandbox 与消息协议 |
| [ADR-0009](./ADR-0009-remote-plugin-sandbox-cross-origin-transport.md) | 已接受 | 2026-08-04 | 远程插件跨 origin iframe transport |

### 八、数据集消费

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0082](./ADR-0082-dataset-consumption-contract.md) | 已接受 | 2026-09-16 | **主线现行决策**：`ScreenHostDatasetPort` 统一目录与查询、参数权威下移、请求身份与错误协议（吸收 ADR-0023、ADR-0025、ADR-0069 共 3 份，已移除） |

### 九、变量体系

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0083](./ADR-0083-variable-system.md) | 已接受 | 2026-09-16 | **主线现行决策**：三类来源、稳定 ID 引用、完整配置字段、Blueprint 变量节点与运行时变量句柄（吸收 ADR-0054、ADR-0067、ADR-0068 共 3 份，已移除） |

### 十、事件与 Blueprint 作者面

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0081](./ADR-0081-event-and-blueprint-authoring-ownership.md) | 已接受 | 2026-09-16 | **主线现行决策**：一体化工作台壳层与语义编辑、Core trace、宿主只提供中央图形渲染（吸收 ADR-0026、ADR-0028、ADR-0061、ADR-0063 共 4 份，已移除） |

### 十一、条件样式

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0080](./ADR-0080-conditional-style-authoring-ownership.md) | 已接受 | 2026-09-16 | **主线现行决策**：canonical `styleRules`、Renderer 求值、宿主 `conditionalStylePort`、作者入口归宿主（吸收 ADR-0058、ADR-0059、ADR-0066 共 3 份，已移除） |

### 十二、画布背景与颜色表达

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0077](./ADR-0077-canvas-background-and-color-authoring.md) | 已接受 | 2026-09-16 | **主线现行决策**：背景图字段与失败关闭校验、结构化调色板、三段式颜色控件、渐变在物料端的渲染归属（吸收 ADR-0043、ADR-0045、ADR-0046、ADR-0048、ADR-0049、ADR-0050、ADR-0051、ADR-0055、ADR-0057 共 9 份，已移除） |

### 十三、物料库呈现与宿主状态投影

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0078](./ADR-0078-material-library-presentation.md) | 已接受 | 2026-09-16 | **主线现行决策**：物料可见性过滤、宿主状态投影与多级分组、封面字段与自适应适配、渲染可扩展性、条目投影（吸收 ADR-0021、ADR-0031、ADR-0033、ADR-0034、ADR-0035、ADR-0040、ADR-0041、ADR-0042、ADR-0060 共 9 份，已移除） |

### 十四、工作台框架、顶栏与预览接管

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0079](./ADR-0079-designer-workbench-shell-and-chrome.md) | 已接受 | 2026-09-16 | **主线现行决策**：左栏信息架构、折叠与宽度写回、原生事件开关、`previewHandler`、宿主分组 slot 协议（吸收 ADR-0032、ADR-0036、ADR-0037、ADR-0038、ADR-0039、ADR-0062 共 6 份，已移除） |
| [ADR-0088](./ADR-0088-designer-workspace-chrome-and-visual-base.md) | 已接受 | 2026-10-12 | 顶层菜单栏与视觉基座整体替换（自设计原型移植第一批）：浅色缺省、公共 Token 覆盖面不变、发布钮反转实底、Ctrl/Cmd+K；ADR-0079 的顶栏/状态栏非目标由本 ADR 取代 |

### 十五、文本与图片物料作者契约

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0085](./ADR-0085-text-and-image-material-authoring.md) | 已接受 | 2026-09-16 | **主线现行决策**：文本排版、自适应宽度与运行时几何、图片 URL 校验与失败回退（吸收 ADR-0047、ADR-0056、ADR-0065 共 3 份，已移除） |
| [ADR-0086](./ADR-0086-material-state-and-surface-ownership.md) | 已接受 | 2026-10-03 | 物料非 ready 态呈现与盒面样式的单一归属：状态视图落 `plugin-sdk`，`idle` 不给文案，错误态呈现已脱敏 message |
| [ADR-0087](./ADR-0087-composite-component-fragment-insertion.md) | 已接受 | 2026-10-04 | 组合分片插入入口 `insertComponentFragment`：预设存储归宿主，基座只做一次展开；shell 按 `designCapabilities.children` 校验，`props`/`style` 与 manifest 默认值合并后过 schema |

### 十六、画布内编辑与几何

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0052](./ADR-0052-designer-canvas-text-editing.md) | 已接受 | 2026-08-16 | Designer 画布内文本直接编辑：双击可编辑文本组件进入 contenteditable overlay 编辑会话（仅 `base.text` + static 字符串 dataSource，fail-closed），Enter 提交 / Shift+Enter 换行 / Esc 取消 / 失焦提交，提交复用 `update-components` patch dataSource（恰一条历史）；overlay 经既有 `isEditableTarget` 通道放行 IME 与原生编辑键；不侵入物料/Renderer DOM，公共契约零变化 |
| [ADR-0053](./ADR-0053-designer-multi-selection-editing.md) | 已接受 | 2026-08-16 | Designer 多选批量属性编辑：多选检查器新增批量几何（宽/高/旋转）与样式交集编辑（复用 createControl / 三段式调色板），值显示焦点组件、编辑应用到全部选中，一条事务 N 条命令（跳过锁定、逐组件 schema 校验）恰一条历史；`data-multi-property` 独立分派，单选通道零改动，公共契约零变化 |

### 十七、主题与样式 Token

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0024](./ADR-0024-designer-public-style-tokens.md) | 已接受 | 2026-08-07 | Designer 宿主可配置主题 Token |

## 计划决策

ADR-0025 已于 2026-08-09 接受，实施与验收已经完成；相关历史任务与验收见
[Data Runtime Hardening Spec](../specs/archive/data-runtime-hardening/spec.md)，XJ 侧见
XJ Data Hub 仓库 `.agent/specs/data-runtime-hardening/spec.md`。

ADR-0026 已于 2026-08-10 接受并建立 canonical 事件 Blueprint 与 Core trace。其 Engine 内部作者 UI 范围先由
ADR-0028 移交宿主作者桥，再由 ADR-0061 收敛为整屏 detached 上下文；ADR-0063 最终改为 Base Screen 拥有有界
工作台壳层和语义编辑、宿主只提供中央图形渲染。历史评估见 [Designer Event Blueprint Spec](../specs/archive/designer-event-blueprint/spec.md) 与
[候选评估报告](../plans/archive/designer-event-blueprint/dependency-evaluation.md)。

ADR-0027 已于 2026-08-10 接受：Base Screen 定位为轻量、可嵌入的大屏设计器基座；项目、数据、资产、发布和
长任务的真实处理由宿主负责，Base Screen 只拥有本地作者内核、渲染内核与有界宿主端口。

ADR-0028 已于 2026-08-10 接受：物料 Manifest 可通过 JSON-safe 声明式 Editor Descriptor 描述外观/数据/交互/
事件作者字段；Engine 提供有限内建面板 primitives 与宿主作者桥（requestId/revision/身份/实例守护 + 专用提交
入口）。ADR-0061 曾规定 Blueprint 使用整屏 detached 请求；ADR-0063 已移除该分支，当前 Blueprint 直接编辑
当前文档并由 Engine 提供工作台壳层，图形框架与布局算法仍归宿主。代码编辑器、完整 ECharts option 与领域编辑器
继续归宿主。规格见
[Designer Authoring Extension Spec](../specs/archive/designer-authoring-extension/spec.md)。

ADR-0029 已于 2026-08-11 接受：宿主托管可信物料包。宿主负责加载、审核与信任远程物料代码，Base Screen 不
fetch/dynamic import/发现远程代码；plugin-sdk 提供 `createMaterialPackage` 注册辅助，物料进入 Base Screen 后
仍遵守 ADR-0003 同 realm ABI 与实例级不可变 catalog。规格见
[Host Material Package Spec](../specs/archive/host-material-package/spec.md)。

相关背景、实施计划和规格入口见 [文档索引](../README.md)。
