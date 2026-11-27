---
'@base-screen/engine': patch
'@base-screen/host-kit': minor
'base-screen': minor
---

行为生成补齐 ADR-0115 D2 推迟项，修复浏览器核对中发现的问题。

- `host-kit`：
  - 筛选联动支持 `reset: true`（再点同一项恢复原值，编译成蓝图条件分支）；
  - 新增「设状态」联动 `{ kind: 'state', from, event, to, state }`，按状态名或色调指向指标已声明的状态，`reset` 恢复按判定显示；
  - 指标状态支持 `{ source: 'level-scale' }`，按引用数据集上宿主给的 `levelScales` 生成，没有分级表时不编译并记 `AGENT_STATE_LEVEL_SCALE_UNAVAILABLE`；
  - `IntentBehaviorSummary.kind` 增加 `set-state`；会话摘要带上指标已有的状态名；
  - 局部修改里指标阈值的简写（`rules` / `suggested` 写在 set 顶层、`states` 写成数组）折成 `states`。
- `engine`：草案层渲染时带上变量取值（画布已有的沿用当前值，草案新增的取初值），智能体生成的联动参数在草案上不再报「变量没有值」。
