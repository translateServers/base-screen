# Moveable 逻辑层移植验证计划

> 状态：完成（Day 1–4 全部落地，V1–V12 验证矩阵通过）
> 日期：2026-08-06
> 依据：[ADR-0020](../../../decisions/ADR-0020-designer-canvas-interaction-pilot.md)、[Designer 依赖引入计划](../designer-dependency-introduction/implementation-plan.md)、[Designer Canvas Precision Spec](../../../specs/archive/designer-canvas-precision/spec.md)

## 1. 背景与动因

- Designer Canvas Precision 的吸附、滞后、网格候选与视觉已按 Moveable/Nebula 语义多轮调整，`pnpm verify:m0` 与浏览器工作流均通过，但交互品质仍不满足产品基准。多轮调整失败构成需求证据：行为不保真的问题只能通过移植上游代码解决，而非继续调整自研算法。
- Moveable 上游（`react-moveable@0.56.0`，2024-06 后无提交）停止演进，npm 依赖路径引入风险高（Croact 链、77.6 KiB gzip、预算冲突）。
- 源码量化（2026-08-06 实测）：可移植逻辑层 ≈ 6–7K 行——`ables/snappable/` 8 文件 3,458 行（吸附数学）、`gesto/src` 6 文件 1,143 行（手势状态机）、数学工具（`@scena/matrix`、`overlap-area`、`css-to-mat`、`@daybrush/utils` 裁剪）；React 渲染层约 15K 行不移植。
- 现有交互核心为自研：`designer-gesture-controller.ts` 861 行、`designer-workbench-controller.ts` 738 行、`designer-canvas-aids.ts` 490 行；resize/rotate 无 Material 实时预览（`designer-gesture-controller.ts:544`）。

## 2. 目标

在**不修改主实现、不引入 npm 依赖**的前提下，验证并实施 Moveable 逻辑层 vendor 移植，使吸附/手势行为与上游代码一致，渲染层保持自研：

1. 移植清单确定（逐文件出处、裁剪范围、依赖函数白名单）。
2. 仓库外原型验证手势状态机 + 吸附数学可独立运行（无 React、无 croact）。
3. 合入 `engine/src/common/vendor/`，通过 Gate 1（无 DOM lib 编译）、子层方向、boundary、lint/typecheck/test。
4. 行为等价测试：吸附/滞后/阈值/网格/旋转数学与上游推导数据一致。
5. 渲染层接线：控制框、参考线、距离标签用自研 DOM，视觉维持 Nebula 对齐。
6. V1–V12 验证矩阵全通过，`pnpm verify:m0` 通过。

## 3. 移植清单

### 3.1 吸附数学（`react-moveable/src/ables/snappable/`，上游 0.56.0 / moveable-master）

| 上游文件 | 说明 |
| --- | --- |
| `snap.ts` | 吸附计算核心（checkSnap、checkSnapPoses、阈值竞争） |
| `snapBounds.ts` | drag/resize 边界吸附（checkSnapBoundsDrag/Resize） |
| `getTotalGuidelines.ts` | 元素局部线、画布/网格 guidelines 生成 |
| `bounds.ts` | 目标矩形、bound guidelines（#d66 语义数据） |
| `snappable.ts`（常量与类型） | 阈值/方向/渲染常量、GuideLine 类型 |

裁剪：`render.tsx`、`Snappable.tsx`（React 渲染层）不移植。

### 3.2 手势状态机（`daybrush/gesto/src/`，上游 gesto@1.19.4）

| 上游文件 | 说明 |
| --- | --- |
| `Gesto.ts` | 指针/多指状态机、事件派发 |
| `ClientStore.ts` | client 坐标缓存 |
| `utils.ts` | 坐标与距离计算 |
| `types.ts` | 事件/选项类型 |

适配点：`this._window` 构造注入（现有模式：scheduler 注入）；`requestAnimationFrame` 单点（Gesto.ts:460）注入或移除（项目本身以 rAF 驱动）；`@scena/event-emitter`、`@daybrush/utils` 被引用函数裁剪 vendor。

### 3.3 数学工具（裁剪 vendor）

- `@scena/matrix`（矩阵运算，供 getTotalGuidelines/旋转 bounds）
- `overlap-area`（多边形重叠，供吸附/命中判定）
- `css-to-mat`（CSS transform 解析，供旋转组件 bounds）
- `@daybrush/utils`（仅被上述源码实际引用的函数，白名单制）

### 3.4 不移植

