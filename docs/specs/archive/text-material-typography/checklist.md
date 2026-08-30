# Text Material Typography Checklist

> 状态：已完成（2026-08-16，`pnpm verify:m0` 全绿）

## Manifest 契约（R1）

- [x] `styleSchema` 含可选 `verticalAlign`（enum `top`/`middle`/`bottom`）、`letterSpacing`
      （number 0..100）、`lineSpacing`（number 0..512）；`required` 仍为
      `['color', 'fontSize', 'fontWeight', 'textAlign']`。
- [x] `defaultStyle` = `{ color, fontSize, fontWeight, textAlign: 'left', verticalAlign: 'top',
      letterSpacing: 0, lineSpacing: 0 }`，经 `parseBaseScreenMaterialManifest` 与
      `createMaterialDefinition` 校验通过。
- [x] `stylePanel` 顺序：颜色 → 字号 → 字重 → 水平对齐（select）→ 垂直对齐（select）→
      字间距（number）→ 行间距（number）；「对齐」标签已改「水平对齐」。

## 渲染（R2）

- [x] `verticalAlign` 缺失或 `'top'` → 直接文本节点、元素 `display: block`；`'middle'`/`'bottom'`
      → 元素保持 `display: block`，内层 flex wrapper（`width/height: 100%`、
      `align-items: center`/`flex-end`）承载垂直对齐。
- [x] wrapper 懒创建并复用：首次创建先 `replaceChildren()` 清理直接文本节点；回到 `top` 移除
      wrapper 恢复直接文本；top↔middle↔bottom 切换无残留文本节点（浏览器实测）。
- [x] `letterSpacing` 为 number → `letter-spacing: <n>px`；缺失/非 number 不设置。
- [x] `lineSpacing` 为 number 且 `fontSize` 为 number → `line-height: <fontSize + lineSpacing>px`；
      任一缺失不设置 `line-height`。
- [x] `textAlign`/color/fontSize/fontWeight/overflow/white-space/数据状态文本逻辑不变
      （继承属性在元素上设置，作用于 wrapper 内文本）。
- [x] 真实浏览器（playground）验收：面板事务驱动 middle 单行/多行垂直居中（间隙对称）、
      bottom 贴底、top 回退直接文本；renderer 重渲染路径（元素 display 强制 block）下
      wrapper 不受影响。

## 兼容性与面板（R3）

- [x] 旧文档（无三新字段）渲染与改动前一致；示例工程风格对象零改动仍合法。
- [x] 新拖入文本自动携带 `verticalAlign: 'top'`/`letterSpacing: 0`/`lineSpacing: 0`；
      面板样式区经既有 select/number 控件渲染五个风格字段，Engine 零改动。
- [x] ScreenDocument/contracts/catalog 与其他物料契约零变化；无新增依赖/package/公共 API。

## 质量门禁（R4）

- [x] material 聚焦测试（manifest 校验 + 渲染映射矩阵 + 缺失字段回退 + 数据状态文本回归）
      与既有 material 测试（index/conformance/native-events）全部通过（34 测试全绿）。
- [x] material lint/typecheck/test 通过。
- [x] `pnpm verify:m0` 全量通过。
- [x] 基线 README、docs/specs/README.md 与 docs/decisions/README.md 已登记；测试矩阵与
      实现一致。
