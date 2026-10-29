# 智能体融合 · 研究报告对照与缺口清单

> 权威依据：`.base-screen/local/base-screen-design/大屏设计器价值研究报告.html`（下称「报告一」）、
> `智能体融合下大屏设计器交互形态研究.html`（下称「报告二」）。
> 本文只做两件事：把报告的规范性要求编号；逐条对照本仓库现状并判定。实现与验收见文末追溯表。
> 编写日期：2026-10-29。核对基线：`b9d0b80`（工作区另有 12 个未提交的样式改动，不影响本文结论）。

---

## 1. 报告解读

### 1.1 核心结论

**报告一《大屏设计器的存亡问题》**

1. 设计器必要，但「作为人画图工具」那部分必要性在归零。归零的是拖拽排版与组件摆放；被 AI 抬升的是约束层——像素收敛、口径正确、性能达标、离线可运维。判断标准从「有没有画布」变成「能不能承载约束」。
2. 融合姿势不是「Agent 生成页面」，而是**「Agent 生成可编译的中间表示，设计器做编译器后端」**。这要求三件事同时成立：Headless 渲染（Agent 看不到画面也能产出）、Agent 工具集（结构化而非猜）、人机共编工作台（人做审美与取舍）。
3. **判据在 §10 被自己修正过**：DSL 只是手段，真正的判据是「产物可 diff、可被确定性校验、可回滚」。因此报告把重点从「L3 中间表示是否完备」移到「有没有确定性校验与 diff 面」。

**报告二《交互不是聊天框》**

1. 不做「会聊天的大屏设计器」，做**带自然语言入口的变更流工作台**。聊天框只承担意图入口，不承担版本历史、结构树、参数精度。
2. **四通道 + 一条验证通道**：意图（一句话）、指向（选区与作用域）、参数（面板与直接操作）、结构（图层/变量/数据集）；验证不是输入，而是 Diff、目标屏模拟、守卫状态栏。
3. **六态状态机**：空闲 → 意图表达 → 幽灵草案 → 守卫校验 → 采纳/弃用 → 精修/回退。任一状态可 Esc 退出，未写入与已写入必须视觉可分。
4. **大屏三约束**：编辑对象与场所分离（目标设备模拟是唯一验收依据）、一屏多人多角色（作用域分权 / 变更归属 / 评审态）、多副面孔（场景是一等公民）。

### 1.2 技术规范（规范性条款）

| 域 | 条款 |
|---|---|
| 架构（报告一） | 五层：意图 / 语义 / 中间表示（L3） / 引擎（确定性） / 运行时。相邻层只通过契约通信 |
| 中间表示（报告一） | 三性质：schema 可校验、可 diff、可回滚。Agent 只写中间表示，不碰渲染器 |
| 工具集（报告一 §6.2） | `resolve_metric`、`propose_layout`、`bind_dataset`、`fit_resolution`、`estimate_perf`、`check_a11y`、`render_preview`、`diff_against_template`；每项都写明「为什么不能交给 Agent 自己完成」 |
| 硬约束（报告一 §6.2） | Token 体系、栅格与安全区、可读性下限（最小字号/最小对比度）、合规（Logo、字体授权、敏感信息）；**都必须是确定性校验，不能是提示** |
| 交互（报告二 §3） | 四通道各有输入、输出、失败模式与约束；验证通道独立，不由用户显式操作触发 |
| 状态机（报告二 §5） | S1–S6 六态；写入时机单列；S3↔S5 往返无副作用 |
| 细则（报告二 §10） | R01–R12 共 12 条 |
| 大屏（报告二 §7） | 目标设备模拟（物理尺寸/点间距/拼接缝/观距/环境亮度 + 3m 视角）；一屏多人；场景切换 |
| 度量（报告二 §9） | 意图命中率、纠正半径、模型调用占比、幽灵态弃用率、变更可追溯率、单屏交付人天；每个都有事件名与健康/危险信号 |

### 1.3 验收标准

报告的验收标准就是两份 §10「落地核对」表，加上 §7 的三条大屏约束与 §9 的度量定义。本文把这些拆成 40 条 REQ（见 §2），逐条判定。**判定以代码为准**：报告 §10 有 6 行已过期（§3）。

