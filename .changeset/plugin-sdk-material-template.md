---
'@base-screen/plugin-sdk': minor
'base-screen': minor
---

物料规格新增 L2 受限图元模板 `template`（ADR-0116）：只有数据、没有渲染代码的物料。

- `material-template-expression`：自研非图灵完备绑定表达式（白名单引用、闭集函数、深度 / 节点 / 步数上限，不用 eval）；
- `material-template`：模板解析与编译（14 种节点、渐变、`repeat` / `when` / `clip`、事件绑定、循环与读数过渡动画），颜色与字号写法受限，文字必须声明底板；
- `material-template-render`：解释器只用 `createElementNS` 构造白名单元素，id 按实例加命名空间，设计态与 reduced-motion 下静止；
- `material-template-audit`：TPL7–TPL10（字号下限、对比度、示例渲染、越界），接入 `auditBaseScreenMaterialSpec`，解析期错误按 TPL1–TPL6 归类；
- 规格新增 `events`、`statePresetKeys`；`createBaseScreenSpecMaterialDefinition` 在规格带模板时不需要（也不接受）渲染函数；
- 新增依赖边 `plugin-sdk → core`。
