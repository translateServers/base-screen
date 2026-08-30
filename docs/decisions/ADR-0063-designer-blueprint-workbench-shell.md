# ADR-0063：Designer Blueprint 一体化工作台壳层

> 状态：已接受
> 日期：2026-08-29
> 取代范围：[ADR-0061](./ADR-0061-host-constrained-visual-event-blueprint.md) 的决策 4、5、7、8，以及“图布局不进入文档”的表述
> 规格：[Designer Blueprint Workbench](../specs/archive/designer-blueprint-workbench/spec.md)

## 背景

ADR-0061 用 detached request/commit 把 Blueprint 图形编辑全部交给宿主。XJ 的落地证明 Vue Flow、Dagre
和图形手势确实应留在宿主，但独立标题栏、草稿历史、应用/取消和 Designer 历史形成了两套工作台与两套
编辑状态。模式切换会卸载 Designer，预览、保存、发布、问题和面板也无法保持一致。

DataV 的可观察工作流是在同一顶部栏切换画布与蓝图，并直接使用预览、保存和发布。由此采用的产品推断是：
Blueprint 应编辑当前内存文档，而不是维护一份待应用草稿。参考：[DataV 蓝图编辑器](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/blueprint-editor-features-of-datav-7)、
[DataV 画布工具栏](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/toolbar-of-canvas-on-pcs/)。

## 决策

1. Designer 提供常驻 48px 全局工具栏和 `canvas | blueprint` 工作台模式。预览、保存、发布、主题、问题、
   面板与项目状态只有一套；模式切换不重建顶部栏或 Designer。
2. Blueprint 直接修改当前 `ScreenDocument`，复用 Core 命令、`DesignerSession` 历史、脏状态与项目 revision。
   不再提供 Blueprint 草稿、应用、取消或 pending authoring generation。组件文本 authoring request 保留。
3. Base Screen 拥有工作台壳层、左右面板、底部状态、搜索、语义图投影、canonical mutation、compile/trace、
   history 和失败策略；宿主拥有中央图形渲染技术。XJ 继续拥有 Vue Flow、Dagre、画布手势、缩放、MiniMap、
   自动布局和局部工具栏。Base Screen 不依赖 Vue、Vue Flow 或 Dagre。
4. 中央图形通过固定 `base-screen-designer-blueprint-canvas` slot 接入。Base Screen 向 slot 元素发送冻结、
   JSON-safe、有界的权威状态；宿主只通过 composed+bubbling 的严格命令事件返回操作。协议使用 command id、
   slot generation 和 document revision 拒绝未知、重复、过期和越界命令，并在拒绝后重发权威状态。
5. 模式、两边选择、临时拖动和 trace 高亮属于 Designer session；`blueprint.layout` 继续保存节点位置和视口。
   拖动、缩放和自动布局只在手势结束时提交，一个完成的用户操作最多形成一条历史。
6. Canvas 与 Blueprint 中央宿主都保持挂载。非活动面通过 `active` 暂停交互；重新激活时宿主重新测量图形。
   slot 缺失时 Blueprint 页签禁用；活动期间 slot 被移除时原子回退 Canvas 并发出诊断和 mode-change 事件。
7. 公开 API 增加 `workbenchMode`、`setWorkbenchMode`、`initialWorkbenchMode` 和模式变化事件。SDK 原样转发。
   Blueprint detached authoring 类型和方法直接移除，不保留并行兼容分支或版本后缀。
8. Base Screen 与宿主协议消费者必须在同一交付窗口升级；回滚也同时回滚两侧。ScreenDocument schema、
   数据库和存量文档无需迁移。
9. ADR-0062 的宿主左侧分组可通过 `workbenchModes` 投影到 Blueprint `rail-tabs`。Canvas 与 Blueprint 分别
   保留当前 Tab，但同一分组始终复用一份命名 slot/tabpanel；模式切换不得重新挂载宿主 light DOM 子树。

## 结果

- 画布和 Blueprint 按时间顺序共享撤销/重做、脏状态、预览、保存和发布约束。
- Base Screen 承担当前实例内的有界作者内核，但不吸收宿主业务基础设施或图形框架。
- 宿主不访问 Shadow DOM、内部 Store 或私有源码；中央图形可以独立演进，只要遵守公开协议。
- ADR-0061 的 canonical ECA 语义、Manifest 事件事实来源、严格 compile/trace 和宿主业务边界继续有效。