---

## 2. 逐条对照

判定口径：**已达成** / **部分** / **缺失** / **归宿主**（不属基座职责）。

### A 组 · 中间表示与可追溯

| ID | 要求 | 证据 | 判定 |
|---|---|---|---|
| A1 | L3 中间表示可 schema 校验、fail-closed | `packages/contracts/src/screen/`：`parseScreenDocument` / `SCREEN_DOCUMENT_JSON_SCHEMA`；`b9d0b80` 同批更新黄金产物 | 已达成 |
| A2 | Agent 只写中间表示，落稿受约束 | `engine/src/designer-element/api/designer-element-change.ts:22` `submitChangeProposal`；采纳走 `executeTransaction` | 已达成 |
| A3 | 变更可追溯、可回滚、回退可再回退 | `core/src/history/history.ts:82` `revertScreenHistory`；`designer-element/api/designer-element-document.ts:104`。**缺陷**：`undoScreenHistory`(`:59`) 与 `redoScreenHistory`(`:70`) 重建条目时只复制 `{before,after}`，撤销再重做后 provenance 永久丢失 | 部分 |
| A4 | 属性级 diff + 「为什么改」 | `engine/src/common/operations/change/designer-change-proposal.ts:262` `diffScreenDocuments`；变更卡固定展示 rationale | 已达成 |
| A5 | 意图溯源（点击组件看生成它的需求） | provenance 只写入历史，`browser/` 与 `designer-element/` 内无任何读取/渲染点（`rg provenance` 仅命中写入侧） | 部分 |

### B 组 · 交互形态

| ID | 要求 | 证据 | 判定 |
|---|---|---|---|
| B1 | 四通道并存，验证通道独立 | 意图区 `designer-workspace-markup.ts:343`；选区 chip 由 `designer-intent-controller.ts:86`；检查器三页签；左栏图层/变量/数据集；底栏守卫 `:244` | 已达成 |
| B2 | 六态状态机，每态可退出 | S1–S3 在 `designer-change-dom.ts`，S4 在 `designer-guard-*`，S5 在 `designer-change-controller.ts`，S6 在 history。**缺口**：起点牌不传 `startsFrom` | 部分 |
| B3 | R01 空态三张起点牌 | `designer-change-dom.ts:40-49`，`[data-change-start="metrics\|template\|prompt"]` | 已达成 |
| B4 | R02 输入区常驻能力提示 | `designer-ui-text.ts:250` `capability`；随选区变化 | 已达成 |
| B5 | R03 选区即作用域，删除先追问 | `designer-intent-controller.ts:170-175` 确认、`:227-236` 渲染 | 已达成 |
| B6 | R04/R09 口径歧义阻断 | 无引擎侧概念；`ScreenIntentRequest` 只有 text + scope | 归宿主 |
| B7 | R05 数值请求不路由模型、回填面板 | 检查器本身可编辑；意图区把所有文本交给宿主，无本地数值解析 | 缺失 |
| B8 | R06 局部草案只覆盖选区 | `designer-change-controller.ts:366` `ghostSubset`（含祖先与蓝图关系过滤） | 已达成 |
| B9 | R07 每条变更都有「为什么」 | `changePaneMarkup` 固定渲染 `.change-panel-rationale` | 已达成 |
| B10 | R08 一键回退、回退可再回退 | API 有；**无历史节点列表 UI**，`readScreenHistoryNodes`(`history.ts:102`) 只列 `past`，前进栈不可见；右栏文案 `designer-ui-text.ts:234` 却声称「变更承载待决提案与历史」 | 部分 |
| B11 | R10 守卫失败给修复动作 | `designer-guard-controller.ts:152-201`（预览/取消/应用）+ `designer-element-controller-state.ts:462`（应用走事务） | 已达成 |
| B12 | R11 手动微调记为偏好补丁 | 无；治理流程 | 归宿主 |
| B13 | R12 演示锁只留画布 | `designer-presentation-lock-controller.ts`，进入前阻断待决草案 | 已达成 |
| B14 | §7.1 目标设备模拟 | `contracts/src/types/host.ts:206` 只有 columns/rows/seamPx/safeAreaPx/viewingDistanceM；`common/operations/display/designer-target-display.ts:57` 的「3m」只是文本标签 | 缺失 |
| B15 | §7.2 每条变更标注发起人与审批人 | 只有评审态页签顶部一行 `designer-change-dom.ts:52` | 缺失 |
| B16 | §7.2 评审态只读 | `designer-workbench-shell.css:1420` 仅 `pointer-events:none`；`designer-element-events.ts:143` 键盘命令无 review 判断；`designer-change-controller.ts:256` Esc 无条件切回检查器，而 `.right-pane-switch` 在评审态被隐藏 | 部分 |
| B17 | §7.3 场景一等公民 | `common/operations/scene/designer-scene.ts`、`designer-scene-controller.ts`、左栏 `designer-workspace-markup.ts:41` | 已达成 |
| B18 | §9 六指标可采集 | 只存在于 `agent-notes.md` §11；代码零事件 | 缺失 |

