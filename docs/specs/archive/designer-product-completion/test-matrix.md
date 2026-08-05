# Designer Product Completion 测试矩阵

> 状态：已验证
> 最近更新：2026-08-05
> 依据：[spec.md](./spec.md)

本矩阵先冻结责任包和目标 case。实施时必须把“目标测试”替换或补充为实际文件与完整 case 名，并在每个
新增 case 中反向标注 Requirement。`Planned` 不代表已有证据。

## Task 1 实施前基线

2026-08-05 在当前 Base Screen 工作区重新执行以下命令，所有有测试的目标均通过；结果只用于记录当前
能力和缺口，不替代后续 Requirement 回归测试。

| 命令 | 结果 | 当前可证明范围与缺口 |
| --- | --- | --- |
| `pnpm --filter @base-screen/plugin-core test` | 1 file，14 cases 通过 | strict Manifest/parser/catalog 具备覆盖；没有 style schema/panel。 |
| `pnpm --filter @base-screen/material test` | 1 file，2 cases 通过 | 只覆盖 text Material 的 manifest/no-side-effect；没有官方形状、图片、容器或 data state。 |
| `pnpm --filter @base-screen/engine test` | 16 files，49 cases 通过 | 覆盖现有 session、operation 与 DOM controller；没有 Task 2 的 palette delegation、direct preview registration 或多项闭环回归。 |
| `pnpm --filter @base-screen/renderer test` | 0 test files，命令按 `--passWithNoTests` 成功 | Renderer configuration lifecycle、subtree painter order 和 resource invalidation 没有自动化覆盖。 |
| `pnpm exec vitest run packages/core/tests/hierarchy/hierarchy.test.ts` | 1 file，28 cases 通过 | Core hierarchy 已证明 root subtree painter order；Renderer 尚未投影该规则。 |
| `pnpm verify:browser` | 通过 | Chromium harness 在 1024x640、1440x900、1920x1080、390x844 生成当前 Base Screen screenshot；harness 仅映射 text/rectangle 到 `base.text`，不能证明真实官方物料。 |

已记录的 Task 2 gap：material palette 只读取 event target dataset；Renderer 建立后 catalog/resource
configuration 可漂移；direct preview 假定 Viewer 已注册；Renderer 以 flat zIndex 绘制而违反 Core root
subtree painter order；每次 render 都会重启全部 host-resource resolve。

## Requirement 到测试

| Requirement | Task | 目标测试与证据 | 状态 |
| --- | --- | --- | --- |
| R1 来源与范围 | 1、12 | provenance verifier、`scripts/verify-tarballs.mjs` 和 `pnpm verify:m0` | Implemented |
| R2 可信基线 | 1、2 | `packages/renderer/tests/renderer.test.ts`: `R2 keeps every root subtree within its Core painter-order span`, `R2 does not restart an unchanged host-resource resolve for unrelated edits`; `packages/renderer/tests/viewer.test.ts`: `R2 rejects renderer configuration drift until unload releases the renderer`; `scripts/verify-browser-harness.mjs`: material child click and direct preview flow | Implemented |
| R3 真实官方物料 | 3、4 | `packages/material/tests/index.test.ts`: `R3 publishes valid Chinese manifests and matching constructors without registration`, `R3 auto-registers exactly the official Material tags`; `packages/renderer/tests/renderer.test.ts`: `R3 updates a mounted Material model without replacing its element`; `scripts/verify-browser-harness.mjs`: official registry, rectangle, ellipse, image, container, palette, design/preview/viewer and Material event assertions | Implemented |
| R4 声明式内容样式 | 3、5 | `packages/plugin-core/tests/plugin-core.test.ts`: style schema/panel and `color` parser cases; `packages/renderer/tests/renderer.test.ts`: invalid style fail closed; `packages/engine/tests/browser/controllers/designer-panel-controller.test.ts`: section and Manifest control projection; `scripts/verify-browser-harness.mjs`: Enter commit, invalid draft ARIA/message and editable shortcut assertions | Implemented |
| R5 统一作者操作 | 2、5、6、7、8 | `designer-operation-registry.test.ts`、`designer-gesture-controller.test.ts`、`verify-browser-harness.mjs` | Implemented |
| R6 图层完整性 | 7 | `designer-layers-controller.test.ts`、`designer-layers-dom.test.ts` | Implemented |
| R7 精确画布 | 8 | `designer-canvas-aids.test.ts`、`designer-workbench-controller.test.ts`、browser harness | Implemented |
| R8 工作台视觉质量 | 5、7、8、9 | `designer-style.test.ts`、`check-designer-styles.mjs`、browser screenshots | Implemented |
| R9 数据与交互渐进集成 | 4、10 | `designer-panel-dom.test.ts`、`designer-interaction-dom.test.ts`、Material/Renderer regressions | Implemented |
| R10 Canonical Blueprint 作者能力 | 11 | `designer-integration-controller.test.ts`、`designer-blueprint-dom.test.ts`、browser harness | Implemented |
| R11 隔离与可访问性 | 2-11 | dual Designer browser workflow、DOM/controller tests、style verifier | Implemented |
| R12 发布级证据 | 1、12 | `pnpm verify:browser`、`pnpm verify:m0`、tarball consumers | Implemented |

## 计划文件

实施优先复用现有测试边界；只有超过文件阈值或形成独立责任时新增文件。

| 责任 | 计划位置 |
| --- | --- |
| Manifest appearance contract | `packages/plugin-core/tests/*.test.ts`、`packages/plugin-sdk/tests/*.test.ts` |
| Official Materials | `packages/material/tests/*.test.ts`、Material browser conformance |
| Painter/resource correctness | `packages/renderer/tests/renderer.test.ts` 或职责拆分测试 |
| Operation/shortcut | `packages/engine/tests/common/operations/*.test.ts`、`packages/engine/tests/common/tools/*.test.ts` |
| Multi-select/guide gesture | `packages/engine/tests/browser/controllers/designer-gesture-controller.test.ts` |
| Inspector | `packages/engine/tests/browser/controllers/*panel*.test.ts`、Designer DOM tests |
| Layers | `packages/engine/tests/browser/controllers/designer-layers-controller.test.ts`、Designer DOM tests |
| Ruler/snap | `packages/engine/tests/browser/viewport/*.test.ts`、gesture/browser tests |
| Data/Interaction | Engine DOM tests、Renderer resource tests、Material data-state tests |
| Events/Blueprint | Engine Blueprint DOM/controller tests、Core compile/evaluate regression |
| Visual/browser | `examples/browser-harness/`、`scripts/verify-browser-harness.mjs`、Designer style verifier |
| Provenance/package | provenance verifier、boundary/API/no-side-effect/tarball scripts |

## 反向映射规则

- 每个新增 test case 在名称或相邻注释中标注 `R1`-`R12` 中至少一个 Requirement。
- 一个 case 覆盖多个 Requirement 时列出全部编号，不使用“Designer coverage”泛化标签。
- case rename、move 或 delete 必须在同一变更中更新本矩阵。
- screenshot 只证明视觉输出；结构、行为、contrast、overflow 和隔离必须有独立 assertion。
- Nebula test、snapshot 或 screenshot 不作为自动化输入；所有 fixture 和 golden 由 Base Screen 当前代码生成。

## 质量门顺序

1. 受影响文件 format 与 focused package tests/typecheck/build。
2. Engine/Renderer/Material browser workflow 与 visual assertions。
3. API、package boundary、no-side-effect 和 provenance/package-content checks。
4. Tarball consumers 与 runtime regression。
5. `pnpm verify:m0`。
