# Material Library Visibility 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 契约

- [x] Manifest 可选声明 `libraryVisible: boolean`，缺失默认可见。
- [x] 存在且非布尔时 manifest 解析失败并返回 `PLUGIN_CORE_MANIFEST_FIELD_INVALID`。
- [x] 字段不进入必填集，现有 manifest 无需修改仍可解析。
- [x] 可见性不进入 canonical document、history 或导出。

## 物料库

- [x] 物料卡片与面板计数只包含 `libraryVisible !== false` 的物料。
- [x] 被过滤物料仍注册、可渲染、可编辑，并可作为编组壳与层板 reparent 目标。
- [x] catalog 查询与渲染链路不感知可见性；Engine 不按 Material type 特判。

## 容器

- [x] 官方容器 manifest 声明 `libraryVisible: false`，物料库不再展示容器卡片。
- [x] 编组命令仍按 `groupMaterialType` 创建容器壳。

## 质量

- [x] R1–R3 有当前 unit/DOM/browser 测试映射和反向标注。
- [x] 受影响包 format、lint、typecheck、test、build 与 `pnpm verify:m0` 通过。
