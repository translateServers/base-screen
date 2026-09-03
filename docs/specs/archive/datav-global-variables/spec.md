# DataV Global Variables Spec

> 归档：2026-09-03（已完成）
> 状态：已完成，历史验收记录
> 依据：[ADR-0068](../../../decisions/ADR-0068-datav-global-variables.md)

## Requirements

- R1：变量必须使用稳定 `id`，canonical 来源必须为 `static | data-source | url-query`，全部引用按 ID。
- R2：作者表单必须覆盖 DataV 的名称、描述、来源、初始值、过滤器、响应、受控和自动更新字段。
- R3：变量必须支持重命名、复制、删除保护、使用次数、加入 Blueprint 及键盘提交/取消。
- R4：变量必须成为 Blueprint 一等节点，支持变量事件、导入变量、请求组件数据与锁定依赖边。
- R5：Viewer/Designer 必须提供 `getVariable(id)` 读写与监听，并让解析变化触发变量事件。
- R6：组件参数、组件变量数据源、Blueprint 表达式与运行时均消费稳定 ID；受控模式忽略初始值。
- R7：请求、URL、过滤执行和轮询调度必须留在宿主；Engine 只保存 JSON-safe 配置并发出有界请求。
- R8：旧文档必须通过一次性、失败关闭的迁移脚本升级，不保留兼容解析分支。

## 完成清单

- [x] Contracts、Schema golden、引用诊断与宿主端口已更新。
- [x] Core Blueprint 编译/派发、变量事件和请求动作已更新。
- [x] Renderer、Designer 运行时变量句柄和动态刷新事件已更新。
- [x] DataV 字段表单、行内管理、使用次数与 Blueprint 变量节点已交付。
- [x] 官方物料变量数据能力和组件变量数据源已接入。
- [x] 一次性迁移脚本及失败关闭测试已交付。
- [x] Contracts/Core/Renderer/Engine 聚焦测试及浏览器验收已覆盖。

## 宿主边界

`sourceId`、`processorId` 和 `autoUpdate` 是严格配置投影。宿主负责解析 URL、执行 API/SQL、保管凭证、
运行过滤器和调度刷新；Base Screen 不发通用网络请求、不执行任意代码、不建立后台轮询。