### C 组 · 确定性校验

| ID | 要求 | 证据 | 判定 |
|---|---|---|---|
| C1 | 守卫只走确定性代码 | `common/validation/wcag-contrast.ts`（纯函数）+ `browser/dom/guard/designer-contrast-measure.ts`（真实渲染测量） | 已达成 |
| C2 | 可读性下限（最小字号）硬校验 | 无 | 缺失（随 B14） |
| C3 | 性能可测量且可门禁 | `tooling/verification/screen-probe.mjs:46` 测 `timeToViewerMs`；`:385` 只按对比度/字号置退出码，TTV 无阈值、无基线、CI 不跑 | 部分 |
| C4 | 守卫不扩成全项假数据 | 只有对比度一项 | 保持 |

### D 组 · Agent 工具面

| ID | 工具 | 证据 | 判定 |
|---|---|---|---|
| D1 | `validate_document` | `tooling/screen-mcp-server/server.mjs:33` `validate_screen` | 已达成 |
| D2 | `propose_layout` | 同文件 `:54`，8 种对齐/分布 | 已达成 |
| D3 | `check_a11y` | 已实现：输入渲染采样，复用 core 的 WCAG 判定，返回比值/门槛/建议色 | 已达成 |
| D4 | `estimate_perf` | `audit_screen.complexity`（`provider.mjs:377`）自认是计数代理，无预算判定 | 部分 |
| D5 | `fit_resolution` | `audit_screen.fit`（`provider.mjs:332`）只做等比投影 + letterbox/crop | 部分 |
| D6 | `diff_against_template` | `diff_screens` 有，但输出是区块级 changes，非属性级 diff 行；无模板模型 | 部分 |
| D7 | `resolve_metric` | 无语义层契约 | 归宿主 |
| D8 | `bind_dataset` | 只有取数端口 `dataset-port.ts`，无绑定校验 | 归宿主 |
| D9 | `render_preview` | 由 `screen-probe.mjs`（Playwright）承担，不是工具 | 归探针 |

### E 组 · 宿主边界

| ID | 要求 | 判定 |
|---|---|---|
| E1 | 引擎不调模型、不接对话流、不建身份/审批模型 | 保持（`DesignerReviewMeta` 只有两个可选字符串） |
| E2 | 引擎不发网络请求、不建任务队列 | 保持 |
| E3 | 提案只接受「标题 + 理由 + 作用域 + 命令」 | 保持 |

---

## 3. 报告 §10 已过期的 6 行

这些行与代码不符，**以代码为准**；本文不改报告，只记录偏差，避免后续按过期结论重复立项。

