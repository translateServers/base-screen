---
'@base-screen/host-kit': minor
'base-screen': minor
---

`host-kit` 意图层补齐多轮迭代与几处显示问题（ADR-0113 S6、S7）：

- `pickSession(candidates, baseline)`：在宿主留着的几份会话里挑出与活文档对得上的那份（提案被采纳 / 被拒绝都能对上；整屏换了别的内容或画布改了尺寸则返回 undefined）。
- `describeSession(session)`：把会话压成发给后端的摘要（标题、区域路径、每个指标 / 块的稳定标识与当前文字），供模型输出对 IR 的操作列表。
- `editIntent`：换物料（`swap`）时 `update-components` 改不了 `type`，改为先移除再以同一 id 新增，层级沿用活文档里的；用户改过的组件不换。比较组件时键顺序与缺省字段不算差异。`change` 写了该项没有的字段时整批拒绝（`INTENT_OP_INVALID`），不再静默忽略。
- 指标格式化：单位自带数量级（「万元」「亿元」「K」「M」）时不再折算（修复「28.6 万万元」）；四舍五入为零的增减量不带符号、用中性色；英文屏（标题副标题无中日韩字符）用 K / M / B 与 `pp`，页脚文案也跟随语言。新增 `detectIntentLanguage`。
- 编译期告警的说明文字统一为英文开发者文案（用户可读文案由宿主按码映射），数据集不在引用里时的说明与实际行为（该块被跳过）一致。
