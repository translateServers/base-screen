# Designer 事件 Blueprint 候选评估报告（已归档）

> 状态：已归档；2026-08-10 用户决策图形整体延后，本期不引入依赖
> 评估日期：2026-08-10
> 依据：[ADR-0019](../../../decisions/ADR-0019-designer-specialized-editor-dependencies.md)、ADR-0026、[专项 Spec](../../../specs/archive/designer-event-blueprint/spec.md)
> 证据位置：仓库外临时目录 `%TEMP%\opencode\designer-event-blueprint-spike-20260810`
> （`results/raw-results.json`、`results/raw-browser.json`、`results/raw-bundle.json`、`results/report.txt`，
> 以及 `rete-own-renderer-correction/` 的纠正 spike 产物）；主仓库 manifest 与 lockfile 全程未修改

## 1. 结论（已归档）

2026-08-10 完成的四个方案 spike 结论：X6 预算超限；Rete 自有 DOM/SVG renderer 技术可行但 postinstall 硬门禁
且无实质收益；Dagre 仅布局可选；零依赖原生最干净但图形交互内核自研周期最长。用户决策：**图形整体延后**，
本期不实现图形 UI、不引入任何图库、不向宿主转嫁图形契约；表单闭环 + Core trace 为本期范围（见 ADR-0026）。

本报告保留为未来图形需求恢复时的参考基线；届时须重新执行 ADR-0019 评估。

## 2. 统一评估协议（2026-08-10 执行）

### 2.1 私有接口

三个 spike 使用同一 Base Screen 自有接口，候选只实现以下能力，不暴露第三方类型或状态：

```ts
interface GraphAdapter {
  connect(host: HTMLElement, model: GraphModel, callbacks: GraphCallbacks): void;
  update(model: GraphModel): void;
  disconnect(): void;
}
```

`GraphModel` 只含临时 node/edge geometry、selection 和 viewport；canonical rule 是 fixture 的唯一输入来源。
候选不得写入 document/history，所有连接都只返回 Base Screen 自有 connection intent。

### 2.2 统一 fixture 与动作

fixture 包含两个线性规则（`trigger -> condition -> set-variable -> emit-host-event -> host-action` 与
`trigger -> emit-host-event`），并包含失效 capability、无效事件和受预算约束的 payload。每个消费者执行投影、
框选、多选移动、合法/非法连线、缩放（25%–200%）、平移、适应、MiniMap、键盘等价操作、Shadow DOM、双实例和
断连清理 case（共 17 个）。

### 2.3 量化与证据

- 体积使用实际生产消费者 Vite 入口的 minified+gzip delta；不以 npm 解包体积替代。
- 供应链记录精确 package 版本、许可证、直接/传递依赖、install/postinstall 脚本、漏洞审计日期/registry 和维护状态。
- 命令证据：各隔离消费者 `pnpm install`（Rete 纠正 spike 使用 `--ignore-scripts`）、
  `npm view <package> version license dependencies peerDependencies time dist-tags`、
  `pnpm audit --registry=https://registry.npmjs.org --audit-level=low`（默认镜像无 audit endpoint，故显式指定
  npm 官方 registry）、`node tools/build-and-measure.mjs`、`node tools/browser-run.mjs`（Chrome 149.0.7827.55
  headless）。
