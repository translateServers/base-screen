# ADR-0020：Designer 画布交互逻辑层移植（Moveable/Gesto 源码 vendor）

> 状态：已采纳（实施中，见[移植验证计划](../plans/archive/designer-moveable-pilot/pilot-plan.md) §6/§6a 与测试矩阵）
> 日期：2026-08-06
> 重审：[ADR-0006](./ADR-0006-designer-engine-dom-interactions-and-history.md) 第 1、4 条
> 相关：[Moveable 逻辑层移植验证计划](../plans/archive/designer-moveable-pilot/pilot-plan.md)、[Designer 依赖引入计划](../plans/archive/designer-dependency-introduction/implementation-plan.md)

## 决策

1. **不引入 npm 依赖**。Moveable 上游（`react-moveable@0.56.0`，2024-06 后无提交）停止演进，改为将其
   **framework-agnostic 逻辑层源码 vendored 进 `@base-screen/engine`**，渲染层继续自研 DOM。原"引入
   moveable 包"路径废弃。
2. 移植范围（仅纯 TS 逻辑，合计约 6–7K 行，MIT 许可并保留上游 copyright notice）：
   - **吸附数学**：`react-moveable/src/ables/snappable/`（snap、snapBounds、getTotalGuidelines、bounds，
     约 3.5K 行）；
   - **手势状态机**：`daybrush/gesto/src/`（5 个核心文件约 1.1K 行；`_window` 通过构造 options 注入，
     `requestAnimationFrame` 单点通过 scheduler 注入，与仓库既有注入约定一致）；
   - **数学工具**：`@scena/matrix`、`overlap-area`、`css-to-mat` 与 `@daybrush/utils` 中实际被上述源码
     引用的函数（裁剪后随 vendor 一并迁入，不复刻 npm 依赖图）。
3. 渲染层（控制框、手柄、参考线、距离标签）**不自上游移植**，继续使用 `designer-selection-dom.ts` 与
   `designer-workbench.css` 的自研实现；视觉契约维持现有 Nebula 对齐（蓝色 #4af、2px/3px 分级、1px 渲染
   阈值、局部线）。行为契约（5px 捕获、距离竞争、滞后、网格候选）以移植的 snappable 数学为准。
4. 移植代码放置与边界：
   - 纯逻辑（吸附数学、手势状态机、数学工具）→ `packages/engine/src/common/vendor/`，由
     `check-engine-import.mjs` Gate 1（无 DOM lib 编译）自动把关环境无关性；DOM/环境能力一律构造注入。
   - 渲染与接线 → `browser/` 既有子层（`dom`/`viewport`/`controllers`），不新建公共 API。
   - `scripts/check-engine-import.mjs` 的 vendor 目录豁免与 `scripts/check-boundaries.mjs` 白名单**无需
     变更**（无新依赖、vendor 不被子层方向检查约束；如 Gate 1 因上游代码使用未注入全局而失败，则以注入
     适配解决，不放宽检查）。
5. 裁剪范围：不移植 clippable、roundable、warpable、scalable、OriginDraggable、pinch 与 React/croact
   渲染层；不移植 group 的矩阵化 group transform（Base Screen 多选继续使用统一 translate delta 语义，
   由移植后的数学验证）。
6. 本 ADR 批准"仓库外原型验证 + 移植合入"两个阶段。合入前完成：移植清单审查（逐文件出处）、MIT notice
   记录、R1–R4 行为等价测试（移植数学 vs 上游 math 快照）、browser 验证矩阵与 `pnpm verify:m0`。

## 动机

- Designer Canvas Precision 多轮调整后交互品质仍不满足产品基准；自研交互核心约 2,700 行且
  resize/rotate 无 Material 实时预览、旋转先走位置吸附等缺口，等价于维护一个不完整的 Moveable 分支。
- Moveable 上游停止演进（2024-06 后无提交、452 open issues），作为 npm 依赖引入的维护风险高于
  vendor：vendor 后行为由上游代码保证、裁剪与修复由本项目掌控，且不触碰依赖预算（40 KiB gzip）、
  lockfile 与 boundary 白名单。
- 源码量化：可移植逻辑层（snappable 3,458 行 + gesto 1,143 行 + 裁剪工具）约 6–7K 行；React 渲染层约
  15K 行不移植，避免 croact/React 兼容运行时进入 Engine（维持 ADR-0006/0019 的 framework-neutral 约束）。

## 准入条件

- 移植文件逐一对齐上游出处（文件路径 + commit/tag），全部保留 MIT copyright notice 与上游目录结构；
  新增 `LICENSE-THIRD-PARTY`（或等价 notice）记录。
- 移植代码不得引入全局状态、install script、运行时远程代码或公共 API 类型泄漏；不得 import
  `react`/`croact` 或任何第三方包。
- 行为等价：吸附/滞后/网格/阈值以移植数学的单元测试为准，测试数据从上游源码推导并记录来源。
- 通过 V1–V12 验证矩阵（Shadow DOM、双实例、10%–500% zoom、非零 pan、DPR、pointer cancel、disconnect、
  输入/IME 不劫持、Playwright 同场景截图对比试点 vs Nebula vs 现状）。
- 合入后删除被替换的自研吸附/变换分支，不保留双实现路径。

## 排除方案

- 引入 `moveable` npm 包（含 croact 链）：拒绝（上游停滞 + 依赖预算冲突）。
- 只抽取部分数学函数继续"参考重写"：拒绝（行为不保真，回到多轮调整循环）。
- 移植 React 渲染层或 croact 运行时：拒绝（framework-neutral 硬约束）。
- 以 npm 解包体积替代实际 bundle 与浏览器证据：拒绝。

## 后果

- 正面：吸附/手势行为由上游代码保证，消除"AI 重写行为不保真"循环；无新依赖、无预算变更；裁剪后体积
  远小于 77.6 KiB 完整包；上游停滞不再构成风险。
- 负面：本项目承担 vendored 代码的维护与漏洞响应（约 6–7K 行，远小于全量 3 万行）；需维护 MIT notice
  与移植清单；gesto 的 window/rAF 注入点需要适配；多选/组语义（统一 delta）与上游 group transform
  的差异需以测试固化。

## 实施记录（2026-08-06）

- 已合入：snappable 吸附数学接入 `designer-canvas-aids.ts`（drag/point 吸附竞争与参考线收集以上游
  `checkSnapPoses` 为准，会话滞后层保留）；resize/rotate Material 实时预览（V10）。
- 适配：vendor 接入后做运行时中立严格化（`!`/type-only import，行为不变）；build 后清理 `dist/common/vendor`
  声明泄漏。详见[移植验证计划](../plans/archive/designer-moveable-pilot/pilot-plan.md) §6a。
- 未接线：gesto 手势状态机（原生 Pointer Events 状态机继续承担手势编排，ADR-0006 契约未变，无需重审）；
  snapBounds/innerBounds（Base Screen 无 bounds 语义需求，保留 vendor 完整性测试于 Day 4）。
- interactjs 未被采纳：其 snap 缺释放带/同锚点跟随语义，与生效 Spec 契约不符（见依赖评估 §4.2）。