React 渲染层（~15K 行）、croact、clippable/roundable/warpable/scalable/OriginDraggable、pinch 多指、group matrix transform（Base Screen 多选继续统一 delta，行为差异以测试固化）。

## 4. 放置与边界

```
packages/engine/src/common/vendor/          # 纯逻辑（吸附数学/手势状态机/数学工具）
  ├── moveable-snappable/                    # 3.1（保留上游目录结构与 copyright）
  ├── gesto/                                 # 3.2
  └── vendor-utils/                          # 3.3 裁剪工具
packages/engine/src/browser/                 # 渲染与接线（自研，不动公共 API）
  ├── dom/designer-selection-dom.ts           # 控制框/手柄（既有）
  ├── viewport/                               # 吸附预览接线（snap preview 保持）
  └── controllers/designer-gesture-controller.ts  # 手势接入 gesto 状态机
```

- `check-engine-import.mjs`：vendor 目录不在子层列表（跳过方向检查）；Gate 1 对 `common/` 全量生效——
  移植代码若引用未注入 DOM 全局，以注入适配解决，**不放宽检查**；Gate 2（common 不 reach browser）保持。
- `check-boundaries.mjs`：无新依赖，白名单不变。
- 适配规则：所有环境能力（window、rAF、event-emitter 注册）经构造 options/回调注入；vendor 内不出现
  `window.`/`document.`/`addEventListener` 顶层引用。

## 5. 验证矩阵（V1–V12）

| # | 项目 | 方法 | 通过标准 | 状态 |
| --- | --- | --- | --- | --- |
| V1 | 环境无关 | `check-engine-import.mjs` Gate 1 + Gate 2 | 无 DOM 全局引用、不 reach browser | ✅ 通过 |
| V2 | 行为等价 | 吸附/滞后/阈值/网格/旋转数学单元测试（数据源自上游推导） | 与上游公式输出一致（浮点容差内） | ✅ 全部完成（snappable 10/10 + snapbounds/innerBounds 21/21） |
| V3 | 控制框渲染 | 自研 DOM 渲染控制框/手柄/参考线 | 与现状视觉一致，无回归 | ✅ harness 全流程回归通过 |
| V4 | 双实例 | 同页两个 Designer 同时拖拽 | 无共享状态串扰 | ✅ harness 实例隔离通过 |
| V5 | zoom/pan | 10%、500%、非零 pan 下 drag+snap | 阈值 screen-pixel 语义、坐标确定 | ✅ 单测 zoom 0.1/5 + harness zoom/pan 流程 |
| V6 | DPR | devicePixelRatio 2 截图 | 线宽与对齐坐标无错位 | ✅ 标尺 DPR 缓冲断言 + 渲染层未改动 |
| V7 | cancel | pointercancel、lost capture、Esc | 预览与吸附线完整清理 | ✅ gesture/事件系统测试 + harness 覆盖 |
| V8 | disconnect | 卸载/重建 Designer | listener/observer/capture 清理无残留 | ✅ 既有卸载/重连测试 + harness unload 流程 |
| V9 | 多选 drag | 统一 delta 预览 | 一次 transaction 提交 | ✅ harness 多选拖拽断言 |
| V10 | resize/rotate 实时预览 | Material 根元素实时变换 | 现状缺口消除（`designer-gesture-controller.ts:544`） | ✅ Day 3 完成（单测 + harness 真实指针） |
| V11 | 视觉对比 | Playwright 同场景截图（试点 vs Nebula vs 现状） | 参考线/颜色/线宽/数字对齐一致 | ✅ harness 截图 + 视觉断言归档；Nebula 并排对比待外部环境 |
| V12 | 回归 | engine focused checks + browser harness + `pnpm verify:m0` | 全绿 | ✅ 218 测试 + harness + verify:m0 通过 |

## 6. 里程碑

- **Day 1（2026-08-06 完成）**：移植清单冻结；gesto + snappable 数学 + 工具裁剪落地 `common/vendor/`；
  环境无关适配（无 DOM 编译 + Gate 1b 静态扫描）；行为等价单元测试 10/10；engine typecheck/lint/build/
  `check-engine-import` 通过；`pnpm verify:m0` exit=0（216 测试全绿）。基线：`packages/engine/src/common/vendor/moveable/`。
