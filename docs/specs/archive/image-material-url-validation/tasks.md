# Image Material URL Validation Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0056 与 Spec 四件套，登记 ADR/Spec 索引与能力基线（R1-R4）。
- [x] Task 2：图片物料渲染端 URL 校验（复用 `isBoundedScreenImageUrl`）与非法占位
      （R1、R3）。
- [x] Task 3：img error 事件失败回退与渲染重建不残留（R2）。
- [x] Task 4：聚焦单元测试：合法/非法 URL 矩阵、error 回退、重建不残留（R4）。
- [x] Task 5：真实 browser harness 断言（非法 URL 占位/加载失败回退）（R4）。
- [x] Task 6：运行格式化、聚焦检查与 `pnpm verify:m0`，同步基线与验收证据（R4）。
