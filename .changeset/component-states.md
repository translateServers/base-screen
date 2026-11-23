---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/renderer': minor
'@base-screen/plugin-core': minor
'@base-screen/engine': minor
'base-screen': minor
---

组件状态（ADR-0110，取代 ADR-0058 条件样式与 ADR-0059 宿主条件样式；`styleRules` 直接删除，不写迁移，带
`styleRules` 的文档按未知字段失败关闭）。

- contracts：根组件新增 `states { items, judge? }`：每个状态是一组外观覆盖，「默认」是组件本身。判定取值可选组件数据、
  变量或数据源；数据源可按行查找（`where: { field, equals }`，匹配值可引用变量）。条件按顺序判定，第一条命中即生效。
  新增纯求值 `resolveScreenComponentState()`、`mergeScreenComponentStateStyle()`、`listScreenComponentStateDependencies()`。
  主题新增四个状态色位 `danger / warning / info / success`（色板里可省略，省略时取内置默认色；`readScreenThemeColor()`）。
  宿主分级表 `ScreenLevelScale`（`dataResourceType.levelScales`、`ScreenHostCatalogDescriptor.levelScales`），只在作者面使用。
  蓝图组件节点新增 `set-state`（连线必带 `stateId`）/ `reset-state` 输入与 `state-changed` 输出，动作 `component-state`、
  触发 `component-state-changed`，能力 `blueprint.action.component-state`、`blueprint.trigger.component-state-changed`。
- core：`update-components` 的 `states` 补丁（`null` 去掉），分派结果新增 `stateEffects`。
- renderer：按判定与蓝图设置切换组件状态，取值暂不可用时保持上一结果；数据源结果、变量变化只重算相关组件；
  渲染器选项 `onComponentStateChange`，查看器事件 `base-screen-component-state-change`、方法 `readComponentState()`。
  删除 `conditionalStylePort` 与 `refreshConditionalStyles()`。
- plugin-core：删除 `BaseScreenConditionalStylePort` 与 `BaseScreenHostConditionalStyle*`；物料清单新增 `statePresetKeys`。
- engine：检查器「外观状态」「判定」两段（编辑某个状态时外观改动写进该状态的覆盖，位置尺寸只读）、
  「按分级生成状态」、主题色板「状态色」；蓝图连线检查器「目标状态」。删除「条件样式」「业务条件样式」两段与
  `conditionalStylePort`、`hostConditionalStyleAuthoring`、`refreshConditionalStyles()`。
