# Material Library Visibility 规格

> 状态：生效中
> 最近更新：2026-08-07
> 定位：物料库可见性契约与 Designer 物料库过滤
> 依据：[ADR-0021](../../../decisions/ADR-0021-material-library-visibility.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 1. 目标

容器物料作为编组载体，用户无法直接从物料库把内容放入容器；物料库中的容器卡片只能创建无法
填充的空壳，与编组流程重复且造成困惑。本 Spec 让 Manifest 声明物料库可见性，Designer 物料库
据此过滤，同时保持物料注册、渲染、编辑与编组能力不变。

## 2. 不变边界

- Canonical document 形状不变：可见性只存在于 Manifest 契约，不进入 document、history 或导出。
- Engine 不按 Material type 特判：可见性判断只消费 Manifest 声明。
- 隐藏不改变 catalog、plugin manager、renderer、viewer、层板、检查器或 Group 命令的语义。
- 缺失字段即默认可见；已有 manifest 无需修改即可解析。

## 3. Requirements

### R1：Manifest 可见性契约

`BaseScreenMaterialManifest` SHALL 声明可选 `libraryVisible: boolean`。缺失时默认可见（`true`）。
字段存在时必须为布尔值，否则 manifest 解析失败并返回 `PLUGIN_CORE_MANIFEST_FIELD_INVALID`；
字段不得变为必填。

### R2：Designer 物料库过滤

Designer 物料库（卡片渲染、面板计数、搜索/筛选、点击添加、拖拽到画布）SHALL 只提供
`libraryVisible !== false` 的物料。被过滤物料 SHALL 保持注册、可渲染、可编辑，并可作为编组壳
（Group 命令）与层板 reparent 目标；catalog 查询与渲染链路不得感知可见性。

### R3：官方容器物料

官方容器 manifest SHALL 声明 `libraryVisible: false`。容器不再出现在物料库中；编组命令仍按
`groupMaterialType` 自动创建容器壳。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的全部适用项均已完成。
- R1–R3 与当前自动化证据双向映射。
- 受影响包质量门、browser、API、boundary、tarball 和 `pnpm verify:m0` 均通过。
