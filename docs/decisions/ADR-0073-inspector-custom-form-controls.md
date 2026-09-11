# ADR-0073: 属性面板的插件自定义表单控件

> 状态：已接受
> 日期：2026-09-10
> 关联：[ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md)、[ADR-0029](./ADR-0029-host-managed-material-package-distribution.md)、[ADR-0071](./ADR-0071-plugin-design-context-read-access.md)、[ADR-0072](./ADR-0072-plugin-panel-contribution-minimal-loop.md)
> 范围：editorDescriptor 的 `control: 'custom'` 与 `kind: 'inspectorControl'` 贡献；不开放订阅、不放宽可绑定 target

## 背景

ADR-0072 给了插件左栏面板，但物料属性面板仍是闭合的：`EDITOR_CONTROLS` 只有 12 个内建控件，且在 plugin-core 两处校验与 engine 渲染侧各自硬编码，没有控件注册表，作者无法表达渐变停止点、坐标预设这类内建控件覆盖不了的输入。

此前的边界表述是"属性面板使用声明式 Editor Descriptor 和 **Base Screen 内建控件**"。本决策把"内建"放宽为"内建或宿主授权的贡献控件"，但保持"声明式、JSON-safe、不注入代码形式的 UI"这一核心约束不变。

## 决策

1. 控件联合新增 `custom`，字段新增 `tagName`；`tagName` 仅在该控件下合法，且必须是合法 custom element 名。其余控件带 `tagName` 一律失败关闭。
2. **授权与实例化解耦，且授权依据是贡献而非注册。** 新增 `kind: 'inspectorControl'`（`id`/`name`/`tagName`），由 plugin-manager 在 preflight 从宿主 registry 解析构造函数并产出 `snapshot.inspectorControls`。Engine 只能 `new entry.constructor()`，**绝不 `createElement(tagName)`**；物料清单写了未被任何插件贡献的标签时，该字段渲染为可见的"控件未由宿主注册"提示且不进入写回路径。宿主注册过某标签不构成授权。
3. 解析不到即激活失败关闭（与 material/panel 同一规则），避免静默少渲染一个控件。
4. 控件契约与内建控件同形：宿主写 `model`（JSON-safe：`value` / `componentId` / `componentType` / `target` / `path`），用户在控件内改值后派发 `change`，宿主读 `element.value`。因此**不新增写回通道**，撤销、dirty、批量编辑与校验提示语义自动继承。
5. 读回的值必须经 `parseScreenJsonValue` 校验；非 JSON-safe 的返回（DOM 节点、函数、类实例）视为未编辑，不进入文档。
6. 只允许 `target: 'props' | 'style'`。不放开 `data`（绑定字段仍只能 `field-selector`）与 `interaction`，避免自定义控件绕开数据绑定与事件声明的既有门控。
7. 不借 custom 控件引入 render function、组件对象、DOM 节点、Promise 或宿主服务对象；也不给控件提供变更订阅。控件要反映外部编辑只能依赖宿主在重绘时重新赋 `model`。
8. 控件可绑的 schema 形状不设限（内建控件各自的形状约束保留），值语义由控件自身负责，因为校验期没有 registry 可用。

## 后果

- 属性面板第一次可以被第三方扩展，且新增控件不需改 Base Screen 代码；同时授权边界比左栏面板更严格，因为它落在文档写入路径上。
- 一条校验盲区必须记录：`validateControlForSchema` 对无法解析的 path 提前返回，因此 `custom` 绑到不存在的 props 路径不会在校验期报错。这是既有行为（所有控件相同），本决策未收紧。
- 未授权标签在渲染期降级，而非在解析期报错：这是不可避免的，因为 editorDescriptor 由物料包声明、而控件由另一方的插件贡献，两者在包级别没有相互可见性。
- 验证：`packages/plugin-core/tests/editor/editor-descriptor.test.ts` 覆盖 tagName 合法性、跨控件误用与 target 限制；`packages/plugin-core/tests/plugin-core.test.ts` 覆盖 `inspectorControl` 贡献校验；`packages/plugin-manager/tests/manager.test.ts` 覆盖授权目录解析、未注册与标签争用三类失败；`scripts/browser-harness/assert-plugin-command-loop.mjs` 端到端断言授权控件渲染并读到当前值、点击写回 props 事务、undo 同时回退文档与控件显示，并断言未授权标签**不出现**且给出降级提示。
