# ADR-0050：统一三段式颜色调色板控件

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)、[ADR-0028](./ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)、[ADR-0048](./ADR-0048-canvas-background-palette.md)
> 参考行为：[Light Chaser ColorMode](https://github.com/xiaopujun/light-chaser) 的模式切换与按模式保留编辑值、[react-best-gradient-color-picker](https://github.com/hxf31891/react-gradient-color-picker) 的 solid/gradient 状态分层与色标增删；只参考行为模型，不复制实现代码。
> 部分取代：[ADR-0051](./ADR-0051-unified-color-palette-replaces-color-input.md) 取消本 ADR 决策 2 的字段级门控，三段式控件全面替换原生 color input。

## 1. 背景

Designer 属性面板中 `control: 'color'` 的字段目前都只是原生 `<input type="color">` 单色控件。画布背景已经支持单色、线性渐变、径向渐变三种模式（ADR-0048），但物料的颜色字段没有同等能力。社区主流选择器（Light Chaser、react-best-gradient-color-picker 等）都支持「单色 / 渐变」模式切换、渐变类型（线性/径向）分层，以及可增删的多个色标。

## 2. 决策

1. 新增 Engine 内部共享控件 `designer-color-palette-dom.ts`，替换普通物料面板（props/stylePanel）与 Manifest Editor Descriptor 中所有 `control: 'color'` 字段的原生 color input。控件由三部分组成：
   - 顶部三段模式选择（radio group）：单色、线性渐变、径向渐变；
   - 单色模式：单个颜色 input；
   - 渐变模式：渐变预览条、2..8 个可编辑色标行（颜色 + 0..100 整数位置 + 删除按钮）、添加色标按钮（插入最大间隙中点）、线性角度或径向中心 X/Y 输入。
2. 字段能力门控：只有字段键匹配 `background|fill`（大小写不敏感）的字段开放渐变模式；其余字段（文字色、边框色等）仍显示三段控件，但渐变段禁用并给出「该字段不支持渐变」提示。理由是 CSS 中只有 background 类属性接受 `linear-gradient()`/`radial-gradient()` 字符串，向 `color`/`border-color` 写入渐变会产生无效样式。
3. 值表示保持 Material 契约：字段仍存储字符串。单色存色值；渐变存规范化 CSS 字符串 `linear-gradient(<angle>deg, <color> <position>%, ...)` 或 `radial-gradient(circle at <x>% <y>%, ...)`。色标颜色仅接受 `#RGB/#RRGGBB/#RRGGBBAA` 或 `transparent`；位置为严格递增整数，2..8 个。
4. 草稿保留：控件按字段（组件 id + prop/style/descriptor id）在模块级缓存三种模式各自的草稿；面板重渲染时若文档值仍等于缓存当前模式的序列化结果则复用缓存，否则（撤销/重做/替换文档）从文档重新解析。切换模式不丢失其他模式的配置。
5. 每次编辑经既有 change 通道提交：单色/渐变参数/色标改动直接产生新值经 `update-components`/descriptor 事务提交并失败关闭；添加/删除色标由控件内部变更 DOM 后派发 change 事件，走同一提交通道。非法值（乱序色标、越界位置、非法颜色）拒绝提交并走既有 invalid draft 通道。
6. 画布背景不迁移：`ScreenCanvas.background` 保持 ADR-0048 的结构化契约与专用渲染路径，不使用本控件的 CSS 字符串表示。

## 3. 非目标

- 拖拽式色标条、取色器、色板预设、透明度滑杆、HSV/HSL 面板等进阶能力（可后续增量，不影响本次交互模型）。
- 改变 Material Manifest / Editor Descriptor 的 `color` 控件契约或 ScreenDocument 契约。
- 为 `color`/`border-color` 等不支持 `<image>` 的 CSS 属性写入渐变。
- 新增依赖或 package。

## 4. 结果

- 所有 `color` 字段共享同一个三段式调色板；背景类字段可完整编辑线性/径向渐变与多色标，其余字段保持单色但控件形态统一。
- 值仍是普通字符串，旧文档、宿主与物料渲染器零改造；失败关闭与无抖动约束保持。
