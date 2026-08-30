# Text Material Typography Test Matrix

> 状态：已完成（2026-08-16，`pnpm verify:m0` 全绿）

| Req | Case | 位置 | 状态 |
| --- | --- | --- | --- |
| R1 | Manifest 经 `parseBaseScreenMaterialManifest` 与 `createMaterialDefinition` 校验通过 | `packages/material/tests/text.test.ts` | ✅ |
| R1 | `styleSchema` 含可选 `verticalAlign`/`letterSpacing`/`lineSpacing`，`required` 不含新字段；`defaultStyle` 满足 schema（含三新字段） | 同上 | ✅ |
| R1 | `stylePanel` 顺序与标签：颜色/字号/字重/水平对齐/垂直对齐/字间距/行间距；「对齐」→「水平对齐」 | 同上 | ✅ |
| R2 | verticalAlign 缺失或 `top` → 直接文本、元素 `display: block`（无 wrapper）；`middle`/`bottom` → 元素保持 block + 内层 flex wrapper（`align-items: center`/`flex-end`，`width/height: 100%`） | `packages/material/tests/text.test.ts` | ✅ |
| R2 | top↔middle↔bottom 切换：wrapper 创建/移除正确、直接文本节点无残留 | 同上 | ✅ |
| R2 | `letterSpacing: 8` → `letter-spacing: 8px`；缺失/非 number 不设置 | 同上 | ✅ |
| R2 | `lineSpacing: 16` + `fontSize: 32` → `line-height: 48px`；仅 lineSpacing 或仅 fontSize 缺失 → 不设置 `line-height` | 同上 | ✅ |
| R2 | `textAlign` 水平映射与数据状态文本（就绪值/加载中/数据不可用，含 wrapper 路径）回归不变 | 同上 | ✅ |
| R2 | 真实浏览器（playground）：面板事务提交 middle/bottom/top 后重渲染正确——middle 单行（间隙 10/10px 对称）与多行整块居中、bottom 贴底、top 移除 wrapper；字间距/行间距生效 | playground dev server 手工验证 | ✅ |
| R3 | 旧文档风格对象（无三新字段）渲染与改动前一致（缺失字段回退断言） | 同上 | ✅ |
| R3 | 既有 material 测试（index/conformance/native-events）零改动回归（34 测试全绿） | `packages/material/tests/*.test.ts` | ✅ |
| R4 | material lint/typecheck/test 通过 | `pnpm --filter @base-screen/material lint` 等 | ✅ |
| R4 | `pnpm verify:m0` 全量通过 | 仓库根 | ✅ |
| 文档 | ADR-0047 已接受并登记 ADR 索引；Spec 登记 specs/README「生效中」；基线 README 能力行已更新 | docs | ✅ |
