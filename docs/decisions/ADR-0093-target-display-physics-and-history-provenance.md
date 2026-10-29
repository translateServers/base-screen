# ADR-0093：目标屏物理参数、可读性判定与历史来源完整性

> 状态：已接受
> 日期：2026-10-29
> 关联：ADR-0092（变更提案、幽灵草案与事务来源标注）、ADR-0027（轻量基座与宿主处理）。
> 本 ADR 修订 ADR-0092 的三处：事务来源的默认值、目标屏参数范围、评审态只读范围。

## 背景

研究报告要求「目标设备模拟是唯一验收依据」，并给出物理尺寸、点间距、拼接缝、观距、环境亮度五个参数与「3 米视角」。ADR-0092 只落地了 `columns / rows / seamPx / safeAreaPx / viewingDistanceM`，`3m` 在实现里只是 `designer-target-display.ts` 拼出来的一段文本——没有物理尺寸、没有角尺寸、没有最小可读字号。

同时，对照代码发现两个与 ADR-0092 字面要求不符的缺陷：

1. `undoScreenHistory` / `redoScreenHistory` 重建历史条目时只复制 `{before, after}`，撤销再重做后 `provenance` 永久丢失；设计器内的手动编辑也从未标注 `manual`。
2. 评审态只读只在 CSS（`pointer-events: none`）；键盘命令与方向键微调仍会改文档，Esc 还会把用户从变更页签切走——而评审态下页签切换按钮是被隐藏的，等于把评审人锁死。

## 决策

### 1. 目标屏参数与读数（契约加法）

`ScreenTargetDisplayProfile` 增加三个可选字段：

```ts
readonly pixelPitchMm?: number;   // LED 点间距，逻辑像素 → 毫米的唯一依据
readonly brightnessCdM2?: number; // 屏体亮度，只作验收输入
readonly ambientLux?: number;     // 现场照度，只作验收输入
```

引擎新增三个纯函数（`common/operations/display/designer-target-display.ts`）：

- `computePhysicalSize`：逻辑像素 × 点间距 = 物理毫米；缺点间距返回 `null`，不猜。
- `computeAngularSize`：按观距算水平/垂直视角（度）；缺观距返回 `null`。
- `computeMinimumLegibleFontPx`：**字高 ≥ 观距 / 200，字号 ≈ 字高 × 1.5**，再按点间距换回逻辑像素。两个常量集中在同一文件并被测试逐值比对。
- `evaluateDisplayReadability`：给出「要求字号 / 实测字号 / 是否达标」三项。

**可读性是信息项，不是守卫。** 守卫层保持只有对比度一项（报告二 §10）。可读性结论由目标屏面板展示，不阻断采纳；把它做成第二道守卫会让「守卫通过」变成两个来源，与「守卫只走确定性代码、只有一项」的既有约定冲突。

`<base-screen-designer>` 增加 `readDisplayMetrics()`，返回 `{ physical, angular, minimumLegibleFontPx, brightnessCdM2, ambientLux }`，宿主与面板读同一份，不各自换算。**参数仍不写入 Screen Document。**

### 2. 历史来源完整性

- `undoScreenHistory` / `redoScreenHistory` 复制条目时保留 `provenance`；「撤销再重做后来源消失」视为缺陷修复，不是新特性。
- `readScreenHistoryNodes` 返回 `{ index, position, provenance? }`，其中 `position` 为 `past | current | future`。`future` 是撤销或回退留下的前进栈，界面需要把它画出来，否则「回退可再回退」无法被发现。
- 设计器内的直接编辑默认标注 `{ source: 'manual' }`（`executeDesignerCommit` 注入）；宿主显式提供 provenance（采纳提案、应用场景）时原样保留，不覆盖。

### 3. 评审态只读

- 评审期间 `onKeyDown` 短路所有命令与方向键微调，Esc 交回上层状态机。
- 变更控制器的 Esc 在评审态不再切回检查器：评审页签是唯一出口，退出走 `exitReviewMode` / 面板上的「退出评审」。
- 评审态仍允许缩放与平移（view only），不阻断审阅。

### 4. 对比度判定下沉 `@base-screen/core`

WCAG 计算（解析、合成、亮度、比值、门槛、建议色）从 `engine/common/validation` 迁到
`core/src/validation/contrast.ts`，engine 改为从 `@base-screen/core` 引入。

原因：工具面（`tooling/screen-mcp-server`）只加载 `contracts` 与 `core` 的 `dist`，且依赖是
显式白名单；判定留在 engine 就意味着工具面要么复制一份公式，要么永远做不出 `check_a11y`。
复制公式会出现两套阈值，正是报告反对的「两套没有门禁比对的副本」。

`tooling/screen-mcp-server/apis.mjs` 的 `CORE_EXPORTS` 同步登记 `parseCssColor`、`contrastRatio`、
`minimumContrastRatio`、`suggestReadableColor`、`formatCssColor`。

### 5. 变更与守卫的公共面

- `readPendingChange / adoptChangeUnit / rejectChangeUnit / adoptAllChanges`：宿主与 agent 能读摘要、
  逐条采纳；`adoptAllChanges` 是宿主显式调用，等价于用户完成二次确认。
- `readContrastGuard / setContrastGuardEnabled`：读到的是最近一次真实渲染的测量结果，`checked: 0`
  表示没测过，不等于通过。
- 事件：`base-screen-change-state`、`base-screen-guard-change`、`base-screen-metric`。
- 度量只发事件（15 个基础名），不计算指标、不联网；指标口径与采集归宿主。
- 变更页签新增历史段与归属行；历史段读 `readScreenHistoryNodes`，回退走 `session.revertTo`。

## 影响

- `@base-screen/contracts`：`ScreenTargetDisplayProfile` 三个可选字段（加法）。
- `@base-screen/core`：历史条目复制保留来源；节点列表增加 `position`（`ScreenHistoryNode` 形状变化，属破坏性但仅影响直接消费该结构的调用方）。
- `@base-screen/engine`：目标屏读数 API、`manual` 默认来源、评审只读短路、`startsFrom` 透传。
- 明确不做：亮度/照度的渲染模拟（无法在浏览器里伪造现场观感）、按目标屏物理尺寸 1:1 渲染、第二道可读性守卫、Actor/Role 模型。

## 已知限制

- 「3m 视角」仍是呈现层的缩放与距离标注，不是光学模拟；本 ADR 只保证**读数**（物理尺寸、视角、最小可读字号）是算出来的。
- 实测最小字号需要渲染后测量；本轮只提供读数与比对函数，尚未接入渲染测量。
- 评审态只读依赖键盘通道短路；指针拖拽已由既有 CSS 阻断，但命令面板的鼠标入口未逐一收口。
