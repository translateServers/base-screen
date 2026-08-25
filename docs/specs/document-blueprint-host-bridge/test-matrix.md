# Document Blueprint Host Bridge Test Matrix

> 状态：全部通过

| 需求 | 自动化验证 | 验收重点 |
| --- | --- | --- |
| R1 整屏上下文 | `contracts/tests/types/blueprint-authoring.test.ts` + Engine authoring bridge unit | 完整文档、多组件、detached、初始定位不限制范围；已通过 |
| R2 请求与提交 | Contracts request parser + Engine public API + browser harness | 无选择可请求；提交只回传完整 Blueprint；已通过 |
| R3 事件投影 | Engine authoring bridge unit + browser harness | 在用物料去重、事件描述、payload schema、capability 异常失败关闭；已通过 |
| R4 会话守卫 | Engine guard unit + browser harness | 取消、卸载、跨实例、revision/document stale、跨组件提交与单次撤销；已通过 |
| R5 轻量外壳 | DOM/controller unit + browser harness | 顶栏宿主入口、组件只读摘要、无图/表单/节点编辑控件；已通过 |
| R6 边界与质量 | lint/typecheck/build/API/boundary/browser/tarball/verify | 包与依赖零变化；`pnpm verify:browser` 与 `pnpm verify:m0` 已通过 |
