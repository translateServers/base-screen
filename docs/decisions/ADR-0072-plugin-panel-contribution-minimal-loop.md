# ADR-0072: 插件面板贡献的最小闭环

> 状态：已接受
> 日期：2026-09-10
> 关联：[ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md)、[ADR-0029](./ADR-0029-host-managed-material-package-distribution.md)、[ADR-0070](./ADR-0070-plugin-command-chrome-projection.md)、[ADR-0071](./ADR-0071-plugin-design-context-read-access.md)
> 范围：`kind: 'panel'` 贡献、面板 model 与动作事件、Designer 左栏挂载；不引入通用 SlotMap

## 背景

ADR-0070 打通了出站触发，ADR-0071 补上了入站读写，但插件仍然贡献不了任何界面：`BaseScreenPluginContribution` 只有 material / command / dataResourceType / blueprintCapability 四类，面板、视图、检查器槽位都不存在。结果是插件只能"弹一个会改文档的按钮"，扩展系统不成环——没有面向用户的表面，状态变更也就没有可观察的入口与反馈。

本决策只解决**最小闭环**：让插件贡献一个面板，面板显示当前设计状态，用户操作后回写可撤销事务，提交结果再流回面板。

## 决策

1. 新增 `kind: 'panel'` 贡献：`{ id, name, tagName }`。`id` 为 ASCII 标识、`name` 为 rail 标签、`tagName` 必须是合法 custom element 名。身份按 `panel:<id>` 参与既有的跨插件冲突检测。
2. **复用物料的信任模型，不新增能力（capability）**。构造函数由宿主 `registry` 端口解析（ADR-0029：宿主负责加载、审核与信任来源；Base Screen 不 fetch、不 dynamic import），同 realm ABI，preflight 阶段解析失败即失败关闭。这与 `material` 贡献完全同构。
3. 面板的 `model` 直接复用 ADR-0071 的 `BaseScreenPluginDesignSnapshot`，不新增状态类型。写入不触及 canonical 文档。
4. 面板经 `base-screen-plugin-panel-action` 事件回传 `{ panelId, commandId, args }`。Engine 用绑定时已知的 `panelId` 做一致性拒绝，然后路由到该插件自己的贡献命令。
5. **面板路径允许携带真实 `args`**；ADR-0070 的 chrome 路径继续传 `args: null`。命令可达性仍由 manager 的"声明 + 授权"集合决定，面板冒充别的面板 id 不会获得更高权限。
6. 只做左栏一处位置，元素挂在宿主分组之后并保持容器末尾。不引入 `when` 语言、工具栏、任意 DOM 注入、视图注册表或具名槽位协议——这些仍属 ADR-0070 推迟的范围。
7. 面板刷新挂在两个点：`emitChange`（提交/撤销/重做/替换文档，**不经** `renderInteraction`）与 `renderInteraction`（选区变化）。model 按"文档代际 + 选区"指纹去重赋值，避免高频渲染路径反复触发面板重绘造成抖动。

## 后果

- 插件第一次有了面向用户的表面，且闭环可视：面板渲染状态 → 交互 → 读快照算补丁 → 写回事务 → 新快照回流面板。
- 两条实现约束由验证得出，改动左栏渲染时须保持：
  - 宿主分组每次渲染都**移除再追加**自己的 tab，面板 tab 若不保持容器末尾，rail 键盘导航顺序会被静默改变（已有一次 ArrowDown 因此落到面板上）。
  - 只挂 `renderInteraction` 会让面板在文档提交后静止；`emitChange` 才是覆盖提交/撤销/重做的点。
- 面板可见性目前等价于"宿主是否激活该插件、registry 里是否有该标签、是否传入 `pluginPanels`"，宿主无法在不激活插件的前提下单独禁止面板。需要更细粒度时再加 capability。
- 验证：`packages/plugin-core/tests/plugin-core.test.ts` 覆盖 panel 身份与 tagName 规则、动作 detail 的 fail-closed 解析；`packages/plugin-manager/tests/manager.test.ts` 覆盖 registry 解析、未注册/查询抛错/一标签多面板三类失败路径；`packages/engine/tests/common/operations/plugin/designer-plugin-panels.test.ts` 覆盖归属拒绝、快照隔离与刷新指纹；`scripts/browser-harness/plugins/assert-plugins.mjs` 端到端跑通并断言位移正好等于面板给的 20 而非 chrome 默认的 40（args 丢失会指名报 `ARGS_LOST`）。
