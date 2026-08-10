# ADR-0017：完整 Designer 产品的宿主边界

> 状态：已接受
> 日期：2026-08-05
> 扩展：[ADR-0012](./ADR-0012-designer-project-lifecycle.md)
> 历史适用：[已归档 Designer Full Product](../specs/archive/designer-full-product/spec.md)
> 部分取代：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)（完整产品建设范围被取代；端口安全与竞态规则保留）

## 决策

Base Screen 提供 framework-neutral Contracts、Core controller、私有 Engine UI、测试 harness 和 capability-gated
adapter 契约，以支持项目目录、搜索、筛选、创建、克隆、删除、导入、导出、草稿/已发布预览、保存、发布、
冲突、重试、快照和恢复。

宿主负责认证、路由、数据库、真实文件和资产存储、公开 URL、部署和业务权限。Base Screen 不提供应用路由、
账号、后端实现或任何 Nebula 业务模型。所有 adapter 操作必须支持取消、generation/revision 保护、明确 capability
和 fail-closed 诊断；原始错误、payload、凭证和内部 URL 不得显示在 Engine。

项目预览从“loaded project 一律拒绝”改为由宿主 preview capability 决定。direct document preview 保持本地能力，
不会伪装为已发布项目。

## 后果

- 宿主可实现完整产品体验而不改变 Base Screen 的固定包集合。
- Engine 在 capability 缺失时只隐藏或禁用对应工作流，基础 authoring 继续可用。
- 项目目录与公开预览没有默认存储实现；测试使用内存 adapter。
- ADR-0012 的保存、发布、取消、冲突与 opaque revision 规则继续有效。

## 排除方案

- 将路由、认证、数据库或业务 DTO 写入 Engine：拒绝，破坏宿主解耦。
- document 携带公开预览 URL 或部署配置：拒绝，URL 和部署是宿主敏感业务状态。
- 为完整产品新增 package：拒绝，沿用现有 Contracts/Core/Engine/SDK 边界。
