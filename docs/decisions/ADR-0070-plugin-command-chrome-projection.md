# ADR-0070: 插件 command 贡献的 Designer chrome 投影

> 状态：已接受
> 日期：2026-09-06
> 关联：[ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md)、[ADR-0015](./ADR-0015-runtime-contribution-authority.md)
> 范围：`kind: 'command'` 贡献的可选 `menus` / `shortcut`，以及 Designer 命令面板、更多→工具、画布右键的投影

## 背景

贡献命令已能经 `pluginCatalog` / `pluginCommandPort` 出现在命令面板，但插件无法声明其它作者入口。用户希望接近 VS Code 的 `contributes.commands` + menus + keybindings，而不是 Cordis、任意 DOM 或新的 contribution kind。

## 决策

1. `kind: 'command'` 增加两个可选字段：`menus` 与 `shortcut`。省略 `menus` 时仅出现在命令面板（零回归）。写出的 `menus` 是完整列表；`menus: []` 表示 handler 存在但不投影到任何 chrome。未知 menu 值、重复 menu、非法 shortcut 形状一律失败关闭。
2. 允许的 menu 字面量仅有 `commandPalette`、`menu.tools`、`context.canvas`、`context.component`、`context.multi`。不引入 `when` 语言、工具栏、检查器或任意 UI 注入。
3. Designer 在渲染时把已授权命令投影到对应 chrome。菜单项使用 `data-plugin-command`，不得使用 `data-menu-action`（避免进入 `DesignerOperationRegistry`）。点击与命令面板同一路径：`pluginCommandPort.execute({ commandId, args: null })`。
4. `shortcut` 永不覆盖内建操作、别名或工具 chord。目录内重复 chord 按贡献 id 稳定排序，后者丢弃快捷键；命令仍可通过菜单或面板调用。规范化与内建一致：`Cmd`→`Ctrl`，大写比较。
5. 不新增 contribution kind；不把 command 写入 ADR-0015 runtime contribution index；Engine 仍不依赖 plugin-manager。`activate()` 仍不获得 DOM 根、Store 或通用服务。变更插件集合仍须 `unload()` 后重新 `configure()`。

## 后果

- 宿主与插件作者可用声明式 menus/shortcut 把贡献命令接到现有 Designer chrome，而不打开任意 UI 面。
- 自定义视图 / SlotMap / Custom Element 槽位（VS Code Webview 或 DSH 具名槽）另立 ADR，不在本决策授权范围内。插件面板的最小闭环已由 [ADR-0072](./ADR-0072-plugin-panel-contribution-minimal-loop.md) 单独授权，且只覆盖左栏一处位置；其余 UI 注入面仍在此处推迟。
- 本决策只覆盖出站投影；插件读回当前文档与选区由后继 [ADR-0071](./ADR-0071-plugin-design-context-read-access.md) 决定，此处 `args: null` 触发语义不变（ADR-0072 只在面板路径放开真实 args）。
