# Material Library Error Console Spec

> 状态：生效中
> 日期：2026-08-13
> 依据：[ADR-0035](../../decisions/ADR-0035-material-library-feedback-workspace-placement.md)

## 1. 目标

将组件/物料加载失败等目录反馈从 Designer 左侧物料面板移至底部状态栏可达的错误控制台，使左栏稳定地服务于搜索、
宿主分组和物料网格浏览；同时保持既有宿主状态投影、卡片标记、动作事件、可访问性、主题 Token 和无抖动约束。

## 2. Requirements

### R1：底部状态栏控制台

Designer SHALL 在底部状态栏提供错误控制台按钮，带有可访问名称、展开状态和当前实例错误计数。点击 SHALL 打开
一个可访问弹窗，关闭 SHALL 将焦点返回该按钮。控制台 SHALL 具有当前目录状态区域和有界错误记录区域，且不得
参与左侧物料面板或画布的文档流。当前状态与历史记录 SHALL 有明确分区，历史记录 SHALL 按最新优先排列并显示记录数。

### R2：物料状态与宿主动作

`data-material-library-status` SHALL 位于错误控制台而非 `[data-materials]`。`partial` 与 `error` SHALL 记录为错误；
`offline` 与 `update-available` SHALL 作为当前可操作状态显示；`loading` 与 `ready` SHALL 不产生新的错误记录。
控制台 SHALL 保留 `retry | reload | details` 的 `data-material-library-action` 与 composed 宿主事件。草稿和不可用
标记 SHALL 继续渲染在左侧卡片；不可用物料仍不可添加或拖拽。

### R3：可访问性与无抖动

错误条目 SHALL 具备 `alert` 语义，非中断目录状态 SHALL 具备 `status` 语义。控制台 SHALL 支持清空记录、关闭、
可见键盘焦点、Tab/Shift+Tab 焦点闭环、Escape 和遮罩关闭、forced-colors 和 reduced-motion。清空历史后，未变化的当前失败状态不得立即重新写入历史。
打开、关闭、清空或状态切换 SHALL 不改变左侧搜索、分组、网格或画布几何；控制台入口的计数更新也不得改变状态栏轨道宽度。

### R4：兼容边界

不得修改 `BaseScreenMaterialLibraryState` schema、Material Manifest、catalog、ScreenDocument、Renderer、Viewer、SDK
公共 API 或宿主配置。`data-material-library-status` 和 `data-material-library-action` 继续可用；未提供状态投影时，
控制台保持空记录。实现仅使用已有 Designer Token 与现有 DOM/控制器边界。

### R5：验证与交付

DOM/控制器/样式测试 SHALL 覆盖入口、计数、记录有界性、弹窗焦点、状态与 Token 样式。真实 browser harness SHALL
验证失败反馈不属于左侧物料面板、控制台动作仍可触发、卡片状态不变，且控制台和状态切换不移动网格或画布。交付前
SHALL 通过格式化、相关 Engine 检查、`pnpm verify:browser` 与 `pnpm verify:m0`。

## 3. 非目标

- 新增网络加载器、重试策略、宿主 dialog/toast API、持久化或后台任务。
- 改变状态 schema、物料分组、卡片排序、收藏/最近/搜索语义。
- 建立跨实例或跨会话的日志系统，或记录宿主敏感错误上下文。

## 4. 完成定义

- `tasks.md`、`checklist.md` 和 `test-matrix.md` 与实现和自动化证据一致。
- 左侧面板不包含组件加载失败反馈，错误控制台保持动作、可访问性、记录边界和无抖动。
- `pnpm verify:m0` 通过，ADR/Spec 索引、能力基线和验收材料同步完成状态。
