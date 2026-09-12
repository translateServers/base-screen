# ADR-0071: 插件设计上下文只读访问

> 状态：已接受
> 日期：2026-09-09
> 关联：[ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md)、[ADR-0070](./ADR-0070-plugin-command-chrome-projection.md)
> 范围：`design.read` 能力、`BaseScreenPluginDesignSnapshot`、`PluginDesignReadPort`、Designer 公开 `selection` 只读

## 背景

ADR-0070 打通了出站投影（chrome → 插件 handler），2026-09-09 补齐了入站写入（插件 → `ScreenDocumentCommand` → 事务与 history）。但插件只写不读：`BaseScreenPluginActivationContext` 仅含 `commandPort`，`base-screen-designer` 也没有任何 selection 公共 API（选区只经 `base-screen-selection-change` 事件推给宿主）。

因此插件命令必须自带完整 patch，无法基于组件现状做增量计算，也无法只对选中对象生效。这是"插件能干活"的真实上限，也是任何插件侧界面（要先显示内容就必须能读状态）的前置。

## 决策

1. 新增能力 `design.read`。授予后 `activate(context)` 拿到 `context.designReadPort`，否则为 `undefined`。与 `command.execute` 同构：授予该能力但宿主未提供 `createDesignReadPort` 工厂时，激活以 `PLUGIN_CORE_CAPABILITY_INCOMPATIBLE` 失败关闭。
2. 端口只有一个方法 `read()`，返回**原子快照** `{ document, selectedComponentIds, focusedComponentId }`。文档与选区在同一次调用内取值，避免插件跨两次读取拼出撕裂状态。
3. `read()` 为异步，与 `PluginCommandPort.execute` 保持一致：`plugin-manager/remote-sandbox` 这类跨 realm 代理可满足同一形状，无需再改契约。
4. 快照是 JSON 往返得到的**私有深冻结副本**。插件写入不触及 canonical 文档；ESM 严格模式下再次赋值抛 `TypeError`，而不是静默无效。
5. 只做按需读取，不做变更通知。订阅式观测会引入生命周期、背压与取消承诺，且当前"命令触发时读一次"已覆盖按现状行动的需求。确有观测需求时另立 ADR。
6. `base-screen-designer` 新增公开只读 `selection`，返回 core 既有的 `ScreenInteractionState`。宿主不再需要靠事件重放重建选区。不新增类型、不新增跨包导出。
7. `createDesignReadPort` 是**可选** manager 选项，有意不同于必填的 `createCommandPort`：后者早于外部宿主出现，而给宿主入参新增必填键会破坏所有下游宿主编译；能力门控本身已保证"无工厂即无端口"。
8. 不借此放开 UI 注入面。`menus` 仍限 ADR-0070 的五个字面量，自定义视图 / SlotMap / 检查器面板另立 ADR。

## 后果

- 插件命令可只对选中组件生效，并按组件现状计算写入内容；这解除了"只能弹一个改常量的按钮"的上限。
- 单一 `requiredCapability` 无法表达"既要读又要写"的贡献命令：菜单项仍按单个能力门控，无选区时由 handler 返回诊断说明原因。多能力门控待出现实际需求再议。
- 快照按读取次数做 JSON 深拷贝，成本随 canonical 文档体积增长；文档体积已由 `contracts` 的字节上限约束，且读取只发生在用户动作触发时。
- 本决策的快照形状被后继 [ADR-0072](./ADR-0072-plugin-panel-contribution-minimal-loop.md) 直接复用为插件面板的 `model`，未新增状态类型；"按需读取、不做变更通知"的边界在面板侧同样成立（宿主推送，不提供订阅）。
- 验证：`packages/engine/tests/common/operations/plugin/designer-plugin-design-read-port.test.ts` 覆盖私有副本、深冻结与无文档失败关闭；`packages/plugin-manager/tests/manager.test.ts` 覆盖能力门控、会话失效后拒读与可选入参；`scripts/browser-harness/plugins/assert-plugins.mjs` 端到端跑真实 UI，并以反向对照确认断言能抓到"忽略选区"的实现（`DECOY_MOVED` 快速失败，而非 30s 超时）。
