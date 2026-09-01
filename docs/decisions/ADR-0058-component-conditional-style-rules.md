# ADR-0058：组件条件样式规则（数据驱动投影）

> 状态：部分已取代（决策 6 的 Designer 内建编辑器由 [ADR-0066](./ADR-0066-host-owned-conditional-style-authoring.md) 取代）
> 日期：2026-08-17
> 关联：[ADR-0002](./ADR-0002-canonical-screen-document.md)、[ADR-0005](./ADR-0005-renderer-dom-shadow-dom-and-product-elements.md)、[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)、[ADR-0023](./ADR-0023-host-dataset-resource-integration.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)

## 1. 背景

宿主有大屏预警诉求：组件绑定的数值超过阈值时，字体颜色等样式自动变化（如变红）。当前 Base Screen 没有对应能力：

- Viewer 是纯展示，没有事务入口，宿主无法在运行期修改组件样式。
- Designer 虽有 `executeTransaction` + `update-components`（patch style），但由宿主命令式改样式会污染历史与脏标记，且预警逻辑要求每次数据刷新后重评估，命令式通道语义不匹配。
- Blueprint 的 action 只有 `set-variable` / `emit-host-event` / `host-action`，trigger 是组件事件而非数据变化，不能表达「数据投影后持续求值」的条件样式。

按 ADR-0027 的所有权划分：数据查询、聚合、轮询归宿主（不变）；「数据 → 样式的投影」是渲染职责，属于 Base Screen 的渲染内核。Renderer 已经在 `dataState` ready 时把投影后的数据交给物料 model，条件样式是在同一投影点上对 `style` 的确定性派生，不引入新的宿主边界。

## 2. 决策

1. `ScreenComponentNode` 新增可选 `styleRules?: readonly ScreenComponentStyleRule[]`，随组件存储、复制、序列化。每条规则是严格 JSON-safe 对象：

   ```ts
   interface ScreenComponentStyleRule {
     readonly id: string; // 组件内唯一，1..64 码点
     readonly when: {
       readonly path: readonly string[]; // 指向组件 dataState.value 内的路径，0..8 段、每段 1..64 码点；空数组表示值本身
       readonly operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
       readonly value?: ScreenJsonValue; // 字面量右操作数，受既有 JSON budget 约束；exists 不带 value
     };
     readonly style: ScreenJsonObject; // 命中时合并的样式键值
   }
   ```

   单组件最多 8 条；operator 集合与 Blueprint condition 对齐。Contracts 解析 fail-closed：未知键、超限、重复 id、非法字面量均拒绝，不做剥离、默认或强制转换。

2. 求值锚点是组件自身的 `model.dataState.value`——即物料已经接收的投影值：静态数据源为静态值，`host-resource` 为绑定投影后的适配值。`dataState` 非 `ready`（idle/loading/error）时全部规则不命中。`gt` 等序比较仅对有限数生效，`contains` 仅对字符串与数组生效，类型不匹配视为不命中而非错误。规则不引用变量、其他组件数据或宿主对象。

3. Renderer 在构造物料 model 前求值：effective style = canonical `style` 与命中规则的 `style` 按规则数组顺序逐键合并（同键后写覆盖先写）。每条规则的 `style` 键必须是该物料 Manifest `styleSchema` 声明的顶层键，且合并结果经 `styleSchema` 校验——与 ADR-0016 决策 6 同一路径；非法规则样式与该组件现有非法 style 同路径 fail-closed（不改动已挂载渲染树，按既有诊断通道上报）。effective style 只存在于运行时 model，不回写文档。

4. 数据刷新自动重评估：宿主经既有 `resourcePort` / `refreshData` 更新数据，投影产生新 `dataState` 时规则随之重求值，宿主零命令式样式修改。设计态走同一 Renderer 路径，静态数据源与已解析数据即时呈现预警效果。

5. Core `update-components` 的 `ScreenComponentPatch` 新增 `styleRules`（整体替换语义，同 `style`）；锁定组件及其后代的既有拦截规则不变（非 status-only patch）。历史、脏标记、`base-screen-change` 经既有事务通道生效，不新增命令类型。

6. Designer 属性面板新增「条件样式」区：有界内建编辑器，复用既有内建控件（operator 下拉、值输入、路径输入、按 `stylePanel` 声明的样式控件与三段式调色板），编辑草稿校验后恰一条事务提交，与 ADR-0016 决策 5 的「合法草稿才入文档」一致。宿主也可经公开事务/作者桥直接读写 `styleRules`，不新增专用宿主 API。

## 3. 非目标

- 阈值计算、轮询调度、告警通知、告警中心等业务逻辑（归宿主）。
- 以变量、其他组件数据、表达式语言或任意函数作为条件源；不接 CSS 字符串、`calc`、DOM 或宿主服务对象。
- 修改 Blueprint 的 trigger/action 集合；条件样式与事件 Blueprint 正交。
- 条件 props、条件几何/显隐、动画或过渡编排。
- 新增依赖或 package。

## 4. 排除方案

- **Blueprint 扩展 `set-style` action**：拒绝。Blueprint 是事件驱动的一次性分发，条件样式要求数据投影后持续重评估（含初次渲染与每次刷新），语义不匹配。
- **宿主命令式事务改样式**：拒绝。Viewer 无事务入口；Designer 下污染历史与脏标记，且要求宿主同步渲染内部状态，违反 ADR-0027 渲染归属。
- **物料内部自评估**：拒绝。阈值规则散落在各物料实现中，无法统一校验、编辑与序列化，Manifest 也无法声明。
- **宿主注入 render callback 或 DOM 补丁**：拒绝。不可序列化、不可校验、不可审计，违反 ADR-0005 与 ADR-0028 的 ABI 边界。

## 5. 结果

- 宿主以声明式文档数据表达「数值超阈值变红」等预警样式，数据刷新即自动生效，Viewer 与 Designer 同路径一致呈现。
- Canonical `style` 保持静态基线语义不变；无 `styleRules` 的旧文档零迁移、渲染结果逐像素一致。
- 规则校验复用 Manifest `styleSchema` 与既有 fail-closed 渲染通道，不引入第二套样式校验语言。
