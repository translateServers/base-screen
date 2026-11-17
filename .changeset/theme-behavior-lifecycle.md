---
'base-screen': minor
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/renderer': minor
'@base-screen/engine': minor
---

批 2：通用视觉层与文档级主题、实例级触发器。

- 保留样式键扩展为行为/滤镜通用层：`passThrough`（事件穿透）、`hoverPointer`（悬浮小手）、
  `clip`（裁切超出）、`blend`（混合模式）、`filterBlur/filterBrightness/filterContrast/filterSaturate/filterHueRotate`。
  渲染器几何帧统一消费；检查器新增引擎自建「行为」「滤镜」分区（滤镜默认折叠），
  不依赖物料申报。overflow 仍归物料，3D 旋转/倾斜/缩放不做。
- 文档级主题色板（ADR-0098）：`ScreenDocument.theme` 六个固定语义槽；组件 style 颜色值可写
  `theme:<slot>` 引用，渲染器确定性解析、悬空引用失败关闭；core 新增 `update-theme` 命令；
  画布配置新增「主题色板」分区。预设库与换肤策略归宿主。
- 蓝图新增 `lifecycle` 触发器（`ready`，文档装载/替换后就绪一次，编辑重渲染不重发）与
  `timer` 触发器（1–86400 秒，按间隔去重调度、tick 带间隔标识、计划重编译增删、实例清空停止），
  含能力 id、relations 源形态、编译与运行时分派。工作台图投影与默认画布已内建实例节点：
  lifecycle 单例节点、每个间隔一个 timer 节点；关系库可插入、来源端口可拖拽建关系、
  检查器可改定时器间隔、删除节点级联清理关系。宿主自定义画布按公开图协议消费
  `lifecycle` / `timer` 节点（out handle 为 `event:ready` / `event:tick`）。
- AI 物料样式签名同步纳入引擎级保留键与 `theme:<slot>` 语法说明，模型能直接引用主题色板；
  条件样式端口覆盖里的主题引用同样按失败关闭解析（补测）。