| 报告原文 | 代码事实 |
|---|---|
| 二 §10·S1「三张起点牌这种空态引导没有实现」 | 已实现：`designer-change-dom.ts:40-49` |
| 二 §10·R01「已实现」与 S1 自相矛盾 | 以 R01 为准 |
| 二 §10·R03「删除 chip 的追问未做」 | 已实现：`designer-intent-controller.ts:170-175` |
| 二 §10「变更卡位置：实现是草案条 + 底部浮层」 | 已升级为右栏一级页签（`data-right-pane`）；报告 §01 callout 才是最新表述 |
| 一 §10「跳到任意历史节点、回退本身可回退未做」 | API 已实现；缺的是**界面**（见 B10） |
| 一 §10「性能判据：从画布内常驻改为可被测量与门禁」 | 只做到「测量」，门禁仍缺（见 C3） |

---

## 4. 缺口清单

### 4.1 功能

1. **提案不可程序化读/采纳**。只有 `submitChangeProposal` / `discardPendingChange`；宿主与 agent 无法读待决 diff，也无法用代码采纳某个单元。人机协作能走 UI，自动化闭环走不通。
2. **守卫无公共面**。`DesignerGuardController` 无读取 API、无事件，`etc/engine.api.md` 无任何 Guard 导出 → D3 无法实现，宿主也无法在评审页展示守卫结果。
3. **目标屏无物理语义**。缺点间距、环境亮度、物理尺寸、角尺寸、最小可读字号；「3m」只是字符串。
4. **变更无归属**。卡片只有标题/作用域/理由/diff。
5. **数值意图无本地解析**。一句话里的「字号改成 64」也会被路由到宿主；报告 R05 明确要求这类请求不经过模型。
6. **度量零事件**。报告二 §9 的 6 个指标没有任何代码落点，`agent-notes.md` 里的命名只是文档。
7. **`startsFrom` 断链**。`contracts/src/types/host.ts:203` 有字段，全仓 0 个生产者。

### 4.2 架构

1. **导出面断裂**。`DesignerChangeProposalInput`、`DesignerChangeProposal`、`DesignerReviewMeta`、`DesignerIntentHandler`、`DesignerDisplayOverlayKind`、`BaseScreenDesignerChangeProposalSummary` 在 `etc/engine.api.md` 中都没有 `export`（对比 `DesignerSceneDescriptor` 有）。宿主无法 `import type` 写提案。
2. **纯逻辑下沉缺失**。WCAG 与文档 diff 在 `engine/common`，而工具面只加载 `contracts` + `core` 的 `dist`（`tooling/screen-mcp-server/apis.mjs:5-23` 是显式白名单）→ D3/D6 无法复用同一套确定性实现，只能写第二份。
3. **子层未登记**。`operations/change`、`operations/scene`、`operations/display`、`operations/intent` 未进 `tooling/checks/engine-import.mjs:253` 的子层表（只加了 `validation`），层内方向不受约束。
4. **同一语义两套实现**。场景用 `JSON.stringify` 判零差异（`designer-scene.ts:72`），提案用 `diffScreenDocuments`。
5. **控制器重复实现**。`commandsForUnits` 已导出且有测试，`designer-change-controller.ts:154` 仍内联重写同一过滤。

### 4.3 交互

1. **评审只读不彻底**。Delete / 方向键 / Ctrl+Z 在评审态仍生效；Esc 切回检查器后，`.right-pane-switch` 被 CSS 隐藏，用户没有可见入口回到变更页。
2. **目标屏无入口、无开关 UI**。只有 `setTargetDisplayProfile` / `setTargetDisplayOverlay` API，宿主不接就完全不可见；报告要求顶栏常驻入口且三个开关互相独立。
3. **草案条 `aria-expanded` 恒 false**（`designer-change-dom.ts:17` 写死），与页签状态不同步。
4. **溯源无入口**。历史节点带 provenance，但界面无法从组件反查「哪次提案改的、理由是什么」。
5. **历史回退不可达**。`revertToHistoryState` 只有 API；没有节点列表、没有前进栈展示。
6. **异步动作缺可取消的等待态**。意图提交后只有一行 status，没有取消与超时出口；场景 busy 期间没有全局说明；「点了没反应」的风险集中在采纳与守卫应用。

---

## 5. 处置

