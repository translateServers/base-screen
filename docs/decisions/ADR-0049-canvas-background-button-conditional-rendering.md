# ADR-0049：画布背景图宿主按钮条件渲染与对齐

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0046](./ADR-0046-canvas-background-image-host-button.md)（本 ADR 部分取代其决策 1 的「按钮始终渲染」）、
> [ADR-0043](./ADR-0043-canvas-background-image.md)、[ADR-0045](./ADR-0045-canvas-background-panel-editing.md)

## 1. 背景

ADR-0046 让属性面板背景图片输入框旁始终渲染「选择图片」按钮。实际反馈两点：一是未接入宿主也会
看到该按钮（点击仅派发事件），按钮应默认隐藏、只在宿主声明需要时出现；二是按钮与输入框存在
垂直错位——`.designer-field` 自带 `margin-bottom` 使行容器高于输入框，`align-items: center` 让
按钮相对更高的容器居中，视觉上低于输入框。

## 2. 决策

1. `BaseScreenDesignerConfiguration` 新增可选 `canvasBackgroundImageButton?: boolean`（RB3
   validate before mutate：存在时必须为布尔，非法值使配置失败且零副作用）；默认 `false`。
   属性面板「画布」区背景图片输入框旁的宿主选择按钮**默认不渲染**，仅当配置为 `true` 时渲染；
   `BaseScreenDesignerElement` 暴露同名只读 getter。
2. 按钮点击行为不变（派发 `base-screen-canvas-background-image-request`，ADR-0046 决策 2/3 的
   request/commit 通道原样保留）。未配置的宿主连按钮都不可见，零影响。
3. 对齐修正（纯样式）：背景图片行容器（`.designer-canvas-background-row`）承接字段间距
   （`margin-bottom` 移到行上），行内 `.designer-field` 的 `margin-bottom` 归零，按钮与输入框在
   同一行高内垂直居中，避免错位；不改变几何与主题 Token，无抖动。
4. 部分取代 ADR-0046 决策 1 的「按钮始终渲染」结论；ADR-0046 其余决策与非目标不变。

## 3. 非目标

- 改变按钮点击行为、请求/提交通道或事件 detail。
- 改变 `backgroundImage`/`backgroundImageFit` 契约与校验。
- 宿主弹出框、资产目录或上传能力（ADR-0027 边界不变）。

## 4. 结果

- 按钮默认隐藏，宿主配置 `canvasBackgroundImageButton: true` 后可见；按钮与输入框垂直对齐。
- 公共边界变更 additive（一个可选配置字段 + 条件渲染），由专项 Spec 增量与聚焦测试验收。
