# Color Palette Gradient From Solid Checklist

> 状态：已完成（2026-08-16，`pnpm verify:fast`、`pnpm verify:browser` 与
> `pnpm verify:tarball` 全绿）

## 行为（R1-R3）

- [x] 单色 → 线性/径向渐变切换：默认色标按单色派生（起点=单色、终点=同色系提亮，
      纯白加深回退）；transparent/不可解析不派生。
- [x] 已定制（非默认）渐变色标在模式往返中原样保留；线性 ↔ 径向互切保留色标与几何。
- [x] 文档值本身为渐变的解析路径不受影响；派生值走既有序列化与提交通道，
      一条历史可 undo。

## 质量（R4）

- [x] 聚焦单测覆盖派生算法（常规/纯黑/纯白/短 hex/带 alpha/transparent）、切换派生
      （线性与径向、DOM 值同步）、自定义保留、互切保留、解析路径。
- [x] 真实 browser harness 断言单色 → 线性渐变首帧色标起点为所选色值。
- [x] `pnpm verify:m0` 通过，ADR/Spec 索引与能力基线已同步。