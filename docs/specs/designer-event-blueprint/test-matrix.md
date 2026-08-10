# Designer 事件 Blueprint 测试矩阵

> 状态：实施中（图形路径延后）
> 依据：[spec.md](./spec.md)、[tasks.md](./tasks.md)

| Case | Requirement | 阶段 | 必要证据 |
| --- | --- | --- | --- |
| EB-R7-C01 | Core trace | Core | trace/dispatch 成功结果逐字段等价，真假 condition、多规则顺序、规则内变量顺序、三类 action、错误 path |
| EB-R7-C02 | Core trace | Core | detached JSON、事件 payload/表达式 budget、零 host port 调用 |
| EB-R7-C03 | authoring | Engine common | host-action payload 编辑/删除/原规则重排、actionId 只读、capability 推导、三个模板、单 history 原子性 |
| EB-R7-C04 | authoring | Engine DOM | 表单 trigger/condition/action/递归 expression、应用/取消与未保存保护、host-action 限制 |
| EB-R7-C05 | diagnostics/simulation | Engine DOM/browser | 问题定位、能力撤销、组件/事件失效、无效 payload、逐规则 trace、内存日志隔离 |
| EB-R8-C01 | dependency gate | 归档 | 2026-08-10 spike 证据归档；本期零新增依赖，无白名单/lockfile/notice 变更 |
| EB-R9-C01 | browser quality | Chromium | 完整 pointer 与 keyboard-only 流程、undo/redo、项目替换、窄屏提示、视口尺寸矩阵 |
| EB-R9-C02 | visual/a11y | Chromium | 空态、复杂规则、配置、问题、模拟、搜索；light/dark、forced-colors、reduced-motion |
| EB-R9-C03 | scale/release | Package/release | 表单分页、规则/动作过滤、合法极限 document、API、boundary、tarball、`pnpm verify:m0` |

每个新增或变更的测试名称必须保留 `EB-R7`、`EB-R8` 或 `EB-R9` 标记，并同步回链 Designer Full Product 矩阵。

## 候选评估归档（2026-08-10）

| Case | 状态 | 自动化证据 |
| --- | --- | --- |
| EB-R8-C01 | 已归档 | 仓库外 spike（`%TEMP%\opencode\designer-event-blueprint-spike-20260810`）：X6 17/17 但 gzip 增量 +138,638 B 超限；Rete 自有 DOM/SVG renderer 17/17（+19,587 B）但 postinstall 硬门禁；原生 +4,402 B、原生+Dagre +20,019 B；`pnpm audit`（npm registry，2026-08-10）0 漏洞；细节见 [候选评估报告](../../plans/designer-event-blueprint/dependency-evaluation.md) |

图形路径（投影/连接/session/MiniMap）不属本期验收范围（[ADR-0026](../../decisions/ADR-0026-designer-event-blueprint-authoring.md) 延后）；未来恢复图形需求时重新立项并执行 ADR-0019 评估。
