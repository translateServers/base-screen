# DataV-Inspired Global Variables Spec

> 归档：2026-09-01（已完成）
> 状态：已完成，历史验收记录
> 依据：[ADR-0067](../../../decisions/ADR-0067-datav-inspired-global-variables.md)

## 范围

本规格在保持 `static | host` canonical 变量模型和宿主数据边界的前提下，交付变量描述、严格宿主
目录、作者预览、原子重命名、显式运行刷新、完善的变量面板和结构化 Blueprint 赋值来源。

## Requirements

- R1：静态/host 文档变量可选描述必须严格校验、序列化并进入 JSON Schema golden；旧文档零迁移。
- R2：host 变量目录响应严格、分页最多 50 项、取消与 generation guard 抗迟到；目录 capability
  必须与目录端口及变量解析端口配对。
- R3：解析请求必须区分 `runtime` 与 `authoring-preview`；预览经过容量校验与摘要裁剪，失败不泄露。
- R4：Core `rename-variable` 必须原子更新全部文档引用，一条历史整体 undo/redo，失败零部分修改。
- R5：Viewer/Designer `refreshVariables` 必须按 ID 去重、同步别名、差量渲染、批次原子回退并合并并发。
- R6：变量面板必须提供搜索、类型筛选、描述、复制、引用数、静态/host 重命名与删除；host 新建
  只允许目录选择，`variableId` 只读。
- R7：数据源测试使用作者预览解析变量，失败时不发资源请求；Blueprint `set-variable` 提供 literal、
  完整事件/声明字段和其他变量来源。
- R8：不新增包或生产依赖；URL、查询、权限、过滤、轮询和订阅继续归宿主。

## 验收

Contracts、Core、Engine 和 Renderer 聚焦测试覆盖严格解析、深层引用、目录取消、预览授权、数据源
测试、刷新原子性与 Blueprint 来源；Browser harness 覆盖目录创建、预览、重命名历史、宿主刷新、
事件字段联动和失败无泄露；最终门禁记录见同目录 checklist。
