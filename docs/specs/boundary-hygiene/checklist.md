# Boundary Hygiene 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 子层方向

- [x] `browser/dom` 不再从 `browser/controllers` 导入任何符号。
- [x] `DesignerBlueprintGraphProjection` 由 lower-layer（`common/operations`）向 `dom` 与 `controllers` 提供。
- [x] `browser/dom` 对 browser 其他子层的依赖仅指向 `ui`。

## 自动化门禁

- [x] `check-engine-import` 新增子层方向 Gate，覆盖 browser 与 common 的允许方向。
- [x] 门禁能在回归样例中正向拦截 `dom→controllers` 违规。
- [x] 门禁随 `pnpm verify:m0` 执行，未引入额外已声明的跨子层依赖。

## UI 文案

- [x] `browser/dom` 与 `browser/controllers` 不再内联用户可见文案，全部经 `DESIGNER_UI_TEXT`。
- [x] `check-designer-ui.mjs` 覆盖整个 `browser/` 树。
- [x] 内部诊断 message 未回流为 UI 展示文案。

## 质量

- [x] R1–R3 有门禁脚本与测试证据覆盖，`test-matrix.md` 反映当前 case。
- [x] Engine format、lint、typecheck、test、build 与 `pnpm verify:m0` 通过。