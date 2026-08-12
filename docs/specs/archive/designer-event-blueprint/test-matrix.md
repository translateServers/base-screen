# Designer 事件 Blueprint 测试矩阵

> 状态：生效中（宿主作者桥范围）
> 依据：[spec.md](./spec.md)、[tasks.md](./tasks.md)

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| EB-R7-C01 | Core trace | Core | trace/dispatch 成功输出逐字段等价，含 condition 状态、规则顺序、规则原子变量顺序与动作 path |
| EB-R7-C02 | Core trace | Core | detached JSON 独立于 plan/state，受事件 payload/表达式 budget，零宿主 port 调用 |
| EB-R7-C03 | 宿主作者边界 | Engine DOM | 内部事件面板只呈现摘要/能力状态/请求入口；请求携带 requestId、expected revision、component identity 与 blueprint 快照 |
| EB-R7-C04 | 提交守护 | Engine DOM/browser | 有效提交单 history entry；陈旧 revision、组件删除、reload、dispose、跨实例提交 fail closed |
| EB-R7-C05 | 结构化事件 | Contracts/Engine | 事件 payload 校验、能力提示、Blueprint trigger 选择与 fail-closed 定位诊断 |
| EB-R8-C01 | dependency gate | 归档 | 2026-08-10 spike 证据归档；零新增生产依赖，lockfile/notice 未改 |
| EB-R9-C01 | browser quality | Chromium | 完整 pointer 与 keyboard-only 流程、undo/redo、项目替换、窄屏提示、双实例、窗口尺寸矩阵 |
| EB-R9-C02 | visual/a11y | Chromium | 摘要/能力/空态/复杂规则、light/dark、forced-colors、reduced-motion 与监听清理 |
| EB-R9-C03 | scale/release | Package/release | 合法极限 document 不崩溃、API、boundary、tarball、`pnpm verify:m0` |

每个适用的自动化测试用例必须保持 `EB-R7`、`EB-R8`、`EB-R9` 前缀标签，并与本 Spec 双向映射。

## 宿主编辑器交付物（作者扩展 Spec 承载）

- 宿主 Blueprint editor 的布局、节点位置、搜索、MiniMap、draft 与长期 session 属宿主；验证见
  [Designer Authoring Extension](../designer-authoring-extension/test-matrix.md) 的 AE-HB 系列 case。
- 宿主只通过 `@base-screen/*` exports 集成；图形布局不进入 document/history/export。

## 候选评估归档（2026-08-10）

| Case | 状态 | 自动化证据 |
| --- | --- | --- |
| EB-R8-C01 | 已归档 | 仓库外 spike（`%TEMP%\opencode\designer-event-blueprint-spike-20260810`）：X6 17/17 与 gzip 增量 +138,638 B（超限）；Rete 原生 DOM/SVG renderer 17/17（+19,587 B，postinstall 硬门禁拒绝）；原生+Dagre +20,019 B（仅布局可选）；`pnpm audit`（npm registry，2026-08-10）0 漏洞；细节见 [候选评估报告](../../../plans/archive/designer-event-blueprint/dependency-evaluation.md) |

图形路径（投影/缩放/session/MiniMap）不进入 Base Screen 验收范围（ADR-0026 延后 + ADR-0028 宿主归属）；
未来恢复图形需求时须重新立项并执行 ADR-0019 依赖评估。
