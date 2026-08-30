# Color Palette Gradient From Solid Tasks

> 状态：已完成（2026-08-16，`pnpm verify:fast`、`pnpm verify:browser` 与
> `pnpm verify:tarball` 全绿）

- [x] Task 1：冻结 ADR-0057 与 Spec 四件套，登记 ADR/Spec 索引与能力基线（R1-R4）。
- [x] Task 2：实现单色 → 渐变切换色系派生与自定义保留（`switchColorPaletteMode` /
      `deriveColorPaletteStopsFromSolid`，R1、R2、R3）。
- [x] Task 3：聚焦单元测试：派生算法矩阵、切换派生、自定义保留、渐变互切、解析路径
      （R4）。
- [x] Task 4：真实 browser harness 断言（单色 → 线性渐变首帧同色系）（R4）。
- [x] Task 5：运行格式化、聚焦检查与 `pnpm verify:m0`，同步基线与验收证据（R4）。