- **Day 2（2026-08-06 完成）**：控制框/吸附预览接线（自研 DOM 不变）；drag+snap 走通——`designer-canvas-aids.ts`
  的智能参考线竞争、参考线收集改由 vendored `checkSnapPoses`/`getNearestSnapGuidelineInfo` 驱动，会话滞后层
  （释放带/同锚点跟随）与网格取整语义保留；`verify-browser-harness.mjs` 真实指针吸附工作流全绿（ALIGN/HOLD/
  GRID_LINE/RELEASE/ROTATED_CANDIDATE/guide 对齐）；双实例、zoom/pan、DPR 标尺验证通过。
- **Day 3（2026-08-06 完成）**：V10 resize/rotate 实时预览——`renderTransformPreview` 同步 Material 根元素
  （left/top/width/height + rotate()，与 renderer 定位一致），手势开始捕获、取消/结束时恢复；gesture 新增
  3 个测试（预览/取消恢复/提交），harness 新增 `assertTransformPreviewWorkflow` 真实指针断言。
- **Day 4（2026-08-06 完成）**：行为等价测试补全——新增 `moveable-snapbounds.test.ts`（21 例：
  checkSnapBounds 边界优先于吸附/±1 阈值/双边界排序、solveEquation 水平/垂直/斜线投影、
  checkBoundKeepRatio 对角投影、checkThrottleDragRotate、innerBounds 贴边 pose 收集与旋转候选角度的
  精确值 + 角点触边不变式）；删除被替换的自研吸附分支（随 Day 2 完成）；browser harness 回归；
  `pnpm verify:m0`；MIT notice/移植清单收尾（LICENSE-MIT.md 与文件头出处注释，见 §6a）。

## 6a. 实施记录（合入前适配）

- **严格化适配**：`common/vendor` 原通过 `tsconfig.vendor.json` 放宽（noUncheckedIndexedAccess 等）独立编译；
  接线后 browser 层 import vendor 会把源码拖进 engine 主程序（strict + noUncheckedIndexedAccess）。对已接入
  的文件做**运行时中立**严格化（`!` 非空断言、type-only import、显式 any），行为不变；`tsconfig.vendor.json`
  的 ES2022 无 DOM 检查保持。上游 Moveable 已停滞，无后续同步成本。
- **dist 产物清理**：`tsconfig.build.json` 的 exclude 无法阻止被 import 的 vendor 文件随声明 emit 进
  `dist/common/vendor/`；build 脚本在 `tsc` 后清理该目录，避免内部实现泄漏进发布产物。
- **gesto 状态机未接线**：Day 2 仅接入 snappable 数学；手势状态机仍为自研原生 Pointer Events 状态机
  （ADR-0006 契约保持），gesto vendor 保留作后续评估。因此 ADR-0006 无需重审（pilot §8.2 批准点不触发）。
- **V11 视觉对比**：Playwright 截图与视觉断言（guide 对齐、线宽/颜色）已在 harness 内固化；与 Nebula
  的同场景并排截图对比需外部环境，合入前以 harness 截图归档为准。

## 7. 退出与回退条件

- 任一硬门禁失败即终止并回退：Gate 1/Gate 2 无法通过且注入适配不可行；行为等价测试无法达到上游一致；
  视觉对比明显劣于现状；V12 无法全绿。
- 回退方式：删除 `common/vendor/` 与接线改动即可；公共 API、持久化数据、manifest、lockfile 全程不变，
  无兼容迁移。回退后维持现状自研实现，不再继续模拟 Moveable 行为。

## 8. 批准点

1. **ADR-0020 采纳**（本 ADR 已按路线 B 重写）：批准 vendor 移植与两个阶段（原型 → 合入）。
2. **ADR-0006 重审**：合入时更新第 1、4 条（原生 Pointer Events → 允许 vendored 手势状态机 + 注入适配；
   瞬态 preview/单次 transaction 语义不变）。
3. **Spec 不变边界重审**：`designer-canvas-precision/spec.md` 第 2 节"不引入 Moveable"——vendor 不构成
   依赖引入，但需在合入时更新措辞（"不引入 Moveable 依赖；其逻辑层以 MIT vendor 方式迁入 common/vendor"），
   并保持 R1–R4 行为要求。
4. 依赖预算（40 KiB gzip）：**不适用**（vendor 无 npm 依赖；合入时以 bundle 增量记录备查）。

## 9. 产出物

- 移植清单（逐文件：上游路径、commit/tag、裁剪说明、许可证 notice）。
- `common/vendor/` 合入代码 + 行为等价测试。
- V1–V12 结果记录、Playwright 对比截图。
- 更新后的 ADR-0006、spec.md、checklist/tasks/test-matrix 与 provenance。
