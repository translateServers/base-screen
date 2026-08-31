# Host Resource Authoring Spec

> 归档：2026-08-31（已完成）
> 状态：已完成，历史验收记录
> 依据：[ADR-0064](../../../decisions/ADR-0064-host-resource-authoring-intent.md)

## 范围

本规格交付宿主资源 intent 的严格解析、Designer 插入/替换方法、画布拖放与旧素材端口移除；资源
目录、搜索、权限、签名和缩略图不进入 Base Screen。

## Requirements

- R1：intent 只接受 `materialType`、`dataSource`、可选 `name`，整体 JSON-safe 且不超过 8 KiB；
  URL、token、header、未知字段失败关闭。
- R2：插入必须校验 catalog、Manifest `host-resource` capability、资源类型贡献和资源端口；默认
  使用 Manifest 初始值，在可见画布中心创建并夹紧到画布范围，表面未建立时回退 canonical 中心。
- R3：替换必须要求目标存在且 type 完全相同，只提交一次 `dataSource` patch。
- R4：拖放使用公开固定 MIME；dragover 正文可读时重新解析，原生浏览器保护正文时只接受 MIME
  候选；drop 必须重新解析与校验。合法落点吸附后创建，非法载荷不修改文档并报告稳定诊断。
- R5：插入和替换各产生恰一条 history 和 change；从干净状态进入 dirty 时派发一次 dirty-change，
  已经 dirty 时沿用既有状态变化事件语义；undo/redo 可恢复。
- R6：删除旧素材端口、能力位、元素属性/方法和 Engine 内置素材控制器。
- R7：公共 Engine/SDK 声明、使用文档、API 报告和真实 tarball 同批更新。

## 非目标

- 不实现宿主资源目录、上传、删除、权限、分页、缓存或签名刷新。
- 不在本阶段改变画布背景图片契约。

## 验收

聚焦测试覆盖严格解析、超限/非法拖拽、能力校验、中心插入、吸附落点、同类型替换、单历史和
undo/redo；最终通过 `pnpm verify:m0`。

2026-08-31：完整 `pnpm verify:m0` 通过（含包边界、样式、API 和真实 React/Vue tarball 消费者）。
XJDataHub 使用同批 vendored 包完成原生资源拖放、插入/替换、slot 状态保留、Canvas/Blueprint 切换、
保存重读、Viewer、市场过滤与桌面/窄视口稳定布局验收。宿主 slot 内容容器传递可用高度，宿主可自行
固定操作区并由列表拥有滚动；未新增资源 UI 或 Engine 状态。

浏览器集成回归还验证了资源与数据集的隔离：只有声明 `dataBinding` 的物料进入数据集作者界面；
其余 `host-resource` 在既有数据检查器内只显示稳定来源摘要，添加/替换仍由宿主公开 intent 完成。
选中或替换图片/GIS/拓扑不触发 `datasetCatalog.list/describe`；切换时取消旧请求并忽略迟到结果。
