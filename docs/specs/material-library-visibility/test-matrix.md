# Material Library Visibility 测试矩阵

> 状态：已完成
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 Manifest 可见性契约 | 1、4 | `plugin-core.test.ts` 的缺失字段默认可见、布尔合法与 `PLUGIN_CORE_MANIFEST_FIELD_INVALID` 拒绝 case |
| R2 物料库过滤 | 2、4 | `designer-workspace.test.ts` 的 `visibleLibraryMaterials` helper case（可见/缺失/显式 false）；`verify-browser-harness.mjs` 断言容器卡片 `data-material-type="base.container"` 不存在且其余卡片可点击添加 |
| R3 官方容器 | 3、4 | `packages/material/tests/index.test.ts` 断言容器 manifest `libraryVisible === false`；`verify-browser-harness.mjs` 以框选 + Ctrl+G 编组流程创建容器并校验 data-state/borderStyle，且后续组件计数不回归 |

新增 case 必须在名称或相邻注释中标记 R1–R3。任何 case rename、move 或 delete 必须同步本矩阵。