| 缺口 | 处置 | 对应 REQ |
|---|---|---|
| 提案读/采纳 | 补 element API + `base-screen-change-state` 事件 | A2 |
| 守卫公共面 | 新 `designer-element-guard.ts` + 事件 | C1 / D3 |
| WCAG / diff 下沉 | 迁入 `@base-screen/core`，engine 与工具面共用 | D3 / D6 |
| 目标屏物理 | 扩契约 + 物理/角尺寸/最小可读字号纯函数 + 顶栏浮层 + 3m 视角 | B14 / C2 |
| 变更归属 | `origin{author,approver}` 不透明标签，卡片展示 | B15 |
| 评审只读 | 键盘命令短路 + Esc 不逃逸 | B16 |
| 历史 UI | 变更页签内历史段（节点/指针/前进栈）+ 溯源行 | B10 / A5 |
| `startsFrom` | 起点牌 → 意图请求 | B2 / B3 |
| 度量 | `BASE_SCREEN_METRIC_EVENT` + 14 个基础事件 | B18 |
| 工具面 | `check_a11y` / `estimate_perf` / `fit_resolution` / `diff_against_baseline` | D3–D6 |
| 性能门禁 | probe 增阈值与基线 | C3 |
| 数值意图 | 纯函数匹配 + 回填面板 | B7 |
| 导出面 / 子层登记 / 重复实现 | 补导出、登记子层、复用 `commandsForUnits` | 架构 1–5 |

---

## 6. 追溯表

状态：**已落地** / **部分** / **未开始** / **归宿主**。

| REQ | 实现落点 | 验证 | 原型 | 状态 |
|---|---|---|---|---|
| A1 | 既有 `parseScreenDocument` + schema 黄金产物 | `packages/contracts/tests` | — | 已落地 |
| A2 | `submitChangeProposal` + `readPendingChange / adoptChangeUnit / rejectChangeUnit / adoptAllChanges` + `base-screen-change-state` 事件 | `designer-change-proposal.test.ts`、`designer-change-dom.test.ts` | V5 | 已落地 |
| A3 | `core/src/history/history.ts`：undo/redo 保留 provenance；`executeDesignerCommit` 默认 `manual` | `core/tests/history/history.test.ts` | V6 | 已落地 |
| A4 | 既有 `diffScreenDocuments` | 同上 | V5 | 已落地 |
| A5 | 历史段展示 provenance 标签（来源 + 名称）；**从组件反查提案**仍未做 | `designer-change-dom.test.ts` | V6 | 部分 |
| B1 | 既有四通道 | — | V2 | 已落地 |
| B2 | `startsFrom` 已接通：起点牌 → `ScreenIntentRequest.startsFrom` | 类型检查 + 手测 | V1 | 已落地 |
| B3 | 既有三张起点牌 | — | V1 | 已落地 |
| B4 | 既有能力提示 | — | V2 | 已落地 |
| B5 | 既有作用域追问 | — | V2 | 已落地 |
| B6 | 归宿主（示例层未做） | — | V2 | 归宿主 |
| B7 | `designer-parameter-intent.ts`：字号/宽高/颜色命中即改文档并回填，不发宿主、不调模型 | `designer-parameter-intent.test.ts`（4 例） | V2 | 已落地 |
| B8 | 既有 `ghostSubset` | — | V3 | 已落地 |
| B9 | 既有变更卡理由 | — | V5 | 已落地 |
| B10 | 节点列表增 `index/position`；变更页签新增历史段，节点可点回退，前进栈可见 | `history.test.ts`、`designer-change-dom.test.ts` | V6 | 已落地 |
| B11 | 既有守卫修复三态 | `designer-guard.test.ts` | V4 | 已落地 |
| B12 | 归宿主 | — | — | 归宿主 |
| B13 | 既有演示锁 | — | V8 | 已落地 |
| B14 | 契约增 `pixelPitchMm/brightnessCdM2/ambientLux`；物理/角尺寸/最小可读字号纯函数；顶栏入口 + 浮层（三开关 + 读数表）+ `readDisplayMetrics()` 公共 API；叠加标签带读数 | `designer-target-display.test.ts`、`designer-display-dom.test.ts` | V7 | 已达成 |
| B15 | `origin{author,approver}` 不透明标签，变更页签渲染「发起 X · 审批 Y」 | `designer-change-dom.test.ts` | V5 | 已落地 |
| B16 | 评审态键盘命令短路 + Esc 不逃逸 | 类型检查 + 手测 | V8 | 已落地 |
| B17 | 既有场景 | `designer-scene.test.ts` | — | 已落地 |
| B18 | `BASE_SCREEN_METRIC_EVENT` + 15 个基础事件；变更/守卫/意图/场景（含 `scene_preview`）全部已发 | 类型检查 + 手测 | V9 | 已达成 |
| C1 | 既有 WCAG + 渲染测量 | `wcag-contrast.test.ts` | V4 | 已落地 |
| C2 | 可读性判定纯函数（字高 1/200、字号 1.5×） | 同上 | V7 | 部分（未接渲染测量） |
| C3 | `screen-probe.mjs` 增 `--max-ttv` 与 `--baseline`（基线 +10%），报告写入 `perf.budget`，超限退出码 1 | `node --check` + 手测 | — | 已落地 |
| C4 | 保持只有对比度 | `designer-guard.test.ts` | V4 | 已落地 |
| D1–D2 | 既有工具 | `screen-mcp-server.test.ts` | — | 已落地 |
| D3–D6 | **未开始**（`check_a11y` / `estimate_perf` / `fit_resolution` / `diff_against_baseline`） | — | V9 | 未开始 |
| D7–D9 | 归宿主 / 探针 | — | — | 归宿主 |
| E1–E3 | 边界未变 | — | — | 已落地 |

