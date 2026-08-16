# Text Material Typography Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 全绿）

- [x] Task 1：冻结 ADR-0047 与 Spec 四件套；登记 Spec 索引（docs/specs/README.md「生效中」）、
      ADR 索引（docs/decisions/README.md）与基线 README 能力行。
- [x] Task 2：`packages/material/src/text.ts` Manifest 契约：`styleSchema` 新增可选
      `verticalAlign`（enum top/middle/bottom）、`letterSpacing`（number 0..100）、
      `lineSpacing`（number 0..512）；`required` 不变；`defaultStyle` 同步携带三新字段
      （top/0/0）；`stylePanel` 顺序 颜色→字号→字重→水平对齐→垂直对齐→字间距→行间距，
      「对齐」标签改「水平对齐」（R1）。
- [x] Task 3：`BaseScreenTextMaterialElement.renderMaterial()` 渲染：垂直对齐经内层 flex
      wrapper 实现——元素保持 `display: block`（renderer 可见性契约），`middle`/`bottom` 时
      懒创建 wrapper（`width/height: 100%`、`align-items: center/flex-end`，首次创建先
      `replaceChildren()` 清理直接文本节点），`top`/缺失时移除 wrapper 恢复直接文本；
      letterSpacing → px；lineSpacing → `line-height = fontSize + lineSpacing` px（任一缺失
      不设置）；缺失字段不设样式；textAlign/overflow/white-space/数据状态文本逻辑不变（R2）。
- [x] Task 4：material 聚焦测试（`packages/material/tests/text.test.ts`）：Manifest 校验
      （parse/createMaterialDefinition 通过、defaultStyle 满足 schema、panel 字段顺序与
      label、新字段可选不进 required）；渲染映射矩阵（verticalAlign 三态+缺失与
      top↔middle↔bottom 切换无残留文本、letterSpacing 设值/缺失、lineSpacing 与 fontSize
      组合/缺失、水平对齐不变、数据状态文本回归）（R1/R2）。
- [x] Task 5：兼容性回归：既有 material 测试（index/conformance/native-events）与示例工程
      风格对象零改动通过；无 contracts/catalog/Engine/renderer 改动（R3）。
- [x] Task 6：质量门禁：material lint/typecheck/test 通过；`pnpm verify:m0` 全量通过；
      测试矩阵与实现一致（R4）。
- [x] Task 7：真实浏览器验证（playground dev server）：面板驱动事务提交
      `verticalAlign: middle/bottom/top` 后重渲染正确——middle 单行（10/10px 对称间隙）与
      多行文本以整块居中、bottom 贴底、top 移除 wrapper 恢复直接文本、无残留文本节点；
      字间距/行间距在元素上生效并继承进 wrapper（R2 视觉验收）。

## 完成状态

- Task 1 完成于文档冻结后（ADR-0047 已接受、Spec 已登记）。
- Task 2/3/4 完成于实现与聚焦测试通过后（含 wrapper 机制修正与切换回归）。
- Task 5 完成于回归通过后（material 35 测试全绿）。
- Task 6 完成于 `pnpm verify:m0` 通过后（2026-08-16 全绿）。
- Task 7 完成于 playground 浏览器验证后（2026-08-16）。