- 官方参考：[X6 repository](https://github.com/antvis/X6)、[Selection](https://x6.antv.antgroup.com/tutorial/plugins/selection)、
  [MiniMap](https://x6.antv.antgroup.com/tutorial/plugins/minimap)、[Rete integration](https://retejs.org/docs/concepts/integration/)、
  [Dagre repository](https://github.com/dagrejs/dagre)。

## 3. 候选记录（归档数据）

| 方案 | 精确版本 | 许可证 | 直接/传递依赖 | 硬门禁 | gzip delta | 性能 | 结论 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| X6 | `@antv/x6@2.19.2`、Selection `2.2.2`、MiniMap `2.0.7` | MIT | 3 direct / 4 transitive，7 runtime packages | 失败：gzip 预算 | +138,638 B（约 135.4 KiB） | connect 42.5 ms；首帧 42.9 ms；load 81.4 ms；1×59 ms long task；17/17 cases | 归档：预算超限拒绝；另有 3.x 插件发布损坏与 MiniMap click-to-locate 死代码风险 |
| Rete + 自有 DOM/SVG renderer | `rete@2.0.6`、area `2.3.2`、connection `2.0.5` | MIT | 3 direct / `@babel/runtime@7.29.7`，4 runtime packages | 失败：`rete@2.0.6` 声明 `postinstall`；其余已测门禁通过 | +19,587 B（约 19.1 KiB，含自有 renderer） | connect 4.9–5.2 ms；首帧 35.9–41.5 ms；load 38.6–46.5 ms；无 long task；17/17 cases | 归档：技术可行但 postinstall 硬门禁 + 无实质收益 |
| 原生 DOM/SVG | 浏览器平台 | 不适用 | 0 | 通过已测硬门禁 | +4,402 B（约 4.4 KiB） | connect 17.5–17.9 ms；首帧 17.7–18.3 ms；load 40.6–41.2 ms；无 long task；17/17 cases | 归档：零依赖回退基线 |
| 原生 DOM/SVG + Dagre layout | `@dagrejs/dagre@3.1.1`、`@dagrejs/graphlib@4.0.5` | MIT | 1 direct / 1 transitive，2 runtime packages | 通过已测硬门禁 | +20,019 B（约 20.0 KiB） | connect 17.7–18.7 ms；首帧 17.9–19.0 ms；load 36.7–38.6 ms；无 long task；17/17 cases | 归档：仅布局可选，有近期 semver churn 风险 |

共同结果：统一 fixture 投影为 7 nodes/5 edges，无游离节点和多分支；合法 action 插入产生唯一一次模拟
`replace-blueprint` history write；非法 capability、非法目标和 pointer cancel 保持 canonical bytes 与 history
不变；Shadow DOM、双实例和 disconnect/reconnect 清理 case 通过。Rete 的纠正 spike 证明自有 DOM/SVG renderer
可运行全部 17 个 case；不能以“没有官方无框架 renderer”作为技术不可能的依据。

### 3.1 供应链、维护与移除明细

- **X6**：运行时完整图为 `@antv/x6@2.19.2`、Selection `2.2.2`、MiniMap `2.0.7`、`@antv/x6-common@2.0.16`、
  `@antv/x6-geometry@2.0.5`、`utility-types@3.11.0`、`lodash-es@4.18.1`；均 MIT，无 install/postinstall script，
  2026-08-10 npm registry audit 无已知漏洞；核心仓库活跃，旧插件线较旧。
- **Rete**：纠正 spike 以 `pnpm install --ignore-scripts` 完成，运行时完整图为 `rete@2.0.6`、
  `rete-area-plugin@2.3.2`、`rete-connection-plugin@2.0.5`、`@babel/runtime@7.29.7`；均 MIT，audit 无已知漏洞。
  `rete` 声明 `postinstall: node postinstall.js`（评估中未执行），违反 ADR-0026 字面硬门禁；connection plugin
  自 2024-08-30 起无新发布。
- **原生 DOM/SVG**：无 runtime package、许可证或安装脚本；移除路径为删除私有 adapter 与测试。
- **Dagre**：`@dagrejs/dagre@3.1.1` + `@dagrejs/graphlib@4.0.5`，均 MIT、无 install script，audit 无已知漏洞；
  短期多次 major release，若未来采用必须精确 pin。

## 4. 评分表（归档）

通过硬门禁后按 ADR-0019 评分；未通过硬门禁者不参加总分排序。本表仅作为未来恢复图形需求时的参考。

| 方案 | 功能/工期 25 | 架构 20 | 正确性/a11y 15 | 供应链/许可 15 | 体积/性能 15 | 可替换 10 | 总分 | 推荐 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| X6 | — | — | — | — | — | — | 不评分 | 硬门禁失败 |
| Rete + 自有 DOM/SVG renderer | — | — | — | — | — | — | 不评分 | postinstall 硬门禁失败 |
| 原生 DOM/SVG | 23 | 20 | 14 | 15 | 15 | 10 | **97** | 首选（若图形恢复且接受自研周期） |
| 原生 DOM/SVG + Dagre layout | 24 | 19 | 14 | 13 | 13 | 9 | **92** | 次选，仅布局 |

## 5. 决策记录

2026-08-10 用户选择“A：图形整体延后”——不实现图形 UI，不引入图库，不向宿主转嫁图形契约；表单闭环 + Core
trace 为本期范围（ADR-0026 已接受，专项 Spec 生效）。若未来恢复图形需求，以本报告为基线重新执行 ADR-0019
评估；任何候选合入前须更新 ADR、Spec、boundary whitelist、manifest/lockfile 与许可证记录。