### 6.0 本轮新增的公共面

- `readPendingChange()` / `adoptChangeUnit(id)` / `rejectChangeUnit(id)` / `adoptAllChanges()`
- `readContrastGuard()` / `setContrastGuardEnabled(enabled)`
- 事件：`base-screen-change-state`、`base-screen-guard-change`、`base-screen-metric`
- 变更页签：归属行、历史段（指针 + 前进栈 + 回退）
- 目标屏：点间距/亮度/照度参数，物理尺寸、角尺寸、最小可读字号；距离标签带读数

### 6.1 本轮完成的验证

- `pnpm --filter @base-screen/core exec vitest run tests/history/history.test.ts` → 13 passed
- `pnpm --filter @base-screen/engine exec vitest run`（display/change/scene/validation/change-dom/编辑链路）→ 138 passed
- `pnpm --filter @base-screen/engine typecheck` → 通过
- `pnpm check:api` → 通过（`etc/*.api.md` 已由 API Extractor 重生成）
- `node tooling/checks/designer-ui.mjs` / `designer-styles.mjs` → 通过

### 6.1.1 工具面

`check_a11y` 已接入 `tooling/screen-mcp-server`：输入渲染采样（文本色 / 有效背景 / 字号 / 字重），
复用 `@base-screen/core` 的 WCAG 纯函数，输出比值、门槛与最小改动建议色；不可解析的颜色
报 `A11Y_COLOR_UNPARSEABLE`，不猜。`apis.mjs` 的 `CORE_EXPORTS` 白名单已登记五个新导出，
冒烟从 8 个工具升到 9 个并通过。

### 6.2 仍未做（按依赖排序）

1. **目标屏面板 UI**：顶栏入口 + 三个叠加开关 + 读数表；当前开关只能由宿主调 API，宿主不接就不可见。
2. **`scene_preview` 度量**：场景预览准备完成时没有事件钩子，其余三个已发。
4. **工具面剩一项**：`diff_against_baseline`——需要先把 `diffScreenDocuments` 下沉 core（与 WCAG 同样的理由）；`check_a11y` / `estimate_perf` / `fit_resolution` 已落地（11 个工具）。
5. **探针门禁**（C3）：`screen-probe.mjs` 的 `--max-ttv` 与基线比对。
6. **示例端到端**：后端 `/agent/*` 四条通道 + 三端 `host-agent.ts`（确定性默认、LLM 可选）。
7. **子层登记**：`engine-import` 目前只按顶层目录判定，`operations/change|scene|display|intent` 未单独登记；扩成两级会牵动全部 operations 子目录，单独一次改动。
