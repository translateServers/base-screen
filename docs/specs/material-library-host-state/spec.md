# Material Library Host State Spec

> 状态：生效中
> 日期：2026-08-12
> 依据：[ADR-0031](../../decisions/ADR-0031-material-library-host-state.md)

## 1. 目标

让 Designer 左侧物料库在不拥有网络加载和物料平台职责的前提下，展示宿主提供的目录状态、分类、草稿与不可用
物料，并通过稳定事件请求宿主处理重试、重新加载和问题详情。

## 2. Requirements

### R1：严格状态投影

Engine SHALL 导出严格、JSON-safe 的 `BaseScreenMaterialLibraryState` 及解析函数，支持
`loading | ready | offline | partial | error | update-available`。未知字段、非法失败数量、重复/越界/非法 type SHALL
fail closed。状态不得携带 URL、凭证、版本或任意错误对象。

### R2：左侧面板状态

显式配置状态时，物料库 SHALL 显示稳定的状态名称、说明、失败数量以及适用的重试、重新加载或查看问题动作；
未配置时保持原有精简 UI。加载、离线、部分失败与更新状态不得改变面板几何或自动联网。

### R3：分类与物料标记

面板 SHALL 复用 Manifest `category` 进行稳定排序的分类筛选，搜索 SHALL 同时匹配名称、type 与分类。草稿与
不可用标记只来自状态投影；不可用物料可见但禁止创建。筛选无结果时 SHALL 提供明确空态。

### R4：宿主动作与不可变目录

面板动作 SHALL 通过 composed Custom Event 发出 `retry | reload | details`，且不直接执行联网或 catalog 变更。
初始化后的 catalog 继续不可原地替换；状态 setter 只能重绘展示状态。

### R5：兼容性与质量

ScreenDocument、Material Manifest/ABI、Renderer 和既有宿主配置保持兼容。新增类型由 Engine 与 SDK 公共入口导出，
并通过 DOM、Element、browser、API、boundary、build 与 tarball 验收。

## 3. 非目标

- 物料市场、远程分页、下载、认证、审核、版本与部署 UI。
- 修改 Manifest 记录线上来源、草稿或加载状态。
- Base Screen 内部网络客户端或可变 catalog。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部完成，测试矩阵与当前实现一致。
- 聚焦测试、真实 browser harness 和 `pnpm verify:m0` 通过。
