# Designer 事件 Blueprint 验收清单

> 状态：生效中（宿主作者桥范围）
> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 决策与边界

- [x] ADR-0026 已接受（2026-08-10）：图形路径整体延后，零新增依赖；候选评估已归档。
- [x] ADR-0028 已接受（2026-08-10）：Engine 内部表单作者 UI 范围移交宿主作者桥；宿主只提交 canonical Blueprint。
- [x] 现有 manifest、lockfile、boundary whitelist 与 license notice 均未增加第三方生产依赖。

## Canonical 与 Core

- [x] Contracts、JSON Schema、序列化和既有 dispatch 语义没有被扩展或改变。
- [x] Core trace 与 dispatch 使用同一求值内核，成功输出逐字段等价，错误码与定位一致。
- [x] trace 的 output/detached JSON 独立于 plan/state，不接触任何宿主 port、不写日志/遥测。

## 宿主作者边界

- [x] 内部事件面板只呈现事件摘要、能力状态与 JSON-safe 宿主作者请求入口，无 Engine 内部表单/图形作者工作流。
- [x] 请求入口携带 requestId、expected revision、component identity 与 blueprint 快照；不等待编辑器 Promise。
- [x] 组件切换、取消、关闭、reload、document replacement 与 dispose 后的过期提交 fail closed，不修改
  document/history 或其他实例。
- [x] 宿主只提交 canonical Blueprint，一次成功提交最多一个 history entry；无效候选不修改 document/history。
- [x] 图形布局、编辑器 draft 与长期 session 不进入 document、history、export、日志、遥测或 host payload。

## 质量与交互

- [x] 1024x640、1440x900、1920x1080、窄屏提示、light/dark、forced-colors、reduced-motion 视觉与可访问性通过。
- [x] 完整 pointer、keyboard-only、undo/redo、项目替换、能力撤销、双实例与清理矩阵通过。
- [x] Engine/Core focused gates、browser、API、boundary、license、consumer bundle、tarball 与 `pnpm verify:m0` 通过。
- [x] 本 Spec 与作者扩展 Spec 的 checklist、test matrix 与自动化证据双向同步。
