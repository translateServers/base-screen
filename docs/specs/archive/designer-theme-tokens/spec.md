# Designer Theme Tokens 规格

> 状态：已归档（历史验收记录）
> 最近更新：2026-08-07
> 定位：为 Designer Shadow DOM chrome 提供宿主可配置、边界明确的主题 Token
> 前置：[ADR-0024](../../../decisions/ADR-0024-designer-public-style-tokens.md)、[ADR-0017](../../../decisions/ADR-0017-designer-product-host-boundaries.md)、[Designer Workbench Control Styles](../designer-workbench-control-styles/spec.md)
> 计划：[Designer 外部样式 Token 实施计划](../../../plans/archive/designer-theme-tokens/implementation-plan.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 1. 目标

为 `<base-screen-designer>` 定义宿主可覆盖的 CSS Custom Property 主题契约。宿主 SHALL 能在不读取或修改
Designer Shadow DOM 的前提下，定制内建 dark/light 的 Designer chrome 色彩、文字、边框、语义状态、阴影、
动效、受限几何和 Designer 自有滚动条视觉。

本规格实现主题化视觉外观，不实现任意整体样式重写。宿主可使用普通页面 CSS 管理 Designer 元素的外部尺寸、
位置和页面布局；Engine 保持内部工作台结构和交互所有权。

## 2. 不变边界

- Canonical document、Core transaction/history、Renderer Material ABI、Project Adapter、SDK stable tag、package graph
  和 package exports 不变。
- Engine 保持 framework-neutral、单实例状态和私有 Shadow DOM；不引入 UI framework、CSS-in-JS runtime、外部
  stylesheet、公共 class、`::part`、stylesheet URL 或 Shadow DOM 样式注入。
- 公开前缀固定为 `--base-screen-designer-*`；现有 `--designer-*` 继续是私有实现细节，组件规则不得直接消费
  公共变量。
- 公共值仅是元素瞬态 CSS 输入，绝不进入 document、history、导入导出、project payload、日志、fixture 或
  host resource intent。
- Theme Token 只影响 Engine Designer chrome，不影响宿主页面、`body`、Viewer、Material 或 sibling Designer。
- `theme="light"` 保持 light fallback；缺失或未知 `theme` 保持 dark fallback。本规格不增加 `theme="system"`。
- forced-colors 和 reduced-motion 是内部无障碍策略；外部 Token 不得绕过它们。

## 3. Requirements

### R1：公共主题契约和私有映射

Engine SHALL 文档化并仅支持 `--base-screen-designer-*` allowlist。Tokens 层 SHALL 把每个公开名称映射到
一个私有 `--designer-*` 消费变量，并为内建主题提供 fallback。Controls、Base 和 Workbench 层 SHALL 继续
只使用私有变量。

外部 stylesheet、Designer 元素 inline style 与祖先继承 SHALL 能设置公开名称。优先级 SHALL 为：元素 inline
style、宿主 author stylesheet、当前 theme fallback、dark fallback。删除覆盖后 SHALL 恢复下一层有效值。

### R2：内建 dark/light 与主题覆盖

无外部覆盖时，dark 和 `theme="light"` 的既有 Designer 视觉、固定几何、单一 style node 和 CSS 层顺序 SHALL
保持。外部颜色和主题 Token 覆盖 SHALL 在两种内建主题中优先于 fallback，不得被主题切换覆写。

内建 Token 值 SHALL 在文字、关键图标、边界、focus 和状态反馈上满足既有对比度要求。`text-inverse`、
`accent-on`、`success-on`、`warning-on`、`danger-on` 仅在使用方和 contrast 证据已冻结后进入公开目录。

### R3：Token 分级和几何保护

主题级 Token SHALL 包括 surface、text、border、focus、semantic state、elevation、motion 和 scrollbar。受限几何
候选 SHALL 包括 spacing、control size、radius 和 typography；每一个候选在公开前 SHALL 记录 CSS grammar、
默认值、允许范围、消费者与 geometry 风险。

无法在规定 desktop/窄屏/可访问性场景中保持固定工作台几何的受限几何候选 SHALL 保持私有。结构级布局 Token，
包括 panel width、topbar/statusbar height、grid track、breakpoint、z-index、selector、DOM class、icon geometry
和 canvas coordinate，SHALL NOT 公开。

本次交付冻结以下公共 Token 目录。每个名称在 CSS 中使用完整
`--base-screen-designer-<name>` 形式：

| 家族 | 正式公开名称 |
| --- | --- |
| Surface | `surface-workspace`、`surface-panel`、`surface-raised`、`surface-control`、`surface-control-hover`、`surface-overlay`、`surface-canvas`、`surface-scrim`、`canvas-grid-line` |
| Text | `text-primary`、`text-secondary`、`text-muted`、`text-disabled` |
| Border | `border-subtle`、`border-default`、`border-strong`、`focus-ring` |
| Semantic | `accent`、`accent-surface`、`success`、`success-surface`、`warning`、`warning-surface`、`danger`、`danger-surface` |
| Elevation | `shadow-overlay`、`shadow-canvas`、`shadow-float` |
| Motion | `motion`、`motion-emphasis` |
| Scrollbar | `scrollbar-thumb`、`scrollbar-thumb-hover`、`scrollbar-track`、`scrollbar-corner` |

每个 Surface/Text/Border/Semantic/Scrollbar Token 接受 `<color>` 或透明色；Elevation 接受有效
`box-shadow` 值；Motion 接受有效 CSS transition duration/timing-function 序列。公共目录不包含 spacing、
control size、radius 或 typography，它们仍为私有实现 Token，后续只有在独立 ADR/Spec 提供范围限制和
geometry 证据后才能公开。`text-inverse`、`accent-on`、`success-on`、`warning-on`、`danger-on` 没有当前
消费者，保持未公开。

### R4：Designer 自有滚动条

Engine SHALL 为以下明确拥有的可滚动容器提供 `scrollbar-thumb`、`scrollbar-thumb-hover`、`scrollbar-track` 与
`scrollbar-corner` 主题 Token：菜单和 context-menu submenu、help dialog content、rail、properties、
blueprint workspace、direct preview 与 project workspace。规则 SHALL 同时使用可用的标准 `scrollbar-color` 和
WebKit pseudo-element 增强，不公开 scrollbar width/height。

Scrollbar Token SHALL NOT 命中 `body`、宿主元素、Viewer、Material light DOM 或 Material Shadow DOM。目标浏览器
的 scrollbar 原生绘制可以不同，但 thumb/track 状态的可读性与主题语义 SHALL 等价；forced-colors SHALL 保留
系统 scrollbar 语义。

### R5：隔离和生命周期

两个 Designer 实例可以拥有不同的 `theme` 和公共 Token 值，且不得彼此污染。外部 Token 覆盖、主题切换、
disconnect/reconnect 和 catalog 延迟初始化 SHALL 不重复注入 style node、不遗留跨实例状态，也不得改变 Material、
Viewer、宿主控件或 document body 的 computed style。

### R6：发布质量

每个 Requirement SHALL 映射到静态、unit、DOM 或真实浏览器证据。实施 SHALL 通过 Engine focused lint、
typecheck、test、build、browser harness、API、boundary、tarball 和最终 `pnpm verify:m0`。

## 4. 验收场景

| 场景 | 前置 | 操作 | 预期 |
| --- | --- | --- | --- |
| Dark 默认 | 无 `theme`、无公共变量 | 载入 Designer | 使用 dark fallback，既有几何不变 |
| Light 默认 | `theme="light"`、无公共变量 | 载入 Designer | 使用 light fallback，DOM 和几何不变 |
| 宿主 CSS 覆盖 | 宿主 stylesheet 设置公开颜色 Token | 载入或切换主题 | 覆盖在 Shadow DOM chrome 生效，优先于两种 fallback |
| Inline 恢复 | stylesheet 与 inline 设置同一 Token | 删除 inline 值 | 先采用 stylesheet，再恢复当前 theme fallback |
| 滚动条范围 | Designer、Material、宿主均有滚动区域 | 设置 Scrollbar Token | 仅 Engine owned scroll container 改变 |
| 双实例隔离 | 两个 Designer 使用不同 Token | 切换任一实例主题和覆盖 | 另一实例、Viewer、Material、body 不变化 |
| 可访问性 | dark/light、自定义主题、forced-colors、reduced-motion | 浏览控件与滚动区域 | 焦点、状态、系统高对比与 motion 行为可用 |

## 5. 完成定义

- ADR-0024 已接受，本规格已转为生效中后才允许运行时代码实施。
- 公共 Token allowlist、值语法、fallback、Token 分级、受限几何范围和 owned scroll container 清单均已冻结。
- R1-R6 有当前静态、unit、DOM、browser、package 与 tarball 证据的双向映射。
- `tasks.md`、`checklist.md` 的全部适用项均完成，Engine 相关质量门与 `pnpm verify:m0` 通过。
