# Document Blueprint Host Bridge Spec

> 归档：2026-08-30（已取代；后继为 Designer Blueprint Workbench）
> 状态：已取代（detached Blueprint 路径由 [Designer Blueprint Workbench](../designer-blueprint-workbench/spec.md) 取代；本文件仅作历史行为依据）
> 日期：2026-08-25
> 依据：ADR-0061

## 1. 目标

将 Blueprint 作者桥从“当前组件入口”提升为当前 `ScreenDocument` 的整屏宿主桥。Base Screen 只提供
detached 上下文、请求/取消/提交协议、失败关闭校验和单事务历史；流程画布、规则编辑器、节点检查器、
搜索、布局与试运行 UI 全部归宿主。

## 2. Requirements

### R1：整屏 detached 作者上下文

Contracts SHALL 定义严格、JSON-safe 的 `ScreenBlueprintAuthoringContext`，包含完整 canonical 文档快照、
可选 `initialComponentId`、在用物料的事件描述投影、Blueprint capability 状态和容量限制。快照 SHALL
与 Designer 当前文档深度分离；初始组件只用于宿主定位，不限制可见或可编辑规则。

### R2：文档级请求与提交契约

Blueprint 分支的 `ScreenAuthoringRequest` SHALL 携带全局 `context`；`requestBlueprintEdit(options?)`
无参数时 SHALL 在无组件选择的情况下发起整屏请求。`ScreenBlueprintCommitRequest` SHALL 只携带
requestId、expected revision 与完整 Blueprint，不再使用组件身份定义提交范围。组件文本作者协议保持不变。

### R3：事件与 capability 投影

Engine SHALL 按当前文档实际使用的物料类型投影 Manifest 事件名称、显示信息、payload schema、容量、
required capability 与可用状态；capability 查询异常 SHALL 失败关闭。投影只承载宿主构建编辑器所需的
JSON-safe 事实，不暴露 catalog、controller、DOM、function 或服务对象。

### R4：会话守卫与 canonical 提交

pending Blueprint 会话 SHALL 绑定 Designer 实例、打开时的 canonical 文档身份和外部 revision。取消、
卸载、重载、跨实例、revision 变化或打开后的任何文档修改 SHALL 拒绝陈旧提交且零副作用。合法候选 SHALL
经完整 parse/compile/capability 校验，并以一次 `replace-blueprint` 命令形成一条历史。

### R5：轻量内建外壳

顶栏 SHALL 只提供整屏宿主请求入口，且不依赖组件选择。右侧组件交互页 SHALL 只读展示当前组件的事件、
关联规则、变量与宿主事件，并可向同一宿主入口提供初始定位。Engine SHALL NOT 提供规则增删、排序、连线、
节点表单、图布局、搜索、试运行或其它编排 UI。

### R6：依赖与质量边界

实现 SHALL 删除未使用的 Engine 图投影和 Blueprint UI 编辑辅助逻辑，不新增生产依赖、图形库、编辑器框架、
package 或通用 UI 注入接口。Contracts、Engine、DOM、browser harness、API 与边界测试以及
`pnpm verify:m0` SHALL 通过。

## 3. 非目标

- Base Screen 内实现宿主交互编排产品、图形布局、规则编辑、代码编辑或编辑器 session。
- 跨项目、跨文档或跨 Designer 实例编排。
- 修改 canonical `ScreenDocument`、Blueprint 形状或引入数据迁移。
- 把宿主依赖、凭证、服务对象或图 UI 状态带入公共上下文。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的所有适用项完成，测试矩阵与实现一致。
- 聚焦测试、API/边界检查、browser harness 与 `pnpm verify:m0` 通过。
- ADR、Spec 索引、能力基线、DataV UI/UX 计划和使用文档反映当前宿主边界